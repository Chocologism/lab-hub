import re
import ssl
import socket
import json
import base64
import hashlib
import hmac
import secrets
import time
import datetime
from typing import Dict, Any, List, Tuple, Optional, Callable
from email.header import decode_header, make_header
from email.utils import parseaddr, parsedate_to_datetime
import email

from ..auth import SECRET_KEY
from ..models import UserMailConfig, UserCachedEmail


def parse_email_timestamp(date_str: Optional[str]) -> Optional[float]:
    """安全解析邮件 RFC 2822 日期时间为秒级 UNIX 时间戳"""
    if not date_str:
        return None
    try:
        clean_d = date_str.split('(')[0].strip()
        dt = parsedate_to_datetime(clean_d)
        return dt.timestamp()
    except Exception:
        return None


def _get_derived_key() -> bytes:
    return hashlib.sha256(SECRET_KEY.encode('utf-8')).digest()


def encrypt_password(plain: str) -> str:
    """基于系统 SECRET_KEY 的对称混淆加密，避免在数据库明文存储密码"""
    if not plain:
        return ""
    salt = secrets.token_bytes(16)
    plain_bytes = plain.encode('utf-8')
    keystream = bytearray()
    counter = 0
    key = _get_derived_key()
    while len(keystream) < len(plain_bytes):
        block = hmac.new(key, salt + counter.to_bytes(4, 'big'), hashlib.sha256).digest()
        keystream.extend(block)
        counter += 1
    cipher_bytes = bytes([b ^ keystream[i] for i, b in enumerate(plain_bytes)])
    payload = salt + cipher_bytes
    sig = hmac.new(key, payload, hashlib.sha256).digest()
    return base64.urlsafe_b64encode(payload + sig).decode('ascii')


def decrypt_password(token: str) -> str:
    """解密用户邮箱密码"""
    if not token:
        return ""
    try:
        raw = base64.urlsafe_b64decode(token.encode('ascii'))
        if len(raw) < 16 + 32:
            return ""
        payload = raw[:-32]
        expected_sig = raw[-32:]
        key = _get_derived_key()
        sig = hmac.new(key, payload, hashlib.sha256).digest()
        if not hmac.compare_digest(sig, expected_sig):
            raise ValueError("密码签名校验不通过")
        salt = payload[:16]
        cipher_bytes = payload[16:]
        keystream = bytearray()
        counter = 0
        while len(keystream) < len(cipher_bytes):
            block = hmac.new(key, salt + counter.to_bytes(4, 'big'), hashlib.sha256).digest()
            keystream.extend(block)
            counter += 1
        plain_bytes = bytes([b ^ keystream[i] for i, b in enumerate(cipher_bytes)])
        return plain_bytes.decode('utf-8', errors='replace')
    except Exception as exc:
        raise ValueError(f"解密密码失败: {str(exc)}")


def decode_mime_str(val: Any) -> str:
    """解码邮件头中的 RFC 2047 编码字符"""
    if not val:
        return ""
    try:
        return str(make_header(decode_header(str(val))))
    except Exception:
        return str(val)


def extract_email_body(msg: Any) -> Tuple[str, str, str, bool]:
    """提取邮件的纯文本、富文本 HTML、正文摘要及附件标识"""
    body_text = ""
    body_html = ""
    has_attachments = False

    if msg.is_multipart():
        for part in msg.walk():
            content_disposition = str(part.get("Content-Disposition", ""))
            content_type = part.get_content_type()
            filename = part.get_filename()
            if "attachment" in content_disposition.lower() or filename:
                has_attachments = True
                continue
            try:
                payload = part.get_payload(decode=True)
                if not payload:
                    continue
                charset = part.get_content_charset() or "utf-8"
                try:
                    text_content = payload.decode(charset, errors="replace")
                except Exception:
                    text_content = payload.decode("gb18030", errors="replace")
                
                if content_type == "text/html":
                    body_html = text_content
                elif content_type == "text/plain" and not body_text:
                    body_text = text_content
            except Exception:
                pass
    else:
        content_type = msg.get_content_type()
        try:
            payload = msg.get_payload(decode=True)
            if payload:
                charset = msg.get_content_charset() or "utf-8"
                try:
                    text_content = payload.decode(charset, errors="replace")
                except Exception:
                    text_content = payload.decode("gb18030", errors="replace")
                if content_type == "text/html":
                    body_html = text_content
                else:
                    body_text = text_content
        except Exception:
            pass

    # 生成正文纯文本摘要
    raw_snippet = body_text or re.sub(r'<[^>]+>', '', body_html)
    snippet = re.sub(r'\s+', ' ', raw_snippet).strip()[:180]
    return body_text, body_html, snippet, has_attachments


