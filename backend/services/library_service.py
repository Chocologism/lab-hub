import json
from ..models import LibraryPaper, LibraryAlias, Favorite, ArxivPaper, SeminarSchedule, LibraryAccess, LibraryRecommendationSource
from .arxiv_service import canonical_id, fetch_arxiv_metadata
from .paper_service import doi_id


def find_paper(db, key):
    key = canonical_id(key)
    alias = db.get(LibraryAlias, key)
    return db.get(LibraryPaper, alias.library_id) if alias else db.query(LibraryPaper).filter_by(arxiv_id=key).first()


def merge_papers(db, keep, duplicate):
    keep.from_recommendation = keep.from_recommendation or duplicate.from_recommendation
    keep.from_seminar = keep.from_seminar or duplicate.from_seminar
    keep.created_at = min(keep.created_at, duplicate.created_at)
    for field in ('journal', 'source_url', 'abstract', 'authors', 'pdf_url'):
        if not getattr(keep, field):
            setattr(keep, field, getattr(duplicate, field))
    grant_library_access(db, keep.id, [r.user_id for r in db.query(LibraryAccess).filter_by(paper_id=duplicate.id)])
    db.query(LibraryAccess).filter_by(paper_id=duplicate.id).delete(synchronize_session=False)
    for row in db.query(LibraryRecommendationSource).filter_by(library_id=duplicate.id):
        row.library_id = keep.id
    for row in db.query(LibraryAlias).filter_by(library_id=duplicate.id):
        row.library_id = keep.id
    alias = db.get(LibraryAlias, duplicate.arxiv_id)
    if not alias:
        db.add(LibraryAlias(key=duplicate.arxiv_id, library_id=keep.id))
    db.delete(duplicate)
    db.flush()


def normalize_favorites(db, paper):
    from sqlalchemy.dialects.sqlite import insert
    keys = [r.key for r in db.query(LibraryAlias).filter_by(library_id=paper.id)]
    for entry in db.query(Favorite).filter(Favorite.kind == 'paper', Favorite.target.in_(keys), Favorite.target != paper.arxiv_id).all():
        db.execute(insert(Favorite).values(user_id=entry.user_id, kind='paper', target=paper.arxiv_id, created_at=entry.created_at).on_conflict_do_nothing())
        db.delete(entry)
    db.flush()


def archive(db, data, source, ready=True):
    key = canonical_id(data['arxiv_id'])
    doi = doi_id(data.get('source_url')) or (doi_id(key) if key.startswith('doi:') else None)
    keys = {key, *(['doi:' + doi] if doi else [])}
    candidates = {p.id: p for k in keys if (p := find_paper(db, k)) is not None}
    # Prefer the arXiv row, retaining its primary key when merging existing rows.
    paper = next((p for p in candidates.values() if not p.arxiv_id.startswith(('doi:', 'url:'))), next(iter(candidates.values()), None))
    if paper is None:
        paper = LibraryPaper(arxiv_id=key, title=f'arXiv:{key}', metadata_status='pending')
        db.add(paper)
        db.flush()
    for other in candidates.values():
        if other.id != paper.id:
            merge_papers(db, paper, other)
    old_key = paper.arxiv_id
    if not key.startswith(('doi:', 'url:')):
        paper.arxiv_id = key
    for alias_key in keys | {old_key, paper.arxiv_id}:
        alias = db.get(LibraryAlias, alias_key)
        if alias:
            alias.library_id = paper.id
        else:
            db.add(LibraryAlias(key=alias_key, library_id=paper.id))
    arxiv_data = not key.startswith(('doi:', 'url:'))
    has_arxiv = not paper.arxiv_id.startswith(('doi:', 'url:'))
    # Backfills of DOI recommendations must not overwrite an arXiv abstract.
    if has_arxiv and not arxiv_data:
        ready = False
    if ready:
        for field in ('title', 'abstract', 'primary_category', 'published_date', 'pdf_url', 'journal', 'source_url'):
            if data.get(field) is not None and (field not in ('journal', 'source_url') or data.get(field)):
                setattr(paper, field, data[field])
        authors = data.get('authors', [])
        paper.authors = authors if isinstance(authors, str) else json.dumps(authors, ensure_ascii=False)
        paper.metadata_status = 'ready'
    if doi:
        paper.source_url = 'https://doi.org/' + doi
    if not has_arxiv:
        paper.abstract = ''
    if not key.startswith(('doi:', 'url:')):
        paper.pdf_url = paper.pdf_url or f'https://arxiv.org/pdf/{key}'
    if source is not None:
        setattr(paper, f'from_{source}', True)
    db.flush()
    normalize_favorites(db, paper)
    return paper


