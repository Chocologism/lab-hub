import json
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import exists

from ..database import get_db
from ..models import ArxivPaper, PaperReadMark, PaperComment, User, RecommendationAudience, RecommendationRecipient, LibraryPaper, LibraryRecommendationSource
from ..schemas import (
    ArxivPaperOut,
    ArxivPreviewRequest,
    ArxivPreviewResponse,
    ArxivRecommendCreate, RecommendationVisibility,
    ArxivPaperUpdate,
    PaperCommentOut,
    PaperCommentCreate,
    CommentUserOut,
)
from ..auth import get_current_user
from ..services.library_service import archive, grant_library_access, track_recommendation, rebuild_recommendation_access, find_paper
from ..services.recommendation_access import public_recommendation, visible_recommendation, can_view
from ..services.arxiv_service import canonical_id
from ..services.arxiv_service import extract_arxiv_id, fetch_arxiv_metadata
from ..services.paper_service import doi_id, fetch_journal_metadata

router = APIRouter(prefix="/api/arxiv", tags=["arXiv"])


@router.post("/preview", response_model=ArxivPreviewResponse)
async def preview_arxiv(
    req: ArxivPreviewRequest,
    current_user: User = Depends(get_current_user)
):
    """提取输入文本/链接中的 arXiv ID 并抓取元数据预览"""
    if doi_id(req.url_or_id) or not extract_arxiv_id(req.url_or_id):
        try:
            return await fetch_journal_metadata(req.url_or_id)
        except ValueError as exc:
            raise HTTPException(400, str(exc))
    arxiv_id = extract_arxiv_id(req.url_or_id)
    if not arxiv_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="未能识别有效的 arXiv ID 或链接，请确认格式（如 2301.07094 或完整 URL）",
        )
    
    try:
        data = await fetch_arxiv_metadata(arxiv_id)
        return data
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"抓取文献失败: {str(e)}",
        )


