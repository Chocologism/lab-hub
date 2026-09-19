from typing import List, Optional
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from sqlalchemy import update, or_
from sqlalchemy.exc import OperationalError
import re

from ..database import get_db
from ..models import ArxivPaper, SeminarSchedule, SeminarPresentation, User, LibraryPaper
from ..schemas import (
    SeminarCreate, SeminarOut, SeminarUpdate,
    SeminarReschedule, SeminarRescheduleResult,
)
from ..auth import get_current_user

from ..services.library_service import prepare_references, archive
from ..services.reminders import (
    resolve_presenter, due_seminars, due_reminders_for_user,
    upcoming_for_user, get_setting_int, set_setting
)
from ..schemas import SeminarSettings, PresentationArxivInput, PresentationInput
from pydantic import BaseModel, Field, ConfigDict

router = APIRouter(prefix="/api/seminars", tags=["Seminars"])


def seminar_manager(user: User = Depends(get_current_user)):
    if user.role not in ('admin', 'teacher') and not user.can_manage_seminars:
        raise HTTPException(403, '你没有新增或删除组会的权限，请联系管理员授权')
    return user


def admin_only(user: User = Depends(get_current_user)):
    if user.role != 'admin':
        raise HTTPException(403, '该功能仅管理员可用')
    return user


@router.get('/admin/association-stats')
def admin_association_stats(
    _: User = Depends(admin_only),
    db: Session = Depends(get_db)
):
    """【管理员专属】检测当前日程人员与已注册用户的关联情况统计"""
    from ..services.reminders import get_association_stats
    return get_association_stats(db)


@router.post('/admin/batch-match-presenters')
def admin_batch_match_presenters(
    _: User = Depends(admin_only),
    db: Session = Depends(get_db)
):
    """【管理员专属】手动一键批量将未关联的主讲人与 arXiv 分享人匹配到同名注册用户"""
    from ..services.reminders import batch_match_presenters
    return batch_match_presenters(db)