def is_talk_email(subject: str = "", snippet: str = "", body_text: str = "") -> bool:
    """识别是否为学术报告、论坛、讲座通知邮件"""
    title = (subject or "").lower()
    snip = (snippet or "").lower()
    body = (body_text or "").lower()
    combined = f"{title} \n {snip} \n {body}"

    # 1. 邮件标题明确包含学术报告/讲座/论坛/研讨会等关键词
    if re.search(r'报告|讲座|seminar|colloquium|talk|沙龙|组会|研讨会|学术论坛|青年论坛|前沿论坛|专题论坛|学术交流|交流会', title, re.I):
        return True

    # 2. 标题包含“第X期/届”且含论坛/交流/报告等字样
    if re.search(r'第\s*\d+\s*[期届].*?(?:论坛|报告|讲座|交流)', title, re.I):
        return True

    # 3. 语义多特征综合判断
    has_speaker = bool(re.search(
        r'报告人|主讲人|主讲嘉宾|特邀嘉宾|speaker|presenter|邀请(?:到了|到|了)?(?:[^,，。；\n\r]*?的)?\s*[A-Za-z\u4e00-\u9fa5·]{2,6}\s*(?:博士|教授|研究员|特聘研究员|副教授|院士|老师)',
        combined, re.I
    ))
    has_topic = bool(re.search(
        r'做题为|题为|报告题目|报告主题|题目为|题目是|[《“][^》”\n\r]{4,100}[》”]\s*(?:的)?(?:学术)?(?:报告|讲座)',
        combined, re.I
    ))
    has_time_or_place = bool(re.search(
        r'时间|日期|地点|会议室|报告厅|大厦|教室|腾讯会议|zoom|venue|location|date|time',
        combined, re.I
    ))
    has_talk_context = bool(re.search(
        r'报告|讲座|seminar|colloquium|talk|沙龙|组会|研讨会|论坛|交流',
        combined, re.I
    ))

    if has_speaker and has_time_or_place:
        return True
    if has_topic and (has_time_or_place or has_speaker):
        return True
    if has_talk_context and has_time_or_place and (has_speaker or has_topic):
        return True

    return False


def is_conference_email(subject: str = "", snippet: str = "", body_text: str = "") -> bool:
    """识别是否为学术会议、年会、研讨会、暑期学校等通知邮件"""
    title = (subject or "").lower()
    snip = (snippet or "").lower()
    body = (body_text or "").lower()
    combined = f"{title} \n {snip} \n {body}"

    # 1. 标题显式会议关键词匹配
    if re.search(r'学术会议|研讨会|学术论坛|年会|研讨班|讲习班|研习班|暑期学校|暑假学校|冬令营|大会通知|征文通知|征稿通知|第一轮通知|第二轮通知|第三轮通知|会议通知|参会通知|注册通知|邀请函|call for papers|conference|symposium|workshop|annual meeting|summer school|winter school|congress', title, re.I):
        return True

    # 2. 语义综合：包含会议关键词且同时具备注册/报名/征文/截止/主办等特征
    has_conf_keywords = bool(re.search(r'会议|研讨会|论坛|年会|研讨班|讲习班|暑期学校|conference|symposium|workshop|school', combined, re.I))
    has_action_keywords = bool(re.search(r'征文|征稿|注册|报名|参会|摘要提交|截稿|早鸟|酒店预订|会议日程|registration|submission|deadline|early bird|call for papers', combined, re.I))
    has_host_keywords = bool(re.search(r'主办|承办|协办|举办地点|召开|举行|organizer|hosted by', combined, re.I))

    if has_conf_keywords and (has_action_keywords or has_host_keywords):
        return True

    return False


