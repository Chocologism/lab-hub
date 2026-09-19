import json
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session
from ..auth import get_current_user
from ..database import get_db
from ..models import LibraryPaper, User
from ..services.arxiv_service import fetch_arxiv_metadata
from ..services.library_service import archive
from ..services.recommendation_access import visible_library, private_library_access

router = APIRouter(prefix='/api/library', tags=['Library'])


def format_paper(paper, has_direct=False):
    data = {c.name: getattr(paper, c.name) for c in LibraryPaper.__table__.columns}
    try:
        data['authors'] = json.loads(paper.authors or '[]')
    except ValueError:
        data['authors'] = [paper.authors]
    data['from_direct'] = has_direct
    data['from_recommendation'] = bool(paper.from_recommendation or has_direct)
    data['arxiv_url'] = f'https://arxiv.org/abs/{paper.arxiv_id}' if not paper.arxiv_id.startswith(('doi:', 'url:')) else ''
    data['doi_url'] = paper.source_url if (paper.source_url or '').lower().startswith('https://doi.org/') else ''
    return data


@router.get('')
def list_papers(q: str = Query('', max_length=300), source: str = Query('all', pattern='^(all|recommendation|seminar)$'),
                user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    query = db.query(LibraryPaper).filter(visible_library(user.id))
    for word in q.split():
        query = query.filter(or_(*[col.icontains(word, autoescape=True) for col in (
            LibraryPaper.arxiv_id, LibraryPaper.title, LibraryPaper.authors, LibraryPaper.abstract, LibraryPaper.primary_category, LibraryPaper.journal)]))
    if source != 'all':
        if source == 'recommendation':
            query = query.filter(or_(LibraryPaper.from_recommendation.is_(True), private_library_access(user.id)))
        else:
            query = query.filter(LibraryPaper.from_seminar.is_(True))
    return [format_paper(p, has_direct_access(db, p.id, user.id)) for p in query.order_by(LibraryPaper.created_at.desc(), LibraryPaper.id.desc()).all()]


@router.post('/{paper_id}/refresh')
async def refresh(paper_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    paper = db.query(LibraryPaper).filter(LibraryPaper.id == paper_id, visible_library(user.id)).first()
    if not paper:
        raise HTTPException(404, '文献不存在')
    try:
        if paper.arxiv_id.startswith(('doi:', 'url:')):
            from ..services.paper_service import fetch_journal_metadata
            data = await fetch_journal_metadata(paper.arxiv_id)
        else:
            data = await fetch_arxiv_metadata(paper.arxiv_id)
    except ValueError as exc:
        raise HTTPException(502, str(exc))
    paper = archive(db, data, None)
    db.commit()
    return format_paper(paper, has_direct_access(db, paper.id, user.id))


def admin_only(user: User = Depends(get_current_user)):
    if user.role != 'admin':
        raise HTTPException(status_code=403, detail='仅管理员可删除文献')
    return user


@router.delete('/{paper_id}')
def delete_paper(paper_id: int, user: User = Depends(admin_only), db: Session = Depends(get_db)):
    paper = db.query(LibraryPaper).filter(LibraryPaper.id == paper_id).first()
    if not paper:
        raise HTTPException(status_code=404, detail='文献不存在')

    from ..models import LibraryAlias, LibraryAccess, LibraryRecommendationSource, Favorite

    aliases = db.query(LibraryAlias.key).filter(LibraryAlias.library_id == paper.id).all()
    keys_to_clean = [a[0] for a in aliases]
    if paper.arxiv_id and paper.arxiv_id not in keys_to_clean:
        keys_to_clean.append(paper.arxiv_id)

    if keys_to_clean:
        db.query(Favorite).filter(Favorite.kind == 'paper', Favorite.target.in_(keys_to_clean)).delete(synchronize_session=False)

    db.query(LibraryAlias).filter(LibraryAlias.library_id == paper.id).delete(synchronize_session=False)
    db.query(LibraryAccess).filter(LibraryAccess.paper_id == paper.id).delete(synchronize_session=False)
    db.query(LibraryRecommendationSource).filter(LibraryRecommendationSource.library_id == paper.id).delete(synchronize_session=False)

    db.delete(paper)
    db.commit()
    return {'message': '文献已成功删除', 'id': paper_id}


def has_direct_access(db, paper_id, user_id):
    from ..models import LibraryAccess
    return db.get(LibraryAccess, (paper_id, user_id)) is not None
