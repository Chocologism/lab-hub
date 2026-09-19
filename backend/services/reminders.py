from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from sqlalchemy import or_, func
from ..models import SeminarSchedule, SeminarPresentation, User, SystemSetting


def get_setting_int(db, key, default):
    setting = db.get(SystemSetting, key)
    if setting and setting.value.isdigit():
        return int(setting.value)
    return default


def set_setting(db, key, value):
    setting = db.get(SystemSetting, key)
    if not setting:
        setting = SystemSetting(key=key, value=str(value))
        db.add(setting)
    else:
        setting.value = str(value)
    db.commit()


def due_seminars(db, user_id, now=None):
    """Live work queue: rescheduling, reassignment and submission cannot leave stale alerts."""
    now = now or datetime.now(ZoneInfo('Asia/Shanghai'))
    today = now.date()
    days = get_setting_int(db, 'abstract_reminder_days', 7)
    rows = db.query(SeminarSchedule).filter(
        SeminarSchedule.presenter_id == user_id,
        SeminarSchedule.status == 'upcoming',
        SeminarSchedule.date >= today.isoformat(),
        SeminarSchedule.date <= (today + timedelta(days=days)).isoformat(),
        or_(SeminarSchedule.abstract.is_(None), func.trim(SeminarSchedule.abstract) == ''),
    ).order_by(SeminarSchedule.date, SeminarSchedule.time).all()
    result = []
    for row in rows:
        try:
            start = datetime.fromisoformat(f'{row.date}T{row.time}').replace(tzinfo=ZoneInfo('Asia/Shanghai'))
        except ValueError:
            continue
        if now <= start <= now + timedelta(days=days):
            result.append(row)
    return result


def due_reminders_for_user(db, user_id, now=None):
    """获取指定用户的全部临近待办提醒：主讲摘要提醒 + arXiv分享链接提醒"""
    now = now or datetime.now(ZoneInfo('Asia/Shanghai'))
    today = now.date()
    abstract_days = get_setting_int(db, 'abstract_reminder_days', 7)
    arxiv_days = get_setting_int(db, 'arxiv_reminder_days', 7)

    reminders = []

    # 1. 主讲人未填摘要提醒
    for s in due_seminars(db, user_id, now):
        reminders.append({
            "id": s.id,
            "seminar_id": s.id,
            "type": "abstract",
            "date": s.date,
            "time": s.time,
            "topic": s.topic,
            "presenter_id": s.presenter_id,
            "presenter_name": s.presenter_name,
            "message": f"组会将在 {abstract_days} 天内举行，请补充主讲摘要供大家预习"
        })

    # 2. arXiv 分享人未填链接提醒
    max_days = max(abstract_days, arxiv_days)
    upcoming_seminars = db.query(SeminarSchedule).filter(
        SeminarSchedule.status == 'upcoming',
        SeminarSchedule.date >= today.isoformat(),
        SeminarSchedule.date <= (today + timedelta(days=arxiv_days)).isoformat(),
    ).order_by(SeminarSchedule.date, SeminarSchedule.time).all()

    for s in upcoming_seminars:
        try:
            start = datetime.fromisoformat(f'{s.date}T{s.time}').replace(tzinfo=ZoneInfo('Asia/Shanghai'))
        except ValueError:
            continue
        if not (now <= start <= now + timedelta(days=arxiv_days)):
            continue

        for p in s.presentations:
            if p.presenter_id == user_id and not (p.arxiv_id or '').strip():
                reminders.append({
                    "id": f"arxiv-{s.id}-{p.id or p.position}",
                    "seminar_id": s.id,
                    "presentation_id": p.id,
                    "position": p.position,
                    "type": "arxiv",
                    "date": s.date,
                    "time": s.time,
                    "topic": s.topic,
                    "presenter_id": p.presenter_id,
                    "presenter_name": p.presenter_name,
                    "message": f"组会将在 {arxiv_days} 天内举行，请填写你分享的 arXiv 论文编号或链接"
                })

    return reminders


def resolve_presenter(db, presenter_id, name):
    if presenter_id is not None:
        user = db.get(User, presenter_id)
        if not user:
            raise ValueError('所选主讲人账号不存在')
        return user
    # Exact, unambiguous matches only. Never assign the organizer by default.
    candidates = db.query(User).filter(or_(User.name == name, User.real_name == name, User.nickname == name)).all() if name else []
    return candidates[0] if len(candidates) == 1 else None


