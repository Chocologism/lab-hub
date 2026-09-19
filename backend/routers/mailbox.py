from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from sqlalchemy import or_
from typing import List, Optional
import email.utils
import json
import threading
from queue import Queue, Empty
import jwt

from ..auth import get_current_user, SECRET_KEY, ALGORITHM, security
from ..database import get_db, SessionLocal
from ..models import User, UserMailConfig, UserCachedEmail, UploadedFile, ObservatoryTalk, SeminarPresentation, SeminarSchedule
from ..schemas import MailConfigInput, MailConfigOut, MailTestInput, CachedEmailOut, EmailDetailOut
from ..services.mailbox_service import (
    encrypt_password,
    decrypt_password,
    test_mail_connection,
    sync_mailbox_messages
)

router = APIRouter(prefix="/api/mailbox", tags=["Mailbox"])


def cleanup_orphan_posters(db: Session, poster_urls: List[str]):
    """清理不再被任何日程、学术会议或邮件引用的本地附件文件"""
    import re
    cleaned_file_ids = set()
    for url in poster_urls:
        if not url:
            continue
        match = re.search(r"/api/files/([a-f0-9\-]{36})", url, re.IGNORECASE)
        if match:
            cleaned_file_ids.add(match.group(1))

    for file_id in cleaned_file_ids:
        file_url = f"/api/files/{file_id}"
        # 1. 保护学术日程与学术会议（海报、手册、说明中的引用）
        talk_ref = db.query(ObservatoryTalk).filter(
            or_(
                ObservatoryTalk.poster_url == file_url,
                ObservatoryTalk.handbook_url == file_url,
                ObservatoryTalk.notes.contains(file_id)
            )
        ).first()
        if talk_ref:
            continue

        # 2. 保护组会报告课件与组会日程
        sem_pres = db.query(SeminarPresentation).filter(SeminarPresentation.slides_url == file_url).first()
        if sem_pres:
            continue

        sem_sched = db.query(SeminarSchedule).filter(SeminarSchedule.notes.contains(file_id)).first()
        if sem_sched:
            continue

        # 3. 保护其他仍保存在本地缓存的邮件引用
        email_ref = db.query(UserCachedEmail).filter(
            or_(
                UserCachedEmail.poster_url == file_url,
                UserCachedEmail.attachments.contains(file_url),
                UserCachedEmail.body_html.contains(file_id)
            )
        ).first()
        if email_ref:
            continue

        file_row = db.query(UploadedFile).filter(UploadedFile.id == file_id).first()
        if file_row:
            db.delete(file_row)


