from typing import Literal
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, ConfigDict
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from ..database import get_db
from ..auth import get_current_user
from ..models import User, Favorite, IssueFeedback, FeedbackReply, LibraryPaper, ResourceBook
from ..services.arxiv_service import canonical_id
from ..services.recommendation_access import visible_library
from .library import format_paper
from ..services.library_service import find_paper

router = APIRouter(prefix='/api', tags=['Personal'])


def resource(db, user, kind, target):
    if kind == 'paper':
        paper = find_paper(db, target)
        return db.query(LibraryPaper).filter(LibraryPaper.id == paper.id, visible_library(user.id)).first() if paper else None
    return db.get(ResourceBook, int(target)) if target.isascii() and target.isdecimal() and len(target) <= 10 and 0 < int(target) <= 2147483647 else None


@router.get('/favorites')
def favorites(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    result = []
    for entry in db.query(Favorite).filter_by(user_id=user.id).order_by(Favorite.created_at.desc()).all():
        item = resource(db, user, entry.kind, entry.target)
        # A favorite never grants access to a private paper or resurrects deleted content.
        if item is None:
            continue
        data = format_paper(item) if entry.kind == 'paper' else {c.name: getattr(item, c.name) for c in ResourceBook.__table__.columns}
        result.append(dict(kind=entry.kind, target=entry.target, saved_at=entry.created_at, item=data))
    return result


@router.put('/favorites/{kind}/{target:path}')
def save_favorite(kind: Literal['paper', 'book'], target: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    target = canonical_id(target) if kind == 'paper' else target
    item = resource(db, user, kind, target)
    if item is None:
        raise HTTPException(404, '内容不存在或无权访问')
    if kind == 'paper':
        target = item.arxiv_id
    key = (user.id, kind, target)
    if not db.get(Favorite, key):
        db.add(Favorite(user_id=user.id, kind=kind, target=target))
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            if not db.get(Favorite, key):
                raise
    return {'saved': True}


@router.delete('/favorites/{kind}/{target:path}')
def remove_favorite(kind: Literal['paper', 'book'], target: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    target = canonical_id(target) if kind == 'paper' else target
    if kind == 'paper' and (paper := find_paper(db, target)):
        target = paper.arxiv_id
    db.query(Favorite).filter_by(user_id=user.id, kind=kind, target=target).delete()
    db.commit()
    return {'saved': False}


class FeedbackInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra='forbid')
    title: str = Field(min_length=1, max_length=150)
    content: str = Field(min_length=1, max_length=5000)
    page: str = Field(default='', max_length=300)


def administrator(user: User = Depends(get_current_user)):
    if user.role != 'admin':
        raise HTTPException(403, '仅管理员可以查看问题反馈')
    return user


@router.post('/feedback', status_code=201)
def submit_feedback(body: FeedbackInput, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.add(IssueFeedback(user_id=user.id, **body.model_dump()))
    db.commit()
    return {'message': '反馈已提交，管理员将查看处理'}


@router.get('/feedback')
def feedback_list(user: User = Depends(administrator), db: Session = Depends(get_db)):
    return feedback_records(db)


def feedback_records(db, user_id=None):
    query = db.query(IssueFeedback, User.name).join(User, User.id == IssueFeedback.user_id)
    if user_id is not None:
        query = query.filter(IssueFeedback.user_id == user_id)
    rows = query.order_by(IssueFeedback.created_at.desc(), IssueFeedback.id.desc()).all()
    replies = {}
    if rows:
        for reply, name in db.query(FeedbackReply, User.name).join(User, User.id == FeedbackReply.admin_id).filter(
            FeedbackReply.feedback_id.in_([f.id for f, _ in rows])
        ).order_by(FeedbackReply.created_at, FeedbackReply.id):
            replies.setdefault(reply.feedback_id, []).append(dict(id=reply.id, content=reply.content,
                author=name, created_at=reply.created_at, read_at=reply.read_at))
    return [dict(id=f.id, title=f.title, content=f.content, page=f.page, resolved=f.resolved,
                 created_at=f.created_at, author=name, replies=replies.get(f.id, [])) for f, name in rows]


@router.get('/feedback/mine')
def my_feedback(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return feedback_records(db, user.id)


@router.get('/feedback/unread')
def unread_feedback(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    count = db.query(FeedbackReply).join(IssueFeedback).filter(
        IssueFeedback.user_id == user.id, FeedbackReply.read_at.is_(None)).count()
    return {'count': count}


class ReplyInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra='forbid')
    content: str = Field(min_length=1, max_length=5000)
    resolved: bool = True


@router.post('/feedback/{feedback_id}/replies', status_code=201)
def reply_feedback(feedback_id: int, body: ReplyInput, user: User = Depends(administrator), db: Session = Depends(get_db)):
    row = db.get(IssueFeedback, feedback_id)
    if row is None:
        raise HTTPException(404, '反馈不存在')
    # Recipient is always the original submitter, never a client-provided account.
    db.add(FeedbackReply(feedback_id=row.id, admin_id=user.id, content=body.content))
    row.resolved = body.resolved
    db.commit()
    return {'message': '处理回复已发送给提交人', 'resolved': row.resolved}


@router.put('/feedback/replies/{reply_id}/read')
def read_feedback_reply(reply_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    reply = db.query(FeedbackReply).join(IssueFeedback).filter(
        FeedbackReply.id == reply_id, IssueFeedback.user_id == user.id).first()
    if reply is None:
        raise HTTPException(404, '回复不存在')
    if reply.read_at is None:
        reply.read_at = datetime.utcnow()
        db.commit()
    return {'read': True}


class FeedbackStatus(BaseModel):
    resolved: bool


@router.patch('/feedback/{feedback_id}')
def resolve_feedback(feedback_id: int, body: FeedbackStatus, user: User = Depends(administrator), db: Session = Depends(get_db)):
    row = db.get(IssueFeedback, feedback_id)
    if row is None:
        raise HTTPException(404, '反馈不存在')
    row.resolved = body.resolved
    db.commit()
    return {'resolved': row.resolved}