def upcoming_for_user(db, user, now=None):
    zone = ZoneInfo('Asia/Shanghai')
    now = (now or datetime.now(zone)).astimezone(zone)
    result = {'main': None, 'arxiv': None}
    matches = {}

    def belongs(presenter_id, name):
        if presenter_id is not None:
            return presenter_id == user.id
        if name not in matches:
            resolved = resolve_presenter(db, None, name)
            matches[name] = resolved is not None and resolved.id == user.id
        return matches[name]

    rows = db.query(SeminarSchedule).filter(SeminarSchedule.status == 'upcoming',
        SeminarSchedule.date >= now.date().isoformat()).order_by(SeminarSchedule.date, SeminarSchedule.time, SeminarSchedule.id)
    for row in rows:
        try:
            start = datetime.fromisoformat(f'{row.date}T{row.time}').replace(tzinfo=zone)
        except ValueError:
            continue
        if start < now:
            continue
        info = dict(id=row.id, date=row.date, time=row.time, topic=row.topic,
                    location=row.location, days_until=(start.date() - now.date()).days)
        if result['main'] is None and belongs(row.presenter_id, row.presenter_name):
            result['main'] = {**info, 'abstract_missing': not (row.abstract or '').strip()}
        if result['arxiv'] is None:
            shares = [p.arxiv_id for p in row.presentations if belongs(p.presenter_id, p.presenter_name)]
            if shares:
                result['arxiv'] = {**info, 'papers': shares}
        if all(result.values()):
            break
    return result


def auto_associate_user(db, user: User) -> dict:
    """当新用户注册或成员姓名更新时，自动将其与历史排期中同名的未关联主讲人与分享人绑定"""
    names = {
        name.strip().lower()
        for name in (user.real_name, user.name, user.nickname)
        if name and name.strip()
    }
    if not names:
        return {"matched_schedules": 0, "matched_presentations": 0}

    # 1. 匹配未关联的主讲人
    unlinked_schedules = db.query(SeminarSchedule).filter(
        SeminarSchedule.presenter_id.is_(None)
    ).all()
    matched_schedules = 0
    for s in unlinked_schedules:
        p_name = (s.presenter_name or "").strip().lower()
        if p_name and p_name in names:
            s.presenter_id = user.id
            matched_schedules += 1

    # 2. 匹配未关联的 arXiv 分享人
    unlinked_presentations = db.query(SeminarPresentation).filter(
        SeminarPresentation.presenter_id.is_(None)
    ).all()
    matched_presentations = 0
    for p in unlinked_presentations:
        p_name = (p.presenter_name or "").strip().lower()
        if p_name and p_name in names:
            p.presenter_id = user.id
            matched_presentations += 1

    if matched_schedules or matched_presentations:
        db.commit()

    return {
        "matched_schedules": matched_schedules,
        "matched_presentations": matched_presentations
    }


def batch_match_presenters(db) -> dict:
    """遍历所有已注册用户，手动一键批量关联未关联的主讲人与 arXiv 分享人"""
    users = db.query(User).all()
    name_map = {}
    for u in users:
        for name in (u.real_name, u.name, u.nickname):
            if name and name.strip():
                clean = name.strip().lower()
                if clean not in name_map:
                    name_map[clean] = u

    # 1. 匹配主讲人
    unlinked_schedules = db.query(SeminarSchedule).filter(
        SeminarSchedule.presenter_id.is_(None)
    ).all()
    matched_schedules = 0
    for s in unlinked_schedules:
        p_name = (s.presenter_name or "").strip().lower()
        if p_name and p_name in name_map:
            s.presenter_id = name_map[p_name].id
            matched_schedules += 1

    # 2. 匹配分享人
    unlinked_presentations = db.query(SeminarPresentation).filter(
        SeminarPresentation.presenter_id.is_(None)
    ).all()
    matched_presentations = 0
    for p in unlinked_presentations:
        p_name = (p.presenter_name or "").strip().lower()
        if p_name and p_name in name_map:
            p.presenter_id = name_map[p_name].id
            matched_presentations += 1

    if matched_schedules or matched_presentations:
        db.commit()

    stats = get_association_stats(db)
    return {
        "matched_schedules": matched_schedules,
        "matched_presentations": matched_presentations,
        "matched_users": matched_schedules + matched_presentations,
        "matched_presenter_slots": matched_schedules,
        "matched_presentation_slots": matched_presentations,
        "total_matched": matched_schedules + matched_presentations,
        "message": f"已成功关联 {matched_schedules} 位主讲人席位与 {matched_presentations} 位 arXiv 分享人席位",
        "stats": stats
    }