def is_complete_image_bytes(data: bytes, content_type: str) -> bool:
    """校验图片二进制数据的 EOF 标记完整性"""
    if not data or len(data) < 2048:
        return False
    ct = content_type.lower()
    if "jpeg" in ct or "jpg" in ct:
        if len(data) < 4:
            return False
        starts_soi = data[:2] == b"\xff\xd8"
        has_eoi = b"\xff\xd9" in data[-16:]
        return starts_soi and has_eoi
    if "png" in ct:
        if len(data) < 8:
            return False
        is_png = data[:4] == b"\x89PNG"
        has_iend = b"IEND" in data[-24:]
        return is_png and has_iend
    if "gif" in ct:
        if len(data) < 6:
            return False
        is_gif = data[:3] == b"GIF"
        has_trailer = b";" in data[-8:]
        return is_gif and has_trailer
    if "webp" in ct:
        if len(data) < 12:
            return False
        return data[:4] == b"RIFF" and data[8:12] == b"WEBP"
    return len(data) >= 2048


def extract_email_image_attachments(msg: Any) -> List[Dict[str, Any]]:
    """提取邮件中的所有有效、完整图片附件数据"""
    if not msg:
        return []

    attachments = []
    if msg.is_multipart():
        for part in msg.walk():
            if part.is_multipart():
                continue
            content_type = part.get_content_type().lower()
            filename = decode_mime_str(part.get_filename() or "")

            is_image_type = content_type in ("image/png", "image/jpeg", "image/webp", "image/gif")
            is_image_ext = bool(re.search(r'\.(png|jpe?g|webp|gif)$', filename, re.I))

            if is_image_type or is_image_ext:
                try:
                    payload = part.get_payload(decode=True)
                    if payload and 2048 <= len(payload) <= 15 * 1024 * 1024:
                        safe_ext = "png" if "png" in content_type or filename.lower().endswith(".png") else "jpg"
                        safe_filename = filename or f"image_{len(attachments) + 1}.{safe_ext}"
                        safe_type = content_type if is_image_type else f"image/{'png' if safe_ext == 'png' else 'jpeg'}"
                        if is_complete_image_bytes(payload, safe_type):
                            attachments.append({
                                "filename": safe_filename,
                                "content_type": safe_type,
                                "content": payload
                            })
                except Exception:
                    pass
    return attachments


def extract_email_image_attachment(msg: Any) -> Optional[Dict[str, Any]]:
    """兼容旧版接口：若邮件含图片附件，返回首个完整图片附件"""
    atts = extract_email_image_attachments(msg)
    return atts[0] if atts else None


def extract_email_document_attachments(msg: Any) -> List[Dict[str, Any]]:
    """提取邮件中的有效文档附件数据（PDF、Word doc/docx，单个文件 <= 15MB）"""
    if not msg:
        return []

    attachments = []
    if msg.is_multipart():
        for part in msg.walk():
            if part.is_multipart():
                continue
            content_type = part.get_content_type().lower()
            filename = decode_mime_str(part.get_filename() or "")

            is_doc_type = content_type in (
                "application/pdf",
                "application/msword",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            )
            is_doc_ext = bool(re.search(r'\.(pdf|docx?)$', filename, re.I))

            if is_doc_type or is_doc_ext:
                try:
                    payload = part.get_payload(decode=True)
                    if payload and 100 <= len(payload) <= 15 * 1024 * 1024:
                        ext_match = re.search(r'\.(pdf|docx?)$', filename, re.I)
                        ext = ext_match.group(1).lower() if ext_match else ("pdf" if "pdf" in content_type else "docx")
                        safe_filename = filename or f"document_{len(attachments) + 1}.{ext}"
                        if is_doc_type:
                            safe_type = content_type
                        else:
                            if ext == "pdf":
                                safe_type = "application/pdf"
                            elif ext == "docx":
                                safe_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                            else:
                                safe_type = "application/msword"

                        attachments.append({
                            "filename": safe_filename,
                            "content_type": safe_type,
                            "content": payload
                        })
                except Exception:
                    pass
    return attachments


