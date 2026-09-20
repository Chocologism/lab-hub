import json
from datetime import datetime
from typing import Any, Dict, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..auth import get_current_user
from ..database import get_db
from ..models import Notice, ObservatoryTalk, PendingScheduleImport, User

router = APIRouter(prefix='/api/schedule-imports', tags=['ScheduleImports'])


@router.get('/pending')
def list_pending_imports(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    items = (
        db.query(PendingScheduleImport)
        .filter(PendingScheduleImport.status == 'pending')
        .order_by(PendingScheduleImport.created_at.desc())
        .all()
    )

    result_list = []
    for item in items:
        parsed_data = {}
        image_urls = []
        file_attachments = []
        try:
            parsed_data = json.loads(item.parsed_data or '{}') if isinstance(item.parsed_data, str) else (item.parsed_data or {})
        except Exception:
            parsed_data = {}
        try:
            image_urls = json.loads(item.image_urls or '[]') if isinstance(item.image_urls, str) else (item.image_urls or [])
        except Exception:
            image_urls = []
        try:
            file_attachments = json.loads(item.file_attachments or '[]') if isinstance(item.file_attachments, str) else (item.file_attachments or [])
        except Exception:
            file_attachments = []

        result_list.append({
            'id': item.id,
            'raw_text': item.raw_text,
            'inferred_type': item.inferred_type,
            'parsed_data': parsed_data,
            'image_urls': image_urls if isinstance(image_urls, list) else [],
            'file_attachments': file_attachments if isinstance(file_attachments, list) else [],
            'status': item.status,
            'created_by_id': item.created_by_id,
            'created_by_name': item.created_by_name,
            'target_type': item.target_type,
            'target_id': item.target_id,
            'created_at': item.created_at.isoformat() if item.created_at else None,
            'resolved_at': item.resolved_at.isoformat() if item.resolved_at else None,
        })

    return {
        'list': result_list,
        'total': len(result_list)
    }


@router.post('/pending')
def create_pending_import(
    body: Dict[str, Any],
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    raw_text = (body.get('raw_text') or '').strip()
    inferred_type = (body.get('inferred_type') or 'talk').strip().lower()
    parsed_data = body.get('parsed_data') or {}
    if not isinstance(parsed_data, str):
        parsed_data = json.dumps(parsed_data, ensure_ascii=False)

    image_urls = body.get('image_urls') or []
    if isinstance(image_urls, str):
        try:
            parsed_images = json.loads(image_urls)
        except Exception:
            parsed_images = []
    else:
        parsed_images = image_urls

    file_attachments = body.get('file_attachments') or []
    if isinstance(file_attachments, str):
        try:
            parsed_files = json.loads(file_attachments)
        except Exception:
            parsed_files = []
    else:
        parsed_files = file_attachments

    has_images = isinstance(parsed_images, list) and len(parsed_images) > 0
    has_files = isinstance(parsed_files, list) and len(parsed_files) > 0

    if not raw_text and not has_images and not has_files:
        raise HTTPException(400, '请提供需要识别导入的内容（文本、海报图片或附件文件）')

    effective_raw_text = raw_text or ('【随附海报图片】' if has_images else ('【随附附件文件】' if has_files else ''))
    valid_types = ['talk', 'conference', 'notice']
    final_type = inferred_type if inferred_type in valid_types else 'talk'
    creator_name = (user.real_name or user.name or user.email or '组员').strip()

    pending_record = PendingScheduleImport(
        raw_text=effective_raw_text,
        inferred_type=final_type,
        parsed_data=parsed_data,
        image_urls=json.dumps(parsed_images if isinstance(parsed_images, list) else [], ensure_ascii=False),
        file_attachments=json.dumps(parsed_files if isinstance(parsed_files, list) else [], ensure_ascii=False),
        status='pending',
        created_by_id=user.id,
        created_by_name=creator_name,
        created_at=datetime.utcnow()
    )
    db.add(pending_record)
    db.commit()
    db.refresh(pending_record)

    return {
        'success': True,
        'id': pending_record.id,
        'message': '已保存至协同待处理队列'
    }


@router.post('/{item_id}/resolve')
def resolve_pending_import(
    item_id: int,
    body: Dict[str, Any],
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    pending_item = db.query(PendingScheduleImport).filter(PendingScheduleImport.id == item_id).first()
    if not pending_item:
        raise HTTPException(404, '未找到该待处理导入记录')

    target_type = (body.get('target_type') or pending_item.inferred_type or 'talk').strip().lower()
    card_data = body.get('data') or {}
    resolver_name = (user.real_name or user.name or user.email or '组员').strip()
    target_id: Optional[int] = None

    if target_type == 'notice':
        title = (card_data.get('title') or '').strip()
        content = (card_data.get('content') or pending_item.raw_text or '').strip()
        category = (card_data.get('category') or 'general').strip()
        importance = (card_data.get('importance') or 'normal').strip()
        start_date = (card_data.get('start_date') or '').strip()
        end_date = (card_data.get('end_date') or '').strip()
        attachments = card_data.get('attachments') or []
        attachments_str = attachments if isinstance(attachments, str) else json.dumps(attachments, ensure_ascii=False)

        if not title:
            raise HTTPException(400, '通知标题不能为空')
        if not content:
            raise HTTPException(400, '通知内容不能为空')

        notice = Notice(
            title=title,
            content=content,
            category=category,
            importance=importance,
            start_date=start_date,
            end_date=end_date,
            attachments=attachments_str,
            created_by_id=user.id,
            created_by_name=resolver_name,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )
        db.add(notice)
        db.commit()
        db.refresh(notice)
        target_id = notice.id
    else:
        is_conference = target_type == 'conference'
        event_type = 'conference' if is_conference else 'talk'
        title = (card_data.get('title') or ('学术会议' if is_conference else '学术报告')).strip()
        date = (card_data.get('date') or datetime.utcnow().strftime('%Y-%m-%d')).strip()
        effective_end_date = (card_data.get('end_date') or date).strip() if is_conference else ''
        effective_time = (card_data.get('time') or ('全天' if is_conference else '10:00')).strip()
        speaker = '' if is_conference else (card_data.get('speaker') or '').strip()
        location = (card_data.get('location') or '').strip()
        notes = (card_data.get('notes') or pending_item.raw_text or '').strip()
        poster_url = (card_data.get('poster_url') or '').strip()
        city = (card_data.get('city') or '').strip() if is_conference else ''
        organizer = (card_data.get('organizer') or '').strip() if is_conference else ''
        sub_type = (card_data.get('sub_type') or '研讨会').strip() if is_conference else ''
        abstract_deadline = (card_data.get('abstract_deadline') or '').strip() if is_conference else ''
        early_bird_deadline = (card_data.get('early_bird_deadline') or '').strip() if is_conference else ''
        registration_deadline = (card_data.get('registration_deadline') or '').strip() if is_conference else ''
        website_url = (card_data.get('website_url') or '').strip()
        registration_url = (card_data.get('registration_url') or '').strip()
        handbook_url = (card_data.get('handbook_url') or '').strip()
        source = (card_data.get('source') or f'手动粘贴导入 ({resolver_name})').strip()

        talk = ObservatoryTalk(
            date=date,
            end_date=effective_end_date,
            time=effective_time,
            title=title,
            speaker=speaker,
            location=location,
            poster_url=poster_url,
            notes=notes,
            event_type=event_type,
            city=city,
            organizer=organizer,
            sub_type=sub_type,
            abstract_deadline=abstract_deadline,
            early_bird_deadline=early_bird_deadline,
            registration_deadline=registration_deadline,
            website_url=website_url,
            registration_url=registration_url,
            handbook_url=handbook_url,
            source=source,
            created_by_id=user.id,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )
        db.add(talk)
        db.commit()
        db.refresh(talk)
        target_id = talk.id

    pending_item.status = 'completed'
    pending_item.resolved_by_id = user.id
    pending_item.resolved_by_name = resolver_name
    pending_item.target_type = target_type
    pending_item.target_id = target_id
    pending_item.resolved_at = datetime.utcnow()
    db.commit()

    return {
        'success': True,
        'message': '已成功审核并正式发布！',
        'target_type': target_type,
        'target_id': target_id
    }


@router.delete('/{item_id}')
def delete_pending_import(
    item_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    pending_item = db.query(PendingScheduleImport).filter(PendingScheduleImport.id == item_id).first()
    if not pending_item:
        return {'success': True, 'message': '待处理条目已移除'}

    db.delete(pending_item)
    db.commit()
    return {'success': True, 'message': '待处理条目已移除'}