def get_association_stats(db) -> dict:
    """检测当前日程是否与已注册用户关联，统计已关联/未关联/未注册人次及明细"""
    users = db.query(User).all()
    name_map = {}
    for u in users:
        for name in (u.real_name, u.name, u.nickname):
            if name and name.strip():
                clean = name.strip().lower()
                if clean not in name_map:
                    name_map[clean] = u

    schedules = db.query(SeminarSchedule).order_by(SeminarSchedule.date.desc()).all()
    presentations = db.query(SeminarPresentation).all()

    total_schedules = len(schedules)
    total_slots = 0
    linked_slots = 0
    unlinked_slots = 0
    matchable_slots = 0
    unregistered_slots = 0

    unregistered_names_set = set()
    unlinked_details = []

    sched_map = {s.id: s for s in schedules}

    # 1. 检查主讲人
    total_presenter_slots = 0
    associated_presenter_slots = 0
    unassociated_presenter_slots = 0

    for s in schedules:
        p_name = (s.presenter_name or "").strip()
        if not p_name:
            continue
        total_slots += 1
        total_presenter_slots += 1
        if s.presenter_id is not None:
            linked_slots += 1
            associated_presenter_slots += 1
        else:
            unlinked_slots += 1
            unassociated_presenter_slots += 1
            lower_name = p_name.lower()
            if lower_name in name_map:
                matchable_slots += 1
                matched_user = name_map[lower_name]
                status = "can_match"
                matched_user_info = {
                    "id": matched_user.id,
                    "name": matched_user.real_name or matched_user.name,
                    "email": matched_user.email
                }
            else:
                unregistered_slots += 1
                unregistered_names_set.add(p_name)
                status = "unregistered"
                matched_user_info = None

            unlinked_details.append({
                "seminar_id": s.id,
                "date": s.date,
                "time": s.time,
                "topic": s.topic,
                "role_type": "main",
                "role_label": "主讲人",
                "presenter_name": p_name,
                "status": status,
                "matched_user": matched_user_info
            })

    # 2. 检查 arXiv 分享人
    total_presentation_slots = 0
    associated_presentation_slots = 0
    unassociated_presentation_slots = 0

    for p in presentations:
        p_name = (p.presenter_name or "").strip()
        if not p_name:
            continue
        total_slots += 1
        total_presentation_slots += 1
        if p.presenter_id is not None:
            linked_slots += 1
            associated_presentation_slots += 1
        else:
            unlinked_slots += 1
            unassociated_presentation_slots += 1
            lower_name = p_name.lower()
            s = sched_map.get(p.seminar_id)
            if lower_name in name_map:
                matchable_slots += 1
                matched_user = name_map[lower_name]
                status = "can_match"
                matched_user_info = {
                    "id": matched_user.id,
                    "name": matched_user.real_name or matched_user.name,
                    "email": matched_user.email
                }
            else:
                unregistered_slots += 1
                unregistered_names_set.add(p_name)
                status = "unregistered"
                matched_user_info = None

            unlinked_details.append({
                "seminar_id": p.seminar_id,
                "date": s.date if s else "",
                "time": s.time if s else "",
                "topic": s.topic if s else "组会分享",
                "role_type": "arxiv",
                "role_label": "arXiv分享人",
                "presenter_name": p_name,
                "status": status,
                "matched_user": matched_user_info
            })

    unlinked_details.sort(key=lambda x: x.get("date", ""), reverse=True)

    return {
        "registered_users_count": len(users),
        "total_schedules": total_schedules,
        "total_seminars": total_schedules,
        "total_slots": total_slots,
        "total_presenter_slots": total_presenter_slots,
        "associated_presenter_slots": associated_presenter_slots,
        "unassociated_presenter_slots": unassociated_presenter_slots,
        "total_presentation_slots": total_presentation_slots,
        "associated_presentation_slots": associated_presentation_slots,
        "unassociated_presentation_slots": unassociated_presentation_slots,
        "linked_slots": linked_slots,
        "unlinked_slots": unlinked_slots,
        "matchable_slots": matchable_slots,
        "unregistered_slots": unregistered_slots,
        "unregistered_names": sorted(list(unregistered_names_set)),
        "unmatchable_names": sorted(list(unregistered_names_set)),
        "unmatchable_slots": unregistered_slots,
        "unlinked_details": unlinked_details
    }