def test_mail_connection(protocol: str, host: str, port: int, use_ssl: bool, username: str, password: str) -> Dict[str, Any]:
    """测试邮箱连接与身份认证"""
    protocol = (protocol or "imap").lower().strip()
    socket.setdefaulttimeout(10.0)

    if protocol in ("pop", "pop3"):
        import poplib
        try:
            if use_ssl:
                ctx = ssl.create_default_context()
                client = poplib.POP3_SSL(host, port, ssl_context=ctx, timeout=10)
            else:
                client = poplib.POP3(host, port, timeout=10)
            client.user(username)
            client.pass_(password)
            num_msgs, total_size = client.stat()
            client.quit()
            return {
                "success": True,
                "protocol": "POP3",
                "message": f"POP3 登录成功！收件箱共有 {num_msgs} 封邮件。",
                "count": num_msgs
            }
        except Exception as exc:
            err_msg = str(exc)
            if "authentication" in err_msg.lower() or "password" in err_msg.lower() or "-err" in err_msg.lower():
                err_msg = "账号或密码错误（若使用 163/QQ 邮箱请确认是否使用专用授权码而非网页密码）"
            return {"success": False, "protocol": "POP3", "message": f"POP3 连接失败: {err_msg}"}
    else:
        import imaplib
        try:
            if use_ssl:
                ctx = ssl.create_default_context()
                client = imaplib.IMAP4_SSL(host, port, ssl_context=ctx)
            else:
                client = imaplib.IMAP4(host, port)
            client.login(username, password)
            client.select("INBOX", readonly=True)
            status, data = client.search(None, "ALL")
            count = len(data[0].split()) if data and data[0] else 0
            client.logout()
            return {
                "success": True,
                "protocol": "IMAP",
                "message": f"IMAP 登录成功！收件箱共有 {count} 封邮件。",
                "count": count
            }
        except Exception as exc:
            err_msg = str(exc)
            if "authentication" in err_msg.lower() or "login failed" in err_msg.lower():
                err_msg = "账号或密码错误（若使用 163/QQ 邮箱请确认是否使用专用授权码而非网页密码）"
            return {"success": False, "protocol": "IMAP", "message": f"IMAP 连接失败: {err_msg}"}


