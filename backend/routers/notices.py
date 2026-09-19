import re
from datetime import datetime, timedelta
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import or_, and_, desc, case
from sqlalchemy.orm import Session
from ..auth import get_current_user
from ..database import get_db
from ..models import Notice, User

router = APIRouter(prefix='/api/notices', tags=['Notices'])


def normalize_notice_title(title: str) -> str:
    cleaned = re.sub(r'^[【\[](?:重要通知|通知|温馨提示|转发|教务通知|后勤通知|放假通知)[\]】]\s*', '', title or '', flags=re.IGNORECASE)
    cleaned = re.sub(r'[\s·•（）()\[\]【】《》""\'\'“”‘’，。、：:；;！!？?·•\-—_]', '', cleaned)
    return cleaned.lower()

def sanitize_notice_dates(start_date_raw: Optional[str], end_date_raw: Optional[str]) -> tuple[str, str]:
    now = datetime.now()
    current_year = now.year
    today_str = now.strftime('%Y-%m-%d')

    def parse_part(d: Optional[str]):
        if not d or not isinstance(d, str):
            return None
        clean = d.replace('/', '-').replace('.', '-').strip()
        m = re.search(r'(\d{4})-(\d{1,2})-(\d{1,2})', clean)
        if m:
            return {
                'y': int(m.group(1)),
                'm': f"{int(m.group(2)):02d}",
                'day': f"{int(m.group(3)):02d}"
            }
        md = re.search(r'(?:^|[^\d])(\d{1,2})[-月](\d{1,2})', clean)
        if md:
            return {
                'y': current_year,
                'm': f"{int(md.group(1)):02d}",
                'day': f"{int(md.group(2)):02d}"
            }
        return None

    start = parse_part(start_date_raw)
    end = parse_part(end_date_raw)

    if start and start['y'] < current_year:
        start['y'] = current_year
    start_date_str = f"{start['y']}-{start['m']}-{start['day']}" if start else (start_date_raw[:10] if start_date_raw else today_str)

    end_date_str = ''
    if end:
        if end['y'] < current_year:
            end['y'] = current_year
        if start and end['y'] < start['y']:
            end['y'] = start['y']
        if start and int(end['m']) < int(start['m']) and f"{end['y']}-{end['m']}-{end['day']}" < start_date_str:
            end['y'] = start['y'] + 1
        end_date_str = f"{end['y']}-{end['m']}-{end['day']}"

    return start_date_str, end_date_str



class NoticeCreate(BaseModel):
    title: str
    content: str
    category: Optional[str] = 'general'
    importance: Optional[str] = 'normal'
    start_date: Optional[str] = ''
    end_date: Optional[str] = ''
    source_email_uid: Optional[str] = ''
    source_email_subject: Optional[str] = ''
    source_email_sender: Optional[str] = ''
    attachments: Optional[str] = '[]'


class NoticeUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    category: Optional[str] = None
    importance: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    attachments: Optional[str] = None


class NoticeBatchCreate(BaseModel):
    notices: List[NoticeCreate]