@router.get("/config", response_model=MailConfigOut)
def get_mailbox_config(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """获取当前用户的邮箱配置信息（密码已脱敏）"""
    config = db.query(UserMailConfig).filter(UserMailConfig.user_id == current_user.id).first()
    if not config:
        return MailConfigOut(has_config=False)

    return MailConfigOut(
        has_config=True,
        email_address=config.email_address,
        protocol=config.protocol or "imap",
        server_host=config.server_host,
        server_port=config.server_port,
        use_ssl=config.use_ssl,
        username=config.username,
        has_password=bool(config.encrypted_password),
        updated_at=config.updated_at.strftime("%Y-%m-%d %H:%M") if config.updated_at else ""
    )


@router.post("/config", response_model=MailConfigOut)
def save_mailbox_config(
    body: MailConfigInput,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """保存或更新当前用户的邮箱配置"""
    config = db.query(UserMailConfig).filter(UserMailConfig.user_id == current_user.id).first()
    
    if not config:
        if not body.password:
            raise HTTPException(status_code=422, detail="首次配置邮箱必须提供登录密码或客户端授权码")
        config = UserMailConfig(
            user_id=current_user.id,
            email_address=body.email_address.strip(),
            protocol=body.protocol.strip().lower(),
            server_host=body.server_host.strip(),
            server_port=body.server_port,
            use_ssl=body.use_ssl,
            username=body.username.strip(),
            encrypted_password=encrypt_password(body.password)
        )
        db.add(config)
    else:
        config.email_address = body.email_address.strip()
        config.protocol = body.protocol.strip().lower()
        config.server_host = body.server_host.strip()
        config.server_port = body.server_port
        config.use_ssl = body.use_ssl
        config.username = body.username.strip()
        if body.password and body.password.strip():
            config.encrypted_password = encrypt_password(body.password.strip())

    db.commit()
    db.refresh(config)

    return MailConfigOut(
        has_config=True,
        email_address=config.email_address,
        protocol=config.protocol,
        server_host=config.server_host,
        server_port=config.server_port,
        use_ssl=config.use_ssl,
        username=config.username,
        has_password=bool(config.encrypted_password),
        updated_at=config.updated_at.strftime("%Y-%m-%d %H:%M") if config.updated_at else ""
    )


@router.post("/test")
def test_connection_endpoint(
    body: MailTestInput,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """测试当前邮箱配置连通性"""
    password = body.password
    # 若未传入新密码，但数据库已保存过配置，则读取已保存的解密密码
    if not password or not password.strip():
        config = db.query(UserMailConfig).filter(UserMailConfig.user_id == current_user.id).first()
        if config and config.encrypted_password:
            try:
                password = decrypt_password(config.encrypted_password)
            except Exception:
                raise HTTPException(status_code=400, detail="本地保存的密码解密失败，请重新输入密码")
        else:
            raise HTTPException(status_code=422, detail="请输入邮箱密码或客户端授权码以进行连接测试")

    res = test_mail_connection(
        protocol=body.protocol,
        host=body.server_host.strip(),
        port=body.server_port,
        use_ssl=body.use_ssl,
        username=body.username.strip(),
        password=password.strip()
    )
    return res


@router.delete("/config")
def delete_mailbox_config(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """解绑并清除邮箱配置与本地缓存邮件"""
    config = db.query(UserMailConfig).filter(UserMailConfig.user_id == current_user.id).first()
    if config:
        db.delete(config)
    user_emails = db.query(UserCachedEmail).filter(UserCachedEmail.user_id == current_user.id).all()
    file_urls = []
    for e in user_emails:
        if e.poster_url:
            file_urls.append(e.poster_url)
        if e.attachments:
            try:
                for att in json.loads(e.attachments):
                    if isinstance(att, dict) and att.get("url"):
                        file_urls.append(att["url"])
            except Exception:
                pass
    db.query(UserCachedEmail).filter(UserCachedEmail.user_id == current_user.id).delete()
    db.commit()
    if file_urls:
        try:
            cleanup_orphan_posters(db, file_urls)
            db.commit()
        except Exception:
            pass
    return {"message": "邮箱配置已成功解除绑定并清空本地缓存"}


@router.get("/sync-stream")
def sync_mailbox_stream(
    token: Optional[str] = Query(None),
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: Session = Depends(get_db)
):
    """通过 Server-Sent Events (SSE) 流式返回邮件同步实时进度与状态"""
    auth_token = credentials.credentials if credentials else token
    if not auth_token:
        raise HTTPException(status_code=401, detail="未提供身份认证凭据")
    try:
        payload = jwt.decode(auth_token, SECRET_KEY, algorithms=[ALGORITHM])
        sub_val = payload.get("sub")
        if not sub_val:
            raise HTTPException(status_code=401, detail="无效凭据")
        user_id = int(sub_val)
        user = db.query(User).filter(User.id == user_id).first()
    except Exception:
        raise HTTPException(status_code=401, detail="身份认证失败或凭据已过期")

    if not user:
        raise HTTPException(status_code=401, detail="未找到对应用户")

    config = db.query(UserMailConfig).filter(UserMailConfig.user_id == user.id).first()
    if not config:
        raise HTTPException(status_code=400, detail="当前用户尚未配置邮箱")

    q: Queue = Queue()

    def worker():
        thread_db = SessionLocal()
        try:
            thread_config = thread_db.query(UserMailConfig).filter(UserMailConfig.user_id == user.id).first()
            if not thread_config:
                q.put({"type": "error", "message": "邮箱配置不存在"})
                return

            def on_progress(payload):
                q.put({"type": "progress", **payload})

            items = sync_mailbox_messages(thread_config, thread_db, limit=50, on_progress=on_progress)
            q.put({
                "type": "done",
                "percent": 100,
                "message": f"同步完成，共获取 {len(items)} 封邮件",
                "count": len(items)
            })
        except Exception as exc:
            q.put({"type": "error", "message": f"同步失败: {str(exc)}"})
        finally:
            thread_db.close()
            q.put(None)

    t = threading.Thread(target=worker, daemon=True)
    t.start()

    def event_generator():
        while True:
            try:
                msg = q.get(timeout=30)
                if msg is None:
                    break
                yield f"data: {json.dumps(msg, ensure_ascii=False)}\n\n"
            except Empty:
                yield ": ping\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )


@router.get("/emails", response_model=List[CachedEmailOut])
def list_cached_emails(
    q: str = Query("", max_length=200),
    refresh: bool = Query(False),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """获取当前用户的邮件列表，可指定 refresh=True 触发从邮箱服务器拉取最新邮件"""
    config = db.query(UserMailConfig).filter(UserMailConfig.user_id == current_user.id).first()
    if not config:
        return []

    cache_count = db.query(UserCachedEmail).filter(UserCachedEmail.user_id == current_user.id).count()

    # 如果主动要求刷新，或本地尚无缓存，则尝试同步最近 50 封邮件
    if refresh or cache_count == 0:
        try:
            sync_mailbox_messages(config, db, limit=50)
        except Exception as exc:
            # 若初次同步失败且无缓存，则抛出提示；若已有缓存则返回已有缓存
            if cache_count == 0:
                raise HTTPException(status_code=502, detail=f"从邮箱服务器同步邮件失败: {str(exc)}")

    query = db.query(UserCachedEmail).filter(UserCachedEmail.user_id == current_user.id)
    if q and q.strip():
        word = q.strip()
        query = query.filter(
            or_(
                UserCachedEmail.subject.icontains(word, autoescape=True),
                UserCachedEmail.sender_name.icontains(word, autoescape=True),
                UserCachedEmail.sender_email.icontains(word, autoescape=True),
                UserCachedEmail.snippet.icontains(word, autoescape=True),
            )
        )

    results = query.all()

    # 严格按照邮件真实发送日期倒序排列（最新邮件排在最上面）
    def email_sort_key(item):
        if item.date_str:
            try:
                dt = email.utils.parsedate_to_datetime(item.date_str)
                return dt.timestamp()
            except Exception:
                pass
        return float(item.id or 0)

    results.sort(key=email_sort_key, reverse=True)

    # 内存去重、过期判定与自愈清理
    import re
    import time
    clean_list = []
    seen_uids = set()
    seen_meta = set()
    to_delete = []
    seven_days_ago_ts = time.time() - 7 * 24 * 3600

    for item in results:
        # 检查邮件是否超过 7 天保留期
        ts = None
        if item.date_str:
            try:
                clean_d = item.date_str.split('(')[0].strip()
                ts = email.utils.parsedate_to_datetime(clean_d).timestamp()
            except Exception:
                pass
        if ts is None and item.fetched_at:
            try:
                ts = item.fetched_at.timestamp()
            except Exception:
                pass

        if ts is not None and ts < seven_days_ago_ts:
            to_delete.append(item)
            continue

        clean_uid = re.sub(r'[<>]', '', item.msg_uid or '').strip()
        clean_subj = re.sub(r'\s+', '', item.subject or '').lower()
        date_key = (item.date_str or '').strip()
        meta_key = f"{clean_subj}__{date_key}" if (clean_subj and date_key) else ""

        is_dup = (clean_uid and clean_uid in seen_uids) or (meta_key and meta_key in seen_meta)
        if is_dup:
            to_delete.append(item)
        else:
            if clean_uid:
                seen_uids.add(clean_uid)
            if meta_key:
                seen_meta.add(meta_key)
            clean_list.append(item)

    if to_delete:
        for it in to_delete:
            db.delete(it)
        db.commit()

    return clean_list


@router.get("/emails/{email_id}", response_model=EmailDetailOut)
def get_email_detail(
    email_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """获取单封邮件的完整正文（含富文本 HTML）与详细收发件人信息"""
    import time
    email_item = (
        db.query(UserCachedEmail)
        .filter(UserCachedEmail.id == email_id, UserCachedEmail.user_id == current_user.id)
        .first()
    )
    if not email_item:
        raise HTTPException(status_code=404, detail="未找到该邮件")

    ts = None
    if email_item.date_str:
        try:
            clean_d = email_item.date_str.split('(')[0].strip()
            ts = email.utils.parsedate_to_datetime(clean_d).timestamp()
        except Exception:
            pass
    if ts is not None and (time.time() - ts) > 7 * 24 * 3600:
        db.delete(email_item)
        db.commit()
        raise HTTPException(status_code=404, detail="该邮件已超过 7 天保留期，已从本地缓存清理")

    return email_item


@router.delete("/emails")
def clear_cached_emails(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """清空当前用户所有已同步的邮件本地缓存，并释放孤立海报存储空间"""
    user_emails = db.query(UserCachedEmail).filter(UserCachedEmail.user_id == current_user.id).all()
    deleted_count = len(user_emails)
    file_urls = []
    for e in user_emails:
        if e.poster_url:
            file_urls.append(e.poster_url)
        if e.attachments:
            try:
                for att in json.loads(e.attachments):
                    if isinstance(att, dict) and att.get("url"):
                        file_urls.append(att["url"])
            except Exception:
                pass

    db.query(UserCachedEmail).filter(UserCachedEmail.user_id == current_user.id).delete()
    db.commit()

    if file_urls:
        try:
            cleanup_orphan_posters(db, file_urls)
            db.commit()
        except Exception:
            pass

    return {"message": "已成功清空本地邮件缓存", "deleted_count": deleted_count}


@router.delete("/emails/{email_id}")
def delete_cached_email(
    email_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """删除当前用户的单封本地缓存邮件，并释放对应孤立海报与附件"""
    email_item = (
        db.query(UserCachedEmail)
        .filter(UserCachedEmail.id == email_id, UserCachedEmail.user_id == current_user.id)
        .first()
    )
    if not email_item:
        raise HTTPException(status_code=404, detail="未找到该邮件")

    file_urls = []
    if email_item.poster_url:
        file_urls.append(email_item.poster_url)
    if email_item.attachments:
        try:
            for att in json.loads(email_item.attachments):
                if isinstance(att, dict) and att.get("url"):
                    file_urls.append(att["url"])
        except Exception:
            pass

    db.delete(email_item)
    db.commit()

    if file_urls:
        try:
            cleanup_orphan_posters(db, file_urls)
            db.commit()
        except Exception:
            pass

    return {"message": "邮件已成功删除", "id": email_id}