def sync_mailbox_messages(
    config: UserMailConfig,
    db: Any,
    limit: int = 50,
    on_progress: Optional[Callable[[Dict[str, Any]], None]] = None
) -> List[Dict[str, Any]]:
    """连接邮箱服务器并同步最近的邮件至本地数据库缓存"""
    def _notify(step: str, percent: int, message: str, detail: str = "", count: int = 0):
        if on_progress:
            try:
                on_progress({
                    "step": step,
                    "percent": percent,
                    "message": message,
                    "detail": detail,
                    "count": count
                })
            except Exception:
                pass

    plain_password = decrypt_password(config.encrypted_password)
    protocol = (config.protocol or "imap").lower().strip()
    socket.setdefaulttimeout(15.0)

    fetched_items = []

    if protocol in ("pop", "pop3"):
        import poplib
        _notify("connect", 10, f"正在连接 POP3 服务器 {config.server_host}:{config.server_port}...")
        if config.use_ssl:
            ctx = ssl.create_default_context()
            client = poplib.POP3_SSL(config.server_host, config.server_port, ssl_context=ctx, timeout=15)
        else:
            client = poplib.POP3(config.server_host, config.server_port, timeout=15)
        
        _notify("auth", 20, "正在验证 POP3 账号与密码...")
        client.user(config.username)
        client.pass_(plain_password)
        num_msgs, _ = client.stat()
        start_idx = max(1, num_msgs - limit + 1)
        total_fetch = max(1, num_msgs - start_idx + 1)
        _notify("scan", 30, f"POP3 登录成功，共发现 {num_msgs} 封邮件，准备抓取最近 {total_fetch} 封...")
        
        # 从最新邮件开始倒序抓取
        fetched_count = 0
        for msg_num in range(num_msgs, start_idx - 1, -1):
            fetched_count += 1
            pct = 30 + int((fetched_count / total_fetch) * 60)
            try:
                response, lines, octets = client.retr(msg_num)
                raw_bytes = b"\r\n".join(lines)
                msg = email.message_from_bytes(raw_bytes)
                msg_uid = f"pop_{msg_num}_{hashlib.md5(raw_bytes[:200]).hexdigest()[:8]}"
                
                subject = decode_mime_str(msg.get("Subject", "无主题"))
                from_raw = decode_mime_str(msg.get("From", ""))
                sender_name, sender_email = parseaddr(from_raw)
                sender_name = decode_mime_str(sender_name) or sender_email
                recipient = decode_mime_str(msg.get("To", ""))
                date_str = decode_mime_str(msg.get("Date", ""))
                
                body_text, body_html, snippet, has_attachments = extract_email_body(msg)

                poster_url = ""
                if is_talk_email(subject, snippet, body_text):
                    img_att = extract_email_image_attachment(msg)
                    if img_att:
                        try:
                            from ..routers.files import store_file
                            poster_url = store_file(db, img_att["filename"], img_att["content_type"], img_att["content"])
                            has_attachments = True
                        except Exception:
                            pass

                _notify("fetching", pct, f"正在同步邮件 ({fetched_count}/{total_fetch})", subject[:45], fetched_count)

                fetched_items.append({
                    "msg_uid": msg_uid,
                    "subject": subject,
                    "sender_name": sender_name,
                    "sender_email": sender_email,
                    "recipient": recipient,
                    "date_str": date_str,
                    "snippet": snippet,
                    "body_text": body_text,
                    "body_html": body_html,
                    "has_attachments": has_attachments,
                    "poster_url": poster_url,
                    "is_read": True
                })
            except Exception:
                continue
        client.quit()
    else:
        import imaplib
        _notify("connect", 10, f"正在连接 IMAP 服务器 {config.server_host}:{config.server_port} (SSL)...")
        if config.use_ssl:
            ctx = ssl.create_default_context()
            client = imaplib.IMAP4_SSL(config.server_host, config.server_port, ssl_context=ctx)
        else:
            client = imaplib.IMAP4(config.server_host, config.server_port)
        
        _notify("auth", 20, "正在验证 IMAP 账号与密码...")
        client.login(config.username, plain_password)
        
        _notify("scan", 28, "IMAP 登录成功，正在检索收件箱最近 7 天邮件...")
        client.select("INBOX", readonly=True)
        eight_days_ago = datetime.datetime.fromtimestamp(time.time() - 8 * 24 * 3600, tz=datetime.timezone.utc)
        since_str = eight_days_ago.strftime("%d-%b-%Y")
        status, data = client.search(None, f'SINCE {since_str}')
        if not (data and data[0]):
            status, data = client.search(None, "ALL")
        if data and data[0]:
            msg_ids = data[0].split()
            # 从最新的邮件倒序读取
            target_ids = msg_ids[-limit:][::-1]
            total_target = len(target_ids)
            _notify("scan", 32, f"收件箱共有 {len(msg_ids)} 封候选邮件，准备抓取最近 {total_target} 封...")

            # 批量获取每封邮件大小，避免拉取大附件导致超时
            size_map = {}
            try:
                id_str = ",".join(m.decode("ascii") if isinstance(m, bytes) else str(m) for m in target_ids)
                _, size_data = client.fetch(id_str, "(RFC822.SIZE)")
                for line in size_data:
                    if isinstance(line, bytes):
                        m_sz = re.search(r'(\d+)\s+\(RFC822\.SIZE\s+(\d+)\)', line.decode("ascii", errors="ignore"))
                        if m_sz:
                            size_map[m_sz.group(1)] = int(m_sz.group(2))
            except Exception:
                pass

            for idx, mid in enumerate(target_ids):
                pct = 32 + int(((idx + 1) / total_target) * 60)
                try:
                    mid_str = mid.decode("ascii") if isinstance(mid, bytes) else str(mid)
                    msg_size = size_map.get(mid_str, 0)

                    if msg_size > 250 * 1024:
                        # 超过 250KB 的邮件（通常含附件或大型媒体），仅抓取邮件头与前 64KB 正文切片，坚决不下载多兆附件
                        res, msg_data = client.fetch(mid, "(RFC822.HEADER BODY.PEEK[1.MIME] BODY.PEEK[1]<0.65536>)")
                        if res != "OK" or not msg_data:
                            continue
                        hdr_bytes = b""
                        mime_bytes = b""
                        body_peek = b""
                        for part in msg_data:
                            if isinstance(part, tuple):
                                part_hdr = part[0]
                                if b"RFC822.HEADER" in part_hdr:
                                    hdr_bytes = part[1]
                                elif b"BODY[1.MIME]" in part_hdr:
                                    mime_bytes = part[1]
                                elif b"BODY[1]" in part_hdr:
                                    body_peek = part[1]

                        msg = email.message_from_bytes(hdr_bytes)
                        message_id_header = msg.get("Message-ID", "")
                        clean_mid = re.sub(r'[<>]', '', message_id_header).strip() if message_id_header else ""
                        msg_uid = clean_mid if clean_mid else f"imap_{mid_str}"
                        subject = decode_mime_str(msg.get("Subject", "无主题"))
                        from_raw = decode_mime_str(msg.get("From", ""))
                        sender_name, sender_email = parseaddr(from_raw)
                        sender_name = decode_mime_str(sender_name) or sender_email
                        recipient = decode_mime_str(msg.get("To", ""))
                        date_str = decode_mime_str(msg.get("Date", ""))

                        body_text = ""
                        body_html = ""
                        snippet = ""
                        if body_peek:
                            try:
                                combined = (mime_bytes + b"\r\n" if mime_bytes else b"") + body_peek
                                peek_msg = email.message_from_bytes(combined)
                                body_text, body_html, snippet, _ = extract_email_body(peek_msg)
                            except Exception:
                                pass
                        if not snippet and body_peek:
                            snippet = body_peek.decode("utf-8", errors="ignore")[:180]

                        has_attachments = False
                        saved_attachments = []
                        is_conf_or_talk = is_conference_email(subject, snippet, body_text) or is_talk_email(subject, snippet, body_text)
                        if is_conf_or_talk and msg_size <= 6 * 1024 * 1024:
                            try:
                                res_full, full_data = client.fetch(mid, "(RFC822)")
                                if res_full == "OK" and full_data:
                                    full_msg = email.message_from_bytes(full_data[0][1])
                                    img_atts = extract_email_image_attachments(full_msg)
                                    doc_atts = extract_email_document_attachments(full_msg)
                                    from ..routers.files import store_file
                                    for img in img_atts:
                                        try:
                                            file_url = store_file(db, img["filename"], img["content_type"], img["content"])
                                            file_id = file_url.split("/")[-1]
                                            saved_attachments.append({
                                                "id": file_id,
                                                "filename": img["filename"],
                                                "content_type": img["content_type"],
                                                "size": len(img["content"]),
                                                "url": file_url
                                            })
                                        except Exception:
                                            pass
                                    for doc in doc_atts:
                                        try:
                                            file_url = store_file(db, doc["filename"], doc["content_type"], doc["content"])
                                            file_id = file_url.split("/")[-1]
                                            saved_attachments.append({
                                                "id": file_id,
                                                "filename": doc["filename"],
                                                "content_type": doc["content_type"],
                                                "size": len(doc["content"]),
                                                "url": file_url
                                            })
                                        except Exception:
                                            pass
                                    f_body, f_html, f_snip, f_has_att = extract_email_body(full_msg)
                                    if f_body:
                                        body_text = f_body
                                    if f_html:
                                        body_html = f_html
                                    if f_snip:
                                        snippet = f_snip
                                    if f_has_att:
                                        has_attachments = True
                            except Exception:
                                pass
                        first_img = next((a["url"] for a in saved_attachments if a["content_type"].startswith("image/")), "")
                        poster_url = first_img or ""
                        if saved_attachments:
                            has_attachments = True
                    else:
                        res, msg_data = client.fetch(mid, "(RFC822)")
                        if res != "OK" or not msg_data:
                            continue
                        raw_bytes = msg_data[0][1]
                        msg = email.message_from_bytes(raw_bytes)
                        message_id_header = msg.get("Message-ID", "")
                        clean_mid = re.sub(r'[<>]', '', message_id_header).strip() if message_id_header else ""
                        msg_uid = clean_mid if clean_mid else f"imap_{mid_str}"

                        subject = decode_mime_str(msg.get("Subject", "无主题"))
                        from_raw = decode_mime_str(msg.get("From", ""))
                        sender_name, sender_email = parseaddr(from_raw)
                        sender_name = decode_mime_str(sender_name) or sender_email
                        recipient = decode_mime_str(msg.get("To", ""))
                        date_str = decode_mime_str(msg.get("Date", ""))
                        body_text, body_html, snippet, has_attachments = extract_email_body(msg)

                        saved_attachments = []
                        img_atts = extract_email_image_attachments(msg)
                        doc_atts = []
                        if is_conference_email(subject, snippet, body_text) or is_talk_email(subject, snippet, body_text):
                            doc_atts = extract_email_document_attachments(msg)
                        from ..routers.files import store_file
                        for img in img_atts:
                            try:
                                file_url = store_file(db, img["filename"], img["content_type"], img["content"])
                                file_id = file_url.split("/")[-1]
                                saved_attachments.append({
                                    "id": file_id,
                                    "filename": img["filename"],
                                    "content_type": img["content_type"],
                                    "size": len(img["content"]),
                                    "url": file_url
                                })
                            except Exception:
                                pass
                        for doc in doc_atts:
                            try:
                                file_url = store_file(db, doc["filename"], doc["content_type"], doc["content"])
                                file_id = file_url.split("/")[-1]
                                saved_attachments.append({
                                    "id": file_id,
                                    "filename": doc["filename"],
                                    "content_type": doc["content_type"],
                                    "size": len(doc["content"]),
                                    "url": file_url
                                })
                            except Exception:
                                pass
                        first_img = next((a["url"] for a in saved_attachments if a["content_type"].startswith("image/")), "")
                        poster_url = first_img or ""
                        if saved_attachments:
                            has_attachments = True

                    _notify("fetching", pct, f"正在同步邮件 ({idx + 1}/{total_target})", subject[:45] if subject else mid_str, idx + 1)

                    item_ts = parse_email_timestamp(date_str)
                    if item_ts is not None and (time.time() - item_ts) > 8.5 * 24 * 3600:
                        continue

                    fetched_items.append({
                        "msg_uid": msg_uid,
                        "subject": subject,
                        "sender_name": sender_name,
                        "sender_email": sender_email,
                        "recipient": recipient,
                        "date_str": date_str,
                        "snippet": snippet,
                        "body_text": body_text,
                        "body_html": body_html,
                        "has_attachments": has_attachments,
                        "poster_url": poster_url,
                        "attachments": json.dumps(saved_attachments),
                        "is_read": False
                    })
                except Exception:
                    continue
        client.logout()

    # 增量更新数据库缓存（只保留最近 7 天的邮件）
    if fetched_items:
        _notify("saving", 95, f"正在将 {len(fetched_items)} 封邮件增量更新至本地缓存...")
        existing_records = db.query(UserCachedEmail).filter(UserCachedEmail.user_id == config.user_id).all()
        existing_uids = {re.sub(r'[<>]', '', r.msg_uid).strip(): r for r in existing_records if r.msg_uid}
        existing_meta = {(re.sub(r'\s+', '', r.subject or '').lower(), (r.date_str or '').strip()): r for r in existing_records if r.subject and r.date_str}

        for item in fetched_items:
            uid = re.sub(r'[<>]', '', item["msg_uid"]).strip()
            item["msg_uid"] = uid
            subj_clean = re.sub(r'\s+', '', item["subject"] or '').lower()
            date_clean = (item["date_str"] or '').strip()
            meta_key = (subj_clean, date_clean) if (subj_clean and date_clean) else None

            cached = existing_uids.get(uid) or (existing_meta.get(meta_key) if meta_key else None)
            if cached:
                if not cached.body_text and item["body_text"]:
                    cached.body_text = item["body_text"]
                    cached.body_html = item["body_html"]
                    cached.snippet = item["snippet"]
                if item["has_attachments"]:
                    cached.has_attachments = True
                if item.get("poster_url"):
                    cached.poster_url = item["poster_url"]
                if item.get("attachments") and item["attachments"] != "[]":
                    cached.attachments = item["attachments"]
                cached.msg_uid = uid
            else:
                cached = UserCachedEmail(
                    user_id=config.user_id,
                    msg_uid=item["msg_uid"],
                    subject=item["subject"],
                    sender_name=item["sender_name"],
                    sender_email=item["sender_email"],
                    recipient=item["recipient"],
                    date_str=item["date_str"],
                    snippet=item["snippet"],
                    body_text=item["body_text"],
                    body_html=item["body_html"],
                    has_attachments=item["has_attachments"],
                    poster_url=item.get("poster_url", ""),
                    is_read=item["is_read"]
                )
                db.add(cached)
                existing_uids[uid] = cached
                if meta_key:
                    existing_meta[meta_key] = cached
        db.commit()

    # 自动清理超过保留期（8.5 天自然日窗口）的历史旧邮件，释放内存与本地存储
    seven_days_ago_ts = time.time() - 8.5 * 24 * 3600
    all_cached = db.query(UserCachedEmail).filter(UserCachedEmail.user_id == config.user_id).all()
    cleaned_count = 0
    for r in all_cached:
        ts = parse_email_timestamp(r.date_str)
        if ts is not None and ts < seven_days_ago_ts:
            db.delete(r)
            cleaned_count += 1
    if cleaned_count > 0:
        db.commit()

    final_count = db.query(UserCachedEmail).filter(UserCachedEmail.user_id == config.user_id).count()
    _notify("done", 100, f"同步完成，新增 {len(fetched_items)} 封新邮件，当前保留最近 7 天共 {final_count} 封", count=final_count)
    return fetched_items
