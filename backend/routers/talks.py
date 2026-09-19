from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from ..auth import get_current_user
from ..database import get_db
from ..models import ObservatoryTalk, User
from ..schemas import TalkInput
from ..services.email_service import parse_mail
from .files import MAX_BYTES, store_file

router = APIRouter(prefix='/api/talks', tags=['Talks'])


@router.post('/parse-email')
async def preview_email(file: UploadFile = File(None), text: str = Form(''),
                        user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if file:
        if not (file.filename or '').lower().endswith(('.eml', '.txt', '.html', '.htm')):
            raise HTTPException(400, '邮件支持 .eml、.txt 或 .html；也可直接粘贴正文')
        content, filename = await file.read(MAX_BYTES + 1), file.filename
    else:
        content, filename = text.encode(), 'mail.txt'
    if not content or len(content) > MAX_BYTES:
        raise HTTPException(400, '邮件不能为空且不得超过 15 MB')
    try:
        data, attachments = parse_mail(content, filename)
    except (ValueError, LookupError) as exc:
        raise HTTPException(400, str(exc))
    cid_urls = {}
    uploaded = []
    for attachment in attachments:
        url = store_file(db, attachment['filename'], attachment['content_type'], attachment['content'])
        cid_urls['cid:' + attachment['cid']] = url
        uploaded.append(url)
    candidates = [cid_urls.get(url, url) for url in data['poster_candidates'] if not url.startswith('cid:') or url in cid_urls]
    data['poster_candidates'] = list(dict.fromkeys(candidates + uploaded))
    data['poster_url'] = data['poster_candidates'][0] if data['poster_candidates'] else ''
    if len(data['poster_candidates']) > 1:
        data['warnings'].append('发现多张图片或 PDF，请选择正确的报告海报。')
    db.commit()
    return data


def normalize_title(t: str) -> str:
    import re
    t = re.sub(r'^[【\[](?:学术报告|通知|讲座|报告|天体物理中心)[\]】]\s*', '', t or '', flags=re.I)
    return re.sub(r'[《》""\'\'“”‘’\s，。、：:；;！!？?·•\-—_]', '', t).lower()


def normalize_speaker(s: str) -> str:
    import re
    return re.sub(r'[\s·•（）()\[\]]', '', s or '').lower()


_columns_ensured = False

def ensure_talks_columns(db: Session):
    global _columns_ensured
    if _columns_ensured:
        return
    try:
        from sqlalchemy import text
        cols = [
            ("end_date", "VARCHAR(10) DEFAULT ''"),
            ("event_type", "VARCHAR(20) DEFAULT 'talk'"),
            ("city", "VARCHAR(100) DEFAULT ''"),
            ("organizer", "VARCHAR(200) DEFAULT ''"),
            ("sub_type", "VARCHAR(50) DEFAULT ''"),
            ("abstract_deadline", "VARCHAR(10) DEFAULT ''"),
            ("early_bird_deadline", "VARCHAR(10) DEFAULT ''"),
            ("registration_deadline", "VARCHAR(10) DEFAULT ''"),
            ("website_url", "TEXT DEFAULT ''"),
            ("registration_url", "TEXT DEFAULT ''"),
            ("handbook_url", "TEXT DEFAULT ''"),
            ("source", "VARCHAR(200) DEFAULT ''"),
            ("updated_at", "DATETIME DEFAULT CURRENT_TIMESTAMP"),
        ]
        for col_name, col_type in cols:
            try:
                db.execute(text(f"ALTER TABLE observatory_talks ADD COLUMN {col_name} {col_type}"))
                db.commit()
            except Exception:
                db.rollback()
    except Exception:
        pass
    _columns_ensured = True


@router.get('')
def get_talks(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    ensure_talks_columns(db)
    talks = db.query(ObservatoryTalk).order_by(ObservatoryTalk.date, ObservatoryTalk.time, ObservatoryTalk.id).all()
    merged_list = []
    to_delete = []

    for item in talks:
        norm_title = normalize_title(item.title)
        norm_speaker = normalize_speaker(item.speaker)

        dup = None
        for m in merged_list:
            if m.date != item.date:
                continue
            if (getattr(m, 'event_type', 'talk') or 'talk') != (getattr(item, 'event_type', 'talk') or 'talk'):
                continue
            m_title = normalize_title(m.title)
            m_speaker = normalize_speaker(m.speaker)
            if norm_title and m_title and (norm_title == m_title or norm_title in m_title or m_title in norm_title):
                dup = m
                break
            if norm_speaker and m_speaker and (norm_speaker == m_speaker or (len(norm_speaker) >= 2 and (norm_speaker in m_speaker or m_speaker in norm_speaker))):
                dup = m
                break

        if dup:
            to_delete.append(item)
            if len(item.title or '') > len(dup.title or ''):
                dup.title = item.title
            if len(item.speaker or '') > len(dup.speaker or ''):
                dup.speaker = item.speaker
            if len(item.location or '') > len(dup.location or ''):
                dup.location = item.location
            if not dup.poster_url and item.poster_url:
                dup.poster_url = item.poster_url
            if not getattr(dup, 'end_date', None) and getattr(item, 'end_date', None):
                dup.end_date = item.end_date
            new_notes = (item.notes or '').strip()
            if new_notes and new_notes[:30] not in (dup.notes or ''):
                dup.notes = f"{dup.notes}\n\n[补充/更新信息]\n{new_notes}" if dup.notes else new_notes
        else:
            merged_list.append(item)

    if to_delete:
        for item in to_delete:
            db.delete(item)
        db.commit()

    return merged_list


@router.post('')
def create_talk(req: TalkInput, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    ensure_talks_columns(db)
    data = req.model_dump()
    date_val = (data.get('date') or '').strip()
    title_val = (data.get('title') or '').strip()
    speaker_val = (data.get('speaker') or '').strip()
    location_val = (data.get('location') or '').strip()
    poster_val = (data.get('poster_url') or '').strip()
    notes_val = (data.get('notes') or '').strip()
    time_val = (data.get('time') or '').strip()
    end_date_val = (data.get('end_date') or '').strip()
    event_type_val = (data.get('event_type') or 'talk').strip()

    if event_type_val == 'conference':
        if not end_date_val:
            end_date_val = date_val
            data['end_date'] = date_val
        if not time_val:
            time_val = '全天'
            data['time'] = '全天'
    else:
        if not time_val:
            time_val = '14:30'
            data['time'] = '14:30'

    # 查询同日期的历史报告/同名会议
    if event_type_val == 'conference':
        candidates = db.query(ObservatoryTalk).filter(
            ObservatoryTalk.event_type == 'conference',
            (ObservatoryTalk.date == date_val) | (ObservatoryTalk.title == title_val)
        ).all()
    else:
        candidates = db.query(ObservatoryTalk).filter(
            ObservatoryTalk.date == date_val,
            (ObservatoryTalk.event_type == 'talk') | (ObservatoryTalk.event_type == None)
        ).all()

    norm_new_title = normalize_title(title_val)
    norm_new_speaker = normalize_speaker(speaker_val)

    matched: ObservatoryTalk | None = None
    for item in candidates:
        norm_item_title = normalize_title(item.title)
        norm_item_speaker = normalize_speaker(item.speaker)
        if norm_new_title and norm_item_title and (norm_new_title == norm_item_title or norm_new_title in norm_item_title or norm_item_title in norm_new_title):
            matched = item
            break
        if norm_new_speaker and norm_item_speaker and (norm_new_speaker == norm_item_speaker or (len(norm_new_speaker) >= 2 and (norm_new_speaker in norm_item_speaker or norm_item_speaker in norm_new_speaker))):
            matched = item
            break

    # 如果同日期未匹配到，且标题特征显著（>= 6 字符），尝试检测是否为延期/改期推送
    if not matched and event_type_val != 'conference' and norm_new_title and len(norm_new_title) >= 6:
        other_candidates = db.query(ObservatoryTalk).filter(
            (ObservatoryTalk.event_type == 'talk') | (ObservatoryTalk.event_type == None)
        ).all()
        for item in other_candidates:
            norm_item_title = normalize_title(item.title)
            if norm_item_title and (norm_new_title == norm_item_title or norm_new_title in norm_item_title or norm_item_title in norm_new_title):
                matched = item
                break

    if matched:
        old_title = (matched.title or '').strip()
        old_date = (matched.date or '').strip()
        old_end_date = (matched.end_date or '').strip()
        old_time = (matched.time or '').strip()
        old_speaker = (matched.speaker or '').strip()
        old_location = (matched.location or '').strip()
        old_notes = (matched.notes or '').strip()
        old_poster = (matched.poster_url or '').strip()
        old_event_type = (matched.event_type or 'talk').strip()

        # 检查内容是否与最新推送不一致
        is_changed = (
            (bool(title_val) and title_val != old_title) or
            (bool(date_val) and date_val != old_date) or
            (bool(time_val) and time_val != old_time) or
            (speaker_val != old_speaker) or
            (location_val != old_location) or
            (bool(notes_val) and notes_val != old_notes) or
            (bool(poster_val) and poster_val != old_poster) or
            (bool(end_date_val) and end_date_val != old_end_date) or
            (event_type_val != old_event_type)
        )

        if is_changed:
            if title_val: matched.title = title_val
            if date_val: matched.date = date_val
            if end_date_val: matched.end_date = end_date_val
            if time_val: matched.time = time_val
            matched.speaker = speaker_val
            matched.location = location_val
            if poster_val: matched.poster_url = poster_val
            if notes_val: matched.notes = notes_val
            matched.event_type = event_type_val
            db.commit()
            db.refresh(matched)

        res_dict = {c.name: getattr(matched, c.name) for c in matched.__table__.columns}
        res_dict['merged'] = True
        res_dict['replaced'] = is_changed
        res_dict['updated'] = is_changed
        res_dict['message'] = '检测到重复日程，已用最新推送更新替换！' if is_changed else '检测到相同日程，已确认无变更'
        return res_dict

    ensure_talks_columns(db)
    talk = ObservatoryTalk(**data, created_by_id=user.id)
    db.add(talk); db.commit(); db.refresh(talk)
    res_dict = {c.name: getattr(talk, c.name) for c in talk.__table__.columns}
    res_dict['merged'] = False
    res_dict['replaced'] = False
    return res_dict


@router.put('/{talk_id}')
def update_talk(talk_id: int, req: TalkInput, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    ensure_talks_columns(db)
    talk = db.get(ObservatoryTalk, talk_id)
    if not talk: raise HTTPException(404, '报告不存在')
    data = req.model_dump()
    is_admin_or_creator = (user.role == 'admin' or user.id == talk.created_by_id)

    if not is_admin_or_creator:
        protected_fields = [
            'title', 'speaker', 'location', 'poster_url', 'notes', 'event_type',
            'city', 'organizer', 'sub_type', 'abstract_deadline', 'early_bird_deadline',
            'registration_deadline', 'website_url', 'registration_url', 'handbook_url', 'source'
        ]
        for field in protected_fields:
            if field in data and data[field] is not None:
                current_val = getattr(talk, field, None) or ''
                new_val = data[field] or ''
                if current_val != new_val:
                    raise HTTPException(403, '普通用户仅可调整日程时间，无权修改报告基本信息')

        if 'date' in data and data['date']: talk.date = data['date']
        if 'time' in data and data['time']: talk.time = data['time']
        if 'end_date' in data: talk.end_date = data['end_date']
        db.commit()
        db.refresh(talk)
        return talk

    for key, value in data.items(): setattr(talk, key, value)
    db.commit(); db.refresh(talk)
    return talk


@router.delete('/{talk_id}')
def delete_talk(talk_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    talk = db.get(ObservatoryTalk, talk_id)
    if not talk: raise HTTPException(404, '报告不存在')
    if user.id != talk.created_by_id and user.role != 'admin': raise HTTPException(403, '仅上传者或管理员可删除报告')
    db.delete(talk); db.commit()
    return {'message': '报告已删除'}