@router.post("/recommend", response_model=ArxivPaperOut)
def recommend_paper(
    req: ArxivRecommendCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """提交文献推荐"""
    req.arxiv_id = canonical_id(req.arxiv_id)
    recipients = validate_recipients(req, current_user.id, db)
    check_duplicate(req, req.arxiv_id, current_user.id, db)

    # 导师身份推荐默认或允许置顶/专属高亮
    is_pinned = req.is_pinned
    if current_user.role in ["teacher", "admin"]:
        # 导师发布的推荐默认置顶高亮
        is_pinned = True

    paper = ArxivPaper(
        arxiv_id=req.arxiv_id,
        title=req.title,
        journal=req.journal,
        source_url=req.source_url,
        authors=json.dumps(req.authors, ensure_ascii=False),
        abstract=req.abstract,
        primary_category=req.primary_category,
        published_date=req.published_date,
        pdf_url=req.pdf_url,
        recommended_by_id=current_user.id,
        recommend_comment=req.recommend_comment,
        is_pinned=is_pinned,
    )
    db.add(paper)
    if req.visibility == 'direct':
        paper.audience = RecommendationAudience(recipients=[RecommendationRecipient(user_id=u.id) for u in recipients])
    archived = archive(db, req.model_dump(), 'recommendation' if req.visibility == 'public' else None)
    if req.visibility == 'direct':
        grant_library_access(db, archived.id, [current_user.id, *req.recipient_ids])
    track_recommendation(db, paper, archived)
    db.commit()
    db.refresh(paper)

    return _format_paper_out(paper, current_user.id, db)


def validate_recipients(req, sender_id, db):
    if req.visibility == 'public':
        return []
    if sender_id in req.recipient_ids:
        raise HTTPException(400, '请选择其他注册成员作为接收人')
    recipients = db.query(User).filter(User.id.in_(req.recipient_ids)).all()
    if len(recipients) != len(req.recipient_ids):
        raise HTTPException(400, '部分接收人不存在，请刷新成员列表')
    return recipients


def check_duplicate(req, arxiv_id, sender_id, db, exclude_id=None):
    candidates = db.query(ArxivPaper).filter(ArxivPaper.recommended_by_id == sender_id).all()
    for existing in candidates:
        if existing.id == exclude_id or canonical_id(existing.arxiv_id) != canonical_id(arxiv_id):
            continue
        existing_ids = {r.user_id for r in existing.audience.recipients} if existing.audience else set()
        if bool(existing.audience) == (req.visibility == 'direct') and existing_ids == set(req.recipient_ids):
            raise HTTPException(400, '你已向相同范围推荐过这篇文献，可在“我发出的”中查看')


@router.put('/{paper_id}/visibility', response_model=ArxivPaperOut)
def update_visibility(paper_id: int, req: RecommendationVisibility,
                      current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    paper = db.get(ArxivPaper, paper_id)
    if not paper or not can_view(paper, current_user.id):
        raise HTTPException(404, '未找到该文献')
    if paper.recommended_by_id != current_user.id:
        raise HTTPException(403, '只有推荐人本人可以编辑可见范围')
    recipients = validate_recipients(req, current_user.id, db)
    check_duplicate(req, paper.arxiv_id, current_user.id, db, exclude_id=paper.id)
    if req.recommend_comment is not None:
        paper.recommend_comment = req.recommend_comment.strip()
    if req.visibility == 'direct':
        if paper.audience is None:
            paper.audience = RecommendationAudience()
        existing = {r.user_id: r for r in paper.audience.recipients}
        paper.audience.recipients = [existing.get(u.id) or RecommendationRecipient(user_id=u.id) for u in recipients]
    else:
        paper.audience = None
    archived = find_paper(db, paper.arxiv_id)
    if archived is None:
        archived = archive(db, {c.name: getattr(paper, c.name) for c in ArxivPaper.__table__.columns}, None)
    track_recommendation(db, paper, archived)
    rebuild_recommendation_access(db, archived)
    db.commit()
    db.refresh(paper)
    return _format_paper_out(paper, current_user.id, db)

@router.put('/{paper_id}', response_model=ArxivPaperOut)
def update_paper(paper_id: int, req: ArxivPaperUpdate,
                 current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    paper = db.get(ArxivPaper, paper_id)
    if not paper or not can_view(paper, current_user.id):
        raise HTTPException(404, '未找到该文献')
    if paper.recommended_by_id != current_user.id and current_user.role != 'admin':
        raise HTTPException(403, '只有文献上传者本人或管理员可以编辑文献')
    changes = req.model_dump(exclude_unset=True)
    for field, value in changes.items():
        if field in ('source_url', 'pdf_url') and value and not value.startswith(('http://', 'https://')):
            raise HTTPException(422, '链接必须为 HTTP(S) 地址')
        if field == 'title' and not value.strip():
            raise HTTPException(422, '论文标题不能为空')
        setattr(paper, field, value.strip() if isinstance(value, str) else value)
    archived = find_paper(db, paper.arxiv_id)
    if archived:
        for field in ('title', 'journal', 'abstract', 'source_url', 'pdf_url'):
            if field in changes: setattr(archived, field, getattr(paper, field))
    db.commit(); db.refresh(paper)
    return _format_paper_out(paper, current_user.id, db)


@router.get("/feed", response_model=List[ArxivPaperOut])
def get_arxiv_feed(
    scope: str = Query("all", pattern="^(all|public|received|sent|teacher|unread)$"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """获取 arXiv 每日推荐流列表（优先排序置顶与导师推荐）"""
    query = db.query(ArxivPaper).filter(visible_recommendation(current_user.id))
    if scope == 'public':
        query = query.filter(public_recommendation())
    elif scope == 'received':
        query = query.filter(exists().where(RecommendationRecipient.paper_id == ArxivPaper.id, RecommendationRecipient.user_id == current_user.id))
    elif scope == 'sent':
        query = query.filter(ArxivPaper.recommended_by_id == current_user.id)

    if scope == "teacher":
        # 仅看导师推荐
        query = query.join(User, ArxivPaper.recommended_by_id == User.id).filter(User.role.in_(["teacher", "admin"]))

    papers = query.order_by(ArxivPaper.is_pinned.desc(), ArxivPaper.created_at.desc()).all()

    formatted = []
    for paper in papers:
        item = _format_paper_out(paper, current_user.id, db)
        if scope == "unread" and item.is_read_by_me:
            continue
        formatted.append(item)

    return formatted


@router.post("/{paper_id}/read-toggle")
def toggle_read_mark(
    paper_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """切换已读打卡状态"""
    paper = db.get(ArxivPaper, paper_id)
    if not paper or not can_view(paper, current_user.id):
        raise HTTPException(404, '未找到该文献')
    existing_mark = (
        db.query(PaperReadMark)
        .filter(PaperReadMark.paper_id == paper_id, PaperReadMark.user_id == current_user.id)
        .first()
    )

    if existing_mark:
        db.delete(existing_mark)
        db.commit()
        return {"paper_id": paper_id, "is_read": False}
    else:
        new_mark = PaperReadMark(paper_id=paper_id, user_id=current_user.id)
        db.add(new_mark)
        db.commit()
        return {"paper_id": paper_id, "is_read": True}


@router.delete("/{paper_id}")
def delete_paper(
    paper_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """删除推荐（限推荐人本人或管理员）"""
    paper = db.query(ArxivPaper).filter(ArxivPaper.id == paper_id).first()
    if not paper or not can_view(paper, current_user.id):
        raise HTTPException(status_code=404, detail="未找到该文献")
    
    if paper.recommended_by_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="无权删除该文献")

    source = db.query(LibraryRecommendationSource).filter_by(recommendation_id=paper.id).first()
    if source:
        source.recommendation_id = None
    db.delete(paper)
    db.commit()
    return {"message": "删除成功"}


def _format_comment_user(user: Optional[User]) -> Optional[CommentUserOut]:
    if not user:
        return None
    return CommentUserOut(
        id=user.id,
        name=user.name,
        real_name=getattr(user, 'real_name', '') or '',
        nickname=getattr(user, 'nickname', '') or '',
        avatar=getattr(user, 'avatar', '') or '',
        role=getattr(user, 'role', '') or '',
        identity=getattr(user, 'identity', '') or getattr(user, 'role', '') or '',
    )


@router.get("/{paper_id}/comments", response_model=List[PaperCommentOut])
def get_paper_comments(
    paper_id: int,
    since_id: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """获取文献研读讨论留言列表，支持 since_id 增量游标查询"""
    paper = db.get(ArxivPaper, paper_id)
    if not paper or not can_view(paper, current_user.id):
        raise HTTPException(status_code=404, detail="未找到该文献")

    query = db.query(PaperComment).filter(PaperComment.paper_id == paper_id)
    if since_id > 0:
        query = query.filter(PaperComment.id > since_id)
    comments = query.order_by(PaperComment.id.asc()).all()

    return [
        PaperCommentOut(
            id=c.id,
            paper_id=c.paper_id,
            user_id=c.user_id,
            content=c.content,
            created_at=c.created_at,
            user=_format_comment_user(c.user)
        )
        for c in comments
    ]


@router.post("/{paper_id}/comments", response_model=PaperCommentOut)
def add_paper_comment(
    paper_id: int,
    req: PaperCommentCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """发布文献研读讨论留言"""
    content = req.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail="讨论内容不能为空")
    if len(content) > 500:
        raise HTTPException(status_code=400, detail="讨论内容过长，请精简在 500 字以内")

    paper = db.get(ArxivPaper, paper_id)
    if not paper or not can_view(paper, current_user.id):
        raise HTTPException(status_code=404, detail="未找到该文献")

    new_comment = PaperComment(
        paper_id=paper_id,
        user_id=current_user.id,
        content=content,
    )
    db.add(new_comment)
    db.commit()
    db.refresh(new_comment)

    return PaperCommentOut(
        id=new_comment.id,
        paper_id=new_comment.paper_id,
        user_id=new_comment.user_id,
        content=new_comment.content,
        created_at=new_comment.created_at,
        user=_format_comment_user(current_user)
    )


@router.delete("/comments/{comment_id}")
def delete_paper_comment(
    comment_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """删除文献讨论留言（限留言者本人或管理员）"""
    comment = db.get(PaperComment, comment_id)
    if not comment:
        raise HTTPException(status_code=404, detail="未找到该讨论留言")

    if comment.user_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="无权删除他人的讨论留言")

    db.delete(comment)
    db.commit()
    return {"message": "讨论留言已删除"}


def _format_paper_out(paper: ArxivPaper, current_user_id: int, db: Session) -> ArxivPaperOut:
    try:
        authors_list = json.loads(paper.authors)
    except Exception:
        authors_list = [paper.authors]

    read_count = 0  # 隐私保护：不向其他用户透露文献已读总人次
    is_read_by_me = (
        db.query(PaperReadMark)
        .filter(PaperReadMark.paper_id == paper.id, PaperReadMark.user_id == current_user_id)
        .first()
        is not None
    )

    comments_list = [
        PaperCommentOut(
            id=c.id,
            paper_id=c.paper_id,
            user_id=c.user_id,
            content=c.content,
            created_at=c.created_at,
            user=_format_comment_user(c.user)
        )
        for c in (paper.comments or [])
    ]

    return ArxivPaperOut(
        visibility='direct' if paper.audience else 'public',
        recipients=[r.user for r in paper.audience.recipients] if paper.audience else [],
        id=paper.id,
        arxiv_id=paper.arxiv_id,
        title=paper.title,
        journal=paper.journal,
        source_url=paper.source_url,
        authors=authors_list,
        abstract=paper.abstract,
        primary_category=paper.primary_category,
        published_date=paper.published_date,
        pdf_url=paper.pdf_url,
        recommend_comment=paper.recommend_comment,
        is_pinned=paper.is_pinned,
        created_at=paper.created_at,
        recommender=paper.recommender,
        read_count=read_count,
        is_read_by_me=is_read_by_me,
        comments=comments_list,
    )