def grant_library_access(db, paper_id, user_ids):
    from sqlalchemy.dialects.sqlite import insert
    for user_id in set(user_ids):
        db.execute(insert(LibraryAccess).values(paper_id=paper_id, user_id=user_id).on_conflict_do_nothing())


def backfill(db):
    linked = {row[0] for row in db.query(SeminarSchedule.paper_id).filter(SeminarSchedule.paper_id.isnot(None))}
    for paper in db.query(ArxivPaper).all():
        data = {field: getattr(paper, field) for field in ('arxiv_id', 'title', 'authors', 'abstract', 'primary_category', 'published_date', 'pdf_url', 'journal', 'source_url')}
        archived = archive(db, data, None if paper.audience else 'recommendation')
        if paper.audience:
            grant_library_access(db, archived.id, [paper.recommended_by_id, *[r.user_id for r in paper.audience.recipients]])
        track_recommendation(db, paper, archived)
        if paper.id in linked and not paper.audience:
            archived.from_seminar = True
    preserve_legacy_archives(db)
    db.commit()


async def prepare_references(db, presentations):
    """Fetch before taking a SQLite write lock, with a budget for the whole meeting."""
    import asyncio
    result = {}
    for item in (presentations or []):
        arxiv_raw = getattr(item, 'arxiv_id', None) or ''
        if not arxiv_raw.strip():
            continue
        key = canonical_id(arxiv_raw)
        if not key:
            continue
        if key not in result:
            result[key] = {'data': {'arxiv_id': key}, 'ready': False}
        existing = db.query(LibraryPaper).filter_by(arxiv_id=key).first()
        if existing and existing.metadata_status == 'ready':
            result[key] = {'data': {c.name: getattr(existing, c.name) for c in LibraryPaper.__table__.columns}, 'ready': True}
    if not result:
        return result

    async def _fetch_all():
        for key, entry in result.items():
            if entry['ready']:
                continue
            try:
                entry['data'] = await fetch_arxiv_metadata(key)
                entry['ready'] = True
            except (ValueError, Exception):
                pass

    try:
        await asyncio.wait_for(_fetch_all(), timeout=20.0)
    except (asyncio.TimeoutError, TimeoutError):
        pass
    return result


def track_recommendation(db, recommendation, library_paper):
    db.flush()
    source = db.query(LibraryRecommendationSource).filter_by(recommendation_id=recommendation.id).first()
    if source is None:
        source = LibraryRecommendationSource(library_id=library_paper.id, recommendation_id=recommendation.id)
        db.add(source)
    source.library_id = library_paper.id
    source.is_public = recommendation.audience is None
    source.user_ids = json.dumps([recommendation.recommended_by_id, *(
        [r.user_id for r in recommendation.audience.recipients] if recommendation.audience else [])])
    db.flush()
    return source


def preserve_legacy_archives(db):
    """On upgrade, retain grants with no surviving recommendation provenance."""
    for paper in db.query(LibraryPaper).all():
        sources = db.query(LibraryRecommendationSource).filter_by(library_id=paper.id).all()
        covered = {uid for source in sources for uid in json.loads(source.user_ids)}
        existing = {row.user_id for row in db.query(LibraryAccess).filter_by(paper_id=paper.id)}
        missing = existing - covered
        public_orphan = bool(paper.from_recommendation and not any(source.is_public for source in sources))
        if missing or public_orphan:
            db.add(LibraryRecommendationSource(library_id=paper.id, is_public=public_orphan, user_ids=json.dumps(sorted(missing))))
    db.flush()


def rebuild_recommendation_access(db, paper):
    db.flush()
    sources = db.query(LibraryRecommendationSource).filter_by(library_id=paper.id).all()
    paper.from_recommendation = any(source.is_public for source in sources)
    user_ids = {uid for source in sources if not source.is_public for uid in json.loads(source.user_ids)}
    db.query(LibraryAccess).filter_by(paper_id=paper.id).delete(synchronize_session=False)
    grant_library_access(db, paper.id, user_ids)