@router.get('')
def list_notices(
    active_only: bool = Query(False),
    marquee_only: bool = Query(False),
    category: str = Query(''),
    keyword: str = Query(''),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    query = db.query(Notice)
    now = datetime.now()
    today_str = now.strftime('%Y-%m-%d')
    two_weeks_ago_str = (now - timedelta(days=14)).strftime('%Y-%m-%d')
    two_weeks_ago_dt = now - timedelta(days=14)

    if marquee_only:
        query = query.filter(or_(
            and_(Notice.end_date != '', Notice.end_date.isnot(None), Notice.end_date >= today_str),
            and_(
                or_(Notice.end_date == '', Notice.end_date.is_(None)),
                or_(
                    and_(Notice.start_date != '', Notice.start_date >= two_weeks_ago_str),
                    and_(Notice.start_date == '', Notice.created_at >= two_weeks_ago_dt)
                )
            )
        ))
    elif active_only:
        query = query.filter(or_(Notice.end_date == '', Notice.end_date.is_(None), Notice.end_date >= today_str))

    if category and category != 'all':
        query = query.filter(Notice.category == category)

    if keyword.strip():
        kw = f"%{keyword.strip()}%"
        query = query.filter(or_(
            Notice.title.ilike(kw),
            Notice.content.ilike(kw),
            Notice.source_email_subject.ilike(kw)
        ))

    importance_order = case(
        (Notice.importance == 'urgent', 0),
        (Notice.importance == 'important', 1),
        else_=2
    )

    items = query.order_by(importance_order, desc(Notice.id)).all()
    return items


@router.get('/{notice_id}')
def get_notice(notice_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    item = db.query(Notice).filter(Notice.id == notice_id).first()
    if not item:
        raise HTTPException(404, '通知不存在或已被删除')
    return item


@router.post('', status_code=201)
def create_notice(payload: NoticeCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    title = payload.title.strip()
    content = payload.content.strip()
    if not title:
        raise HTTPException(400, '通知标题/简短描述不能为空')
    if not content:
        raise HTTPException(400, '通知详细内容不能为空')

    # 防重 1: source_email_uid
    if payload.source_email_uid:
        exist_uid = db.query(Notice).filter(Notice.source_email_uid == payload.source_email_uid.strip()).first()
        if exist_uid:
            raise HTTPException(409, f'该通知已存在（ID: {exist_uid.id}），无需重复入库。')

    # 防重 2: 规范化标题
    norm_title = normalize_notice_title(title)
    if len(norm_title) >= 4:
        today_str = datetime.now().strftime('%Y-%m-%d')
        active_list = db.query(Notice).filter(or_(Notice.end_date == '', Notice.end_date >= today_str)).limit(100).all()
        for it in active_list:
            if normalize_notice_title(it.title) == norm_title:
                raise HTTPException(409, f'云端已有类似通知「{it.title}」，无需重复添加。')

    creator_name = user.real_name or user.nickname or user.name or '系统组员'
    start_date_clean, end_date_clean = sanitize_notice_dates(payload.start_date, payload.end_date)
    notice = Notice(
        title=title,
        content=content,
        category=payload.category or 'general',
        importance=payload.importance or 'normal',
        start_date=start_date_clean,
        end_date=end_date_clean,
        attachments=payload.attachments or '[]',
        source_email_uid=payload.source_email_uid or '',
        source_email_subject=payload.source_email_subject or '',
        source_email_sender=payload.source_email_sender or '',
        created_by_id=user.id,
        created_by_name=creator_name
    )
    db.add(notice)
    db.commit()
    db.refresh(notice)
    return notice


@router.post('/batch')
def batch_create_notices(payload: NoticeBatchCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not payload.notices:
        return {'inserted_count': 0, 'skipped_count': 0, 'total': 0, 'inserted_items': []}

    existing_uids = {r[0] for r in db.query(Notice.source_email_uid).filter(Notice.source_email_uid != '').all()}
    today_str = datetime.now().strftime('%Y-%m-%d')
    active_notices = db.query(Notice).filter(or_(Notice.end_date == '', Notice.end_date >= today_str)).all()
    normalized_titles = {normalize_notice_title(n.title) for n in active_notices}

    creator_name = user.real_name or user.nickname or user.name or '系统组员'
    inserted_count = 0
    skipped_count = 0
    inserted_items = []

    for item in payload.notices:
        title = item.title.strip()
        content = item.content.strip()
        if not title or not content:
            skipped_count += 1
            continue

        uid = (item.source_email_uid or '').strip()
        if uid and uid in existing_uids:
            skipped_count += 1
            continue

        norm_title = normalize_notice_title(title)
        if len(norm_title) >= 4 and norm_title in normalized_titles:
            skipped_count += 1
            continue

        start_date_clean, end_date_clean = sanitize_notice_dates(item.start_date, item.end_date)
        notice = Notice(
            title=title,
            content=content,
            category=item.category or 'general',
            importance=item.importance or 'normal',
            start_date=start_date_clean,
            end_date=end_date_clean,
            attachments=item.attachments or '[]',
            source_email_uid=uid,
            source_email_subject=item.source_email_subject or '',
            source_email_sender=item.source_email_sender or '',
            created_by_id=user.id,
            created_by_name=creator_name
        )
        db.add(notice)
        db.commit()
        db.refresh(notice)

        if uid:
            existing_uids.add(uid)
        if len(norm_title) >= 4:
            normalized_titles.add(norm_title)

        inserted_count += 1
        inserted_items.append({
            'id': notice.id,
            'title': notice.title,
            'category': notice.category,
            'importance': notice.importance,
            'start_date': notice.start_date,
            'end_date': notice.end_date
        })

    return {
        'inserted_count': inserted_count,
        'skipped_count': skipped_count,
        'total': len(payload.notices),
        'inserted_items': inserted_items
    }


@router.put('/{notice_id}')
def update_notice(notice_id: int, payload: NoticeUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    item = db.query(Notice).filter(Notice.id == notice_id).first()
    if not item:
        raise HTTPException(404, '通知不存在或已被删除')

    is_owner = item.created_by_id == user.id
    is_admin_or_teacher = user.role == 'admin' or user.identity == 'teacher'
    if not is_owner and not is_admin_or_teacher:
        raise HTTPException(403, '您无权修改此通知')

    if payload.title is not None:
        title = payload.title.strip()
        if not title:
            raise HTTPException(400, '通知标题不能为空')
        item.title = title

    if payload.content is not None:
        content = payload.content.strip()
        if not content:
            raise HTTPException(400, '通知内容不能为空')
        item.content = content

    if payload.category is not None:
        item.category = payload.category.strip()
    if payload.importance is not None:
        item.importance = payload.importance.strip()
    if payload.start_date is not None or payload.end_date is not None:
        raw_s = payload.start_date if payload.start_date is not None else item.start_date
        raw_e = payload.end_date if payload.end_date is not None else item.end_date
        clean_s, clean_e = sanitize_notice_dates(raw_s, raw_e)
        item.start_date = clean_s
        item.end_date = clean_e
    if payload.attachments is not None:
        item.attachments = payload.attachments

    item.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(item)
    return item


@router.delete('/{notice_id}')
def delete_notice(notice_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    item = db.query(Notice).filter(Notice.id == notice_id).first()
    if not item:
        raise HTTPException(404, '通知不存在或已被删除')

    is_owner = item.created_by_id == user.id
    is_admin_or_teacher = user.role == 'admin' or user.identity == 'teacher'
    if not is_owner and not is_admin_or_teacher:
        raise HTTPException(403, '您无权删除此通知')

    db.delete(item)
    db.commit()
    return {'success': True, 'message': '通知已删除'}