@router.get('/settings', response_model=SeminarSettings)
def get_seminar_settings(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """获取组会提前提醒天数配置"""
    return SeminarSettings(
        abstract_reminder_days=get_setting_int(db, 'abstract_reminder_days', 7),
        arxiv_reminder_days=get_setting_int(db, 'arxiv_reminder_days', 7),
    )


@router.put('/settings', response_model=SeminarSettings)
def update_seminar_settings(
    body: SeminarSettings,
    _: User = Depends(admin_only),
    db: Session = Depends(get_db)
):
    """管理员修改组会提前提醒天数"""
    set_setting(db, 'abstract_reminder_days', body.abstract_reminder_days)
    set_setting(db, 'arxiv_reminder_days', body.arxiv_reminder_days)
    return body


@router.get('/mine/upcoming')
def my_upcoming(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return upcoming_for_user(db, current_user)


@router.get('/reminders')
def reminders(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """获取当前成员的主讲未填摘要及分享未填论文待办提醒"""
    return due_reminders_for_user(db, current_user.id)


class AbstractInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra='forbid')
    abstract: str = Field(min_length=1, max_length=20000)


@router.put('/{seminar_id}/abstract', response_model=SeminarOut)
def submit_abstract(seminar_id: int, body: AbstractInput, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    seminar = db.get(SeminarSchedule, seminar_id)
    if not seminar:
        raise HTTPException(404, '组会不存在')
    if seminar.presenter_id != current_user.id and current_user.role != 'admin':
        raise HTTPException(403, '只有主讲人本人或管理员可以填写摘要')
    if seminar.status == 'cancelled':
        raise HTTPException(400, '组会已取消')
    seminar.abstract = body.abstract
    db.commit(); db.refresh(seminar)
    return format_seminar(seminar, current_user.id, db)


@router.get('/check-arxiv-presented')
def check_arxiv_presented(
    arxiv_id: str = '',
    current_seminar_id: Optional[int] = None,
    db: Session = Depends(get_db)
):
    """检测 arXiv 文献是否已在组会中分享过"""
    from ..services.arxiv_service import extract_arxiv_id
    clean_id = extract_arxiv_id(arxiv_id or '')
    if not clean_id:
        return {'presented': False}
    clean_id = re.sub(r'v\d+$', '', clean_id)

    # 1. 检索 library_papers 中 from_seminar = True
    lib_paper = db.query(LibraryPaper).filter(
        LibraryPaper.from_seminar == True,
        or_(
            LibraryPaper.arxiv_id == clean_id,
            LibraryPaper.arxiv_id.like(f'{clean_id}%'),
            LibraryPaper.arxiv_id.like(f'arXiv:{clean_id}%')
        )
    ).first()

    if lib_paper:
        if current_seminar_id and lib_paper.seminar_id == current_seminar_id:
            return {'presented': False}
        return {
            'presented': True,
            'paper': {
                'id': lib_paper.id,
                'arxiv_id': lib_paper.arxiv_id,
                'title': lib_paper.title,
                'seminar_id': lib_paper.seminar_id
            }
        }

    # 2. 检索 seminar_presentations
    pres = db.query(SeminarPresentation).filter(
        SeminarPresentation.arxiv_id != '',
        or_(
            SeminarPresentation.arxiv_id == clean_id,
            SeminarPresentation.arxiv_id.like(f'%{clean_id}%')
        )
    ).first()

    if pres:
        if current_seminar_id and pres.seminar_id == current_seminar_id:
            return {'presented': False}
        return {
            'presented': True,
            'paper': {
                'id': pres.id,
                'arxiv_id': pres.arxiv_id,
                'title': f'arXiv:{pres.arxiv_id}',
                'seminar_id': pres.seminar_id
            }
        }

    return {'presented': False}


@router.put('/{seminar_id}/presentation-arxiv', response_model=SeminarOut)
@router.put('/{seminar_id}/presentation-share', response_model=SeminarOut)
async def submit_presentation_arxiv(
    seminar_id: int,
    body: PresentationArxivInput,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """分享人或管理员补充组会分享的 arXiv 编号或链接及 Slides 课件"""
    seminar = db.get(SeminarSchedule, seminar_id)
    if not seminar:
        raise HTTPException(404, '组会不存在')
    if seminar.status == 'cancelled':
        raise HTTPException(400, '组会已取消')

    user_names = {name.strip().lower() for name in [current_user.real_name, current_user.name, current_user.nickname] if name and name.strip()}
    target_presentation = None
    for p in seminar.presentations:
        if body.presentation_id is not None and p.id == body.presentation_id:
            target_presentation = p
            break
        elif body.presentation_id is None and (p.presenter_id == current_user.id or (p.presenter_name and p.presenter_name.strip().lower() in user_names)):
            target_presentation = p
            if not target_presentation.presenter_id:
                target_presentation.presenter_id = current_user.id
            break

    is_mgr = current_user.role in ('admin', 'teacher') or current_user.can_manage_seminars

    if not target_presentation:
        # 如果未明确指定且不是分享人，管理员允许更新第一个未填写的
        if is_mgr and seminar.presentations:
            target_presentation = next((p for p in seminar.presentations if not (p.arxiv_id or '').strip()), seminar.presentations[0])
        else:
            raise HTTPException(404, '未在该组会中找到对应的文献分享人记录')

    if target_presentation.presenter_id != current_user.id and not is_mgr:
        if target_presentation.presenter_name and target_presentation.presenter_name.strip().lower() in user_names:
            target_presentation.presenter_id = current_user.id
        else:
            raise HTTPException(403, '只有该文献分享人本人或管理员可以修改分享内容')

    if body.arxiv_id is not None:
        target_presentation.arxiv_id = body.arxiv_id.strip()
    if body.slides_url is not None:
        target_presentation.slides_url = body.slides_url.strip()

    # 归档入文献库
    if target_presentation.arxiv_id:
        pres_input = PresentationInput(
            presenter_id=target_presentation.presenter_id,
            presenter_name=target_presentation.presenter_name,
            arxiv_id=target_presentation.arxiv_id,
            slides_url=target_presentation.slides_url
        )
        references = await prepare_references(db, [pres_input])
        for entry in references.values():
            paper_obj = archive(db, entry['data'], 'seminar', ready=entry['ready'])
            if paper_obj and hasattr(paper_obj, 'seminar_id') and not paper_obj.seminar_id:
                paper_obj.seminar_id = seminar.id

    db.commit()
    db.refresh(seminar)
    return format_seminar(seminar, current_user.id, db)


class ScheduleImport(BaseModel):
    rows: List[SeminarCreate] = Field(min_length=1, max_length=200)


@router.post('/parse-import-file')
async def parse_import_file_endpoint(
    file: UploadFile = File(...),
    sheet_name: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """解析上传的排期文件（.xlsx 或 .csv/.tsv）并匹配系统成员"""
    content = await file.read()
    from ..services.schedule_parser import parse_schedule_file
    result = parse_schedule_file(content, filename=file.filename or '', sheet_name=sheet_name, db=db)
    return result


class ParseTextInput(BaseModel):
    text: str


@router.post('/parse-import-text')
def parse_import_text_endpoint(
    body: ParseTextInput,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """解析直接粘贴的排期文本（CSV/TSV）"""
    from ..services.schedule_parser import parse_schedule_text
    return parse_schedule_text(body.text, db=db)


@router.post('/import')
def import_schedule(body: ScheduleImport, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    prepared = []
    for index, row in enumerate(body.rows):
        if row.paper_id or (row.abstract and row.abstract.strip()):
            raise HTTPException(400, '初始批量排期仅导入时间、主讲人、arXiv 分享人、主题和地点；摘要由主讲人稍后填写')

        p_name = (row.presenter_name or "").strip()
        p_id = row.presenter_id
        if p_name:
            try:
                presenter = resolve_presenter(db, row.presenter_id, p_name)
                if presenter:
                    p_id = presenter.id
                    p_name = presenter.real_name or presenter.name
            except ValueError:
                pass
        else:
            p_id = None

        key = (row.date, row.time, p_name)
        if any(k == key for k, _ in prepared):
            raise HTTPException(409, f'第 {index + 1} 行与待导入排期重复')

        seminar = SeminarSchedule(
            date=row.date,
            time=row.time,
            location=row.location or "待定",
            presenter_name=p_name,
            presenter_id=p_id,
            topic=row.topic or ("工作汇报（待定）" if p_name else "arXiv 文献分享"),
            status="upcoming"
        )
        db.add(seminar)
        db.flush()

        for pos, pres in enumerate(row.presentations or []):
            sharer_name = (pres.presenter_name or "").strip()
            if not sharer_name:
                continue
            sharer_id = pres.presenter_id
            try:
                u = resolve_presenter(db, sharer_id, sharer_name)
                if u:
                    sharer_id = u.id
                    sharer_name = u.real_name or u.name
            except ValueError:
                pass
            p_record = SeminarPresentation(
                seminar_id=seminar.id,
                position=pos,
                presenter_id=sharer_id,
                presenter_name=sharer_name,
                arxiv_id=(pres.arxiv_id or "").strip(),
                slides_url=pres.slides_url or ""
            )
            db.add(p_record)

        prepared.append((key, seminar))

    db.commit()
    return {'imported': len(prepared)}


@router.post("/reschedule", response_model=SeminarRescheduleResult)
def reschedule_seminars(
    req: SeminarReschedule,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Atomically move upcoming seminars, comparing each original calendar date."""
    conflicts = []
    try:
        for change in req.changes:
            result = db.execute(
                update(SeminarSchedule)
                .where(
                    SeminarSchedule.id == change.id,
                    SeminarSchedule.date == change.expected_date,
                    SeminarSchedule.status == "upcoming",
                )
                .values(date=change.date)
                .execution_options(synchronize_session=False)
            )
            if result.rowcount != 1:
                conflicts.append(change)
        if conflicts:
            db.rollback()
            details = []
            for change in conflicts:
                current = db.get(SeminarSchedule, change.id)
                details.append({
                    "id": change.id,
                    "expected_date": change.expected_date,
                    "date": change.date,
                    "current_date": current.date if current else None,
                    "status": current.status if current else None,
                    "reason": "missing" if current is None else (
                        "completed" if current.status != "upcoming" else "date_changed"
                    ),
                })
            raise HTTPException(status_code=409, detail={
                "message": "部分组会已发生变化，整批改期尚未保存，请核对后重试。",
                "conflicts": details,
            })
        db.commit()
    except OperationalError:
        db.rollback()
        raise HTTPException(status_code=503, detail="排期暂时无法保存，请核对后重试。")
    return {"updated_ids": [change.id for change in req.changes]}


@router.get("", response_model=List[SeminarOut])
def get_seminars(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """获取组会排期列表（按日期升序/倒序排列）"""
    seminars = db.query(SeminarSchedule).order_by(SeminarSchedule.date.desc(), SeminarSchedule.time.desc()).all()
    
    return [format_seminar(s, current_user.id, db) for s in seminars]


def format_seminar(seminar, user_id, db):
    from .arxiv import _format_paper_out
    data = {c.name: getattr(seminar, c.name) for c in SeminarSchedule.__table__.columns}
    # Shared seminars only embed public recommendations, never private comments or recipients.
    shared_paper = seminar.paper if seminar.paper and not seminar.paper.audience else None
    data['paper'] = _format_paper_out(shared_paper, user_id, db) if shared_paper else None
    if not shared_paper:
        data['paper_id'] = None
    data['presentations'] = seminar.presentations
    return SeminarOut.model_validate(data)


def set_presentations(db, seminar, presentations, references):
    for entry in references.values():
        paper_obj = archive(db, entry['data'], 'seminar', ready=entry['ready'])
        if paper_obj and hasattr(paper_obj, 'seminar_id') and not paper_obj.seminar_id:
            paper_obj.seminar_id = seminar.id
    seminar.presentations = []
    for index, item in enumerate(presentations):
        try:
            presenter = resolve_presenter(db, item.presenter_id, item.presenter_name)
        except ValueError as exc:
            raise HTTPException(400, str(exc))
        values = item.model_dump()
        values['presenter_id'] = presenter.id if presenter else None
        seminar.presentations.append(SeminarPresentation(position=index, **values))


def archive_linked(db, paper_id):
    if paper_id is None:
        return
    paper = db.get(ArxivPaper, paper_id)
    if paper is None or paper.audience:
        raise HTTPException(400, '请选择公开推荐中的文献；组会对全组可见')
    archive(db, {c.name: getattr(paper, c.name) for c in ArxivPaper.__table__.columns}, 'seminar')


@router.post("", response_model=SeminarOut)
async def create_seminar(
    req: SeminarCreate,
    current_user: User = Depends(seminar_manager),
    db: Session = Depends(get_db)
):
    """新增组会排期"""
    presenter_name = (req.presenter_name or "").strip()
    presenter_id = req.presenter_id
    if presenter_name:
        try:
            presenter = resolve_presenter(db, req.presenter_id, presenter_name)
        except ValueError as exc:
            raise HTTPException(400, str(exc))
        presenter_id = presenter.id if presenter else None
        presenter_name = (presenter.real_name or presenter.name) if presenter else presenter_name
    else:
        presenter_id = None

    if req.abstract.strip() and current_user.role != 'admin' and (not presenter_id or presenter_id != current_user.id):
        raise HTTPException(403, '摘要请由主讲人本人填写')
    seminar = SeminarSchedule(
        date=req.date,
        time=req.time,
        location=req.location or "待定",
        presenter_name=presenter_name,
        presenter_id=presenter_id,
        topic=req.topic or ("工作汇报（待定）" if presenter_name else "arXiv 文献分享"),
        paper_id=None,
        slides_url=req.slides_url,
        notes=req.notes,
        abstract=req.abstract,
        status="upcoming"
    )
    references = await prepare_references(db, req.presentations)
    db.add(seminar)
    set_presentations(db, seminar, req.presentations, references)
    db.commit()
    db.refresh(seminar)
    return format_seminar(seminar, current_user.id, db)


@router.put("/{seminar_id}", response_model=SeminarOut)
async def update_seminar(
    seminar_id: int,
    req: SeminarUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """更新组会状态（如标记已完成、上传PPT等）"""
    seminar = db.query(SeminarSchedule).filter(SeminarSchedule.id == seminar_id).first()
    if not seminar:
        raise HTTPException(status_code=404, detail="未找到该组会记录")

    update_data = req.model_dump(exclude_unset=True)

    is_manager = current_user.role in ('admin', 'teacher') or current_user.can_manage_seminars
    if not is_manager:
        # 普通成员权限限制：只允许修改自己作为主讲人的摘要，或自己作为分享人的 arXiv 编号与 Slides
        is_main_presenter = (seminar.presenter_id == current_user.id)
        user_pres_ids = {p.id for p in seminar.presentations if p.presenter_id == current_user.id}

        # 1. 检查是否篡改了受保护字段
        disallowed_fields = {'date', 'time', 'location', 'topic', 'status', 'paper_id', 'notes', 'slides_url', 'presenter_name', 'presenter_id'}
        if is_main_presenter:
            disallowed_fields.discard('time')
        for f in disallowed_fields:
            if f in update_data and getattr(seminar, f) != update_data[f]:
                raise HTTPException(403, '普通成员无权修改组会的排期、地点、主题或状态等信息')

        # 2. 检查摘要权限
        if 'abstract' in update_data and update_data['abstract'] != seminar.abstract:
            if not is_main_presenter:
                raise HTTPException(403, '只有主讲人本人可以填写或修改摘要')

        # 3. 检查分享人列表权限
        if 'presentations' in update_data:
            new_pres = req.presentations or []
            if len(new_pres) != len(seminar.presentations):
                raise HTTPException(403, '普通成员无权增加或删除文献分享人')
            for orig, cur in zip(seminar.presentations, new_pres):
                if cur.presenter_id != orig.presenter_id or (cur.presenter_name or '').strip() != (orig.presenter_name or '').strip():
                    raise HTTPException(403, '普通成员无权更改分享人姓名或账号绑定')
                if orig.id not in user_pres_ids:
                    if (cur.arxiv_id or '').strip() != (orig.arxiv_id or '').strip() or (cur.slides_url or '') != (orig.slides_url or ''):
                        raise HTTPException(403, '你只能修改属于自己的文献分享内容（arXiv编号与课件）')

    if 'abstract' in update_data and update_data['abstract'] != seminar.abstract:
        if seminar.presenter_id != current_user.id and current_user.role != 'admin':
            raise HTTPException(403, '只有主讲人本人或管理员可以填写摘要')
        if update_data['abstract'] is None:
            raise HTTPException(422, '摘要不能为 null')
    if 'presenter_id' in update_data or 'presenter_name' in update_data:
        p_name = (update_data.get('presenter_name') if 'presenter_name' in update_data else seminar.presenter_name) or ''
        p_name = p_name.strip()
        if p_name:
            try:
                presenter = resolve_presenter(db, update_data.get('presenter_id'), p_name)
            except ValueError as exc:
                raise HTTPException(400, str(exc))
            update_data['presenter_id'] = presenter.id if presenter else None
            update_data['presenter_name'] = (presenter.real_name or presenter.name) if presenter else p_name
        else:
            update_data['presenter_id'] = None
            update_data['presenter_name'] = ""
        if update_data['presenter_id'] != seminar.presenter_id and seminar.presenter_id is not None and current_user.id != seminar.presenter_id and current_user.role not in ('admin', 'teacher'):
            raise HTTPException(403, '只有当前主讲人、导师或管理员可以重新指派主讲人')
    if 'presentations' in update_data:
        if req.presentations is None:
            raise HTTPException(422, '文献分享列表不能为 null；清空时请传入空列表')
        update_data.pop('presentations')
        references = await prepare_references(db, req.presentations)
        set_presentations(db, seminar, req.presentations, references)
    for field in ('topic', 'location', 'status'):
        if field in update_data and not update_data[field]:
            raise HTTPException(422, f'{field} 不能为空')
    for field, value in update_data.items():
        setattr(seminar, field, value)

    db.commit()
    db.refresh(seminar)
    return format_seminar(seminar, current_user.id, db)


@router.delete("/{seminar_id}")
def delete_seminar(
    seminar_id: int,
    current_user: User = Depends(seminar_manager),
    db: Session = Depends(get_db)
):
    """删除组会记录"""
    seminar = db.query(SeminarSchedule).filter(SeminarSchedule.id == seminar_id).first()
    if not seminar:
        raise HTTPException(status_code=404, detail="未找到该组会记录")

    db.delete(seminar)
    db.commit()
    return {"message": "删除成功"}


class BatchLocationRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra='forbid')
    location: str = Field(min_length=1, max_length=100)
    scope: str = Field(default='upcoming')  # 'upcoming', 'all', 'unset_only'


@router.post('/batch-location')
def batch_set_location(
    req: BatchLocationRequest,
    current_user: User = Depends(seminar_manager),
    db: Session = Depends(get_db)
):
    """【管理员/负责人】批量设置固定会议号或研讨室"""
    query = db.query(SeminarSchedule).filter(SeminarSchedule.status != 'cancelled')
    if req.scope == 'upcoming':
        query = query.filter(SeminarSchedule.status == 'upcoming')
    elif req.scope == 'unset_only':
        query = query.filter(
            (SeminarSchedule.location == '') | 
            (SeminarSchedule.location == '待定') | 
            (SeminarSchedule.location.is_(None))
        )
    elif req.scope != 'all':
        raise HTTPException(400, f'未知的作用范围: {req.scope}')

    items = query.all()
    for s in items:
        s.location = req.location
    db.commit()
    return {
        "message": f"已将会议号成功应用至 {len(items)} 场组会",
        "updated_count": len(items),
        "location": req.location
    }


class PostponeCascadeRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra='forbid')
    days: int = Field(ge=1, le=365)


@router.post('/{seminar_id}/postpone-cascade')
def postpone_cascade(
    seminar_id: int,
    req: PostponeCascadeRequest,
    current_user: User = Depends(seminar_manager),
    db: Session = Depends(get_db)
):
    """【管理员/负责人】将选定组会及在此之后的所有待举行组会依次自动顺延指定天数"""
    target = db.get(SeminarSchedule, seminar_id)
    if not target:
        raise HTTPException(404, '未找到该组会记录')
    if target.status != 'upcoming':
        raise HTTPException(400, '仅支持顺延待举行的组会')

    # 查找日期大于等于 target.date 的所有 upcoming 组会，按日期升序排列
    upcoming_chain = db.query(SeminarSchedule).filter(
        SeminarSchedule.status == 'upcoming',
        SeminarSchedule.date >= target.date
    ).order_by(SeminarSchedule.date.asc(), SeminarSchedule.id.asc()).all()

    affected_count = 0
    for s in upcoming_chain:
        try:
            curr_d = datetime.strptime(s.date, '%Y-%m-%d').date()
            new_d = curr_d + timedelta(days=req.days)
            s.date = new_d.strftime('%Y-%m-%d')
            affected_count += 1
        except Exception:
            pass

    db.commit()
    return {
        "message": f"已将选定及后续共 {affected_count} 场组会顺延 {req.days} 天",
        "affected_count": affected_count,
        "days": req.days
    }


class SwapSeminarsRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    id1: int
    id2: int


@router.post('/swap')
def swap_seminars(
    req: SwapSeminarsRequest,
    current_user: User = Depends(seminar_manager),
    db: Session = Depends(get_db)
):
    """【管理员/负责人】原子交换两场待举行组会的举行排期（日期与时间）"""
    if req.id1 == req.id2:
        raise HTTPException(400, '不能与自身交换排期')
    s1 = db.get(SeminarSchedule, req.id1)
    s2 = db.get(SeminarSchedule, req.id2)
    if not s1 or not s2:
        raise HTTPException(404, '组会记录不存在')
    if s1.status != 'upcoming' or s2.status != 'upcoming':
        raise HTTPException(400, '仅支持对待举行的组会日程交换排期')

    # 原子交换举行日期和时间
    s1.date, s2.date = s2.date, s1.date
    s1.time, s2.time = s2.time, s1.time
    db.commit()
    db.refresh(s1)
    db.refresh(s2)
    return {
        "message": f"已交换「{s1.topic}」与「{s2.topic}」的组会排期",
        "swapped": [
            {"id": s1.id, "date": s1.date, "time": s1.time, "topic": s1.topic},
            {"id": s2.id, "date": s2.date, "time": s2.time, "topic": s2.topic}
        ]
    }
