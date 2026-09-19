from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient
from backend.main import app
from backend.database import SessionLocal, engine
from backend.migrations import migrate
from backend.models import User, UserMailConfig, UserCachedEmail
from backend.services.mailbox_service import encrypt_password, decrypt_password
from backend.auth import get_password_hash
from datetime import datetime, timedelta

migrate(engine)

client = TestClient(app)


def login(email: str = "admin@lab.edu"):
    password = "lab123456" if email == "admin@lab.edu" else "123456"
    res = client.post("/api/auth/login", json={"email": email, "password": password})
    assert res.status_code == 200
    token = res.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_password_encryption_roundtrip():
    plain = "LabSuperSecret!2026"
    encrypted = encrypt_password(plain)
    assert encrypted != plain
    decrypted = decrypt_password(encrypted)
    assert decrypted == plain


def test_mailbox_config_crud_and_isolation():
    admin_headers = login("admin@lab.edu")
    
    # 确保测试用户存在
    with SessionLocal() as db:
        user_b = db.query(User).filter_by(email="mailbox_user_b@lab.edu").first()
        if not user_b:
            user_b = User(
                email="mailbox_user_b@lab.edu",
                name="邮箱测试员B",
                real_name="测试员B",
                hashed_password=get_password_hash("123456"),
                role="member",
                token_version=0
            )
            db.add(user_b)
            db.commit()
        else:
            user_b.hashed_password = get_password_hash("123456")
            db.commit()
    user_b_headers = login("mailbox_user_b@lab.edu")

    # 1. 初始状态：无配置
    res = client.get("/api/mailbox/config", headers=admin_headers)
    assert res.status_code == 200
    assert res.json()["has_config"] is False

    # 2. 首次保存缺少密码 -> 422
    res_err = client.post("/api/mailbox/config", headers=admin_headers, json={
        "email_address": "admin@lab.edu",
        "protocol": "imap",
        "server_host": "mail.cstnet.cn",
        "server_port": 993,
        "use_ssl": True,
        "username": "admin@lab.edu",
        "password": ""
    })
    assert res_err.status_code == 422

    # 3. 首次保存配置成功
    save_res = client.post("/api/mailbox/config", headers=admin_headers, json={
        "email_address": "admin@lab.edu",
        "protocol": "imap",
        "server_host": "mail.cstnet.cn",
        "server_port": 993,
        "use_ssl": True,
        "username": "admin@lab.edu",
        "password": "Password123"
    })
    assert save_res.status_code == 200
    data = save_res.json()
    assert data["has_config"] is True
    assert data["email_address"] == "admin@lab.edu"
    assert data["server_host"] == "mail.cstnet.cn"
    assert data["has_password"] is True
    assert "password" not in data or data.get("password") is None

    # 4. 用户隔离验证：用户 B 查看自己应依然为 has_config: False
    res_b = client.get("/api/mailbox/config", headers=user_b_headers)
    assert res_b.status_code == 200
    assert res_b.json()["has_config"] is False

    # 5. 更新配置时不传新密码，应保留原密码
    update_res = client.post("/api/mailbox/config", headers=admin_headers, json={
        "email_address": "admin@lab.edu",
        "protocol": "pop3",
        "server_host": "pop.lab.edu",
        "server_port": 995,
        "use_ssl": True,
        "username": "admin_lab",
        "password": ""
    })
    assert update_res.status_code == 200
    assert update_res.json()["protocol"] == "pop3"
    assert update_res.json()["server_port"] == 995
    assert update_res.json()["has_password"] is True

    # 6. 测试删除解绑配置
    del_res = client.delete("/api/mailbox/config", headers=admin_headers)
    assert del_res.status_code == 200
    assert client.get("/api/mailbox/config", headers=admin_headers).json()["has_config"] is False


def test_cached_emails_and_detail():
    admin_headers = login("admin@lab.edu")
    
    # 插入一封缓存测试邮件
    with SessionLocal() as db:
        admin_user = db.query(User).filter_by(email="admin@lab.edu").first()
        db.query(UserCachedEmail).filter_by(user_id=admin_user.id).delete()
        now = datetime.now()
        yesterday_str = (now - timedelta(days=1)).strftime("%Y-%m-%d %H:%M")
        test_email = UserCachedEmail(
            user_id=admin_user.id,
            msg_uid="test_uid_1001",
            subject="【学术报告通知】宇宙学大尺度结构研讨会",
            sender_name="学术委员会",
            sender_email="academic@lab.edu",
            recipient="admin@lab.edu",
            date_str=yesterday_str,
            snippet="本周五下午将在物理楼301举行宇宙学大尺度结构学术报告...",
            body_text="完整报告通知正文：报告人张教授...",
            body_html="<p>完整报告通知正文：报告人张教授...</p>",
            has_attachments=True,
            poster_url="",
            is_read=False
        )
        db.add(test_email)
        # 还要确保有一个 mail config 才能 list
        cfg = db.query(UserMailConfig).filter_by(user_id=admin_user.id).first()
        if not cfg:
            cfg = UserMailConfig(
                user_id=admin_user.id,
                email_address="admin@lab.edu",
                protocol="imap",
                server_host="mail.cstnet.cn",
                server_port=993,
                use_ssl=True,
                username="admin@lab.edu",
                encrypted_password=encrypt_password("testpass")
            )
            db.add(cfg)
        db.commit()
        email_id = test_email.id

    # 1. 查询邮件列表
    list_res = client.get("/api/mailbox/emails", headers=admin_headers)
    assert list_res.status_code == 200
    emails = list_res.json()
    assert len(emails) >= 1
    assert any(e["id"] == email_id for e in emails)
    target = next(e for e in emails if e["id"] == email_id)
    assert target["subject"] == "【学术报告通知】宇宙学大尺度结构研讨会"
    assert target["has_attachments"] is True

    # 2. 关键词检索
    search_res = client.get("/api/mailbox/emails?q=大尺度", headers=admin_headers)
    assert search_res.status_code == 200
    assert len(search_res.json()) >= 1

    search_empty = client.get("/api/mailbox/emails?q=NonExistentKeywordXYZ", headers=admin_headers)
    assert search_empty.status_code == 200
    assert len(search_empty.json()) == 0

    # 3. 获取邮件详情（包含正文 HTML 与纯文本）
    detail_res = client.get(f"/api/mailbox/emails/{email_id}", headers=admin_headers)
    assert detail_res.status_code == 200
    detail = detail_res.json()
    assert detail["body_text"] == "完整报告通知正文：报告人张教授..."
    assert "<p>" in detail["body_html"]

    # 4. 验证最新日期邮件排在最上面 (Newest first)
    with SessionLocal() as db:
        admin_user = db.query(User).filter_by(email="admin@lab.edu").first()
        older_date = (now - timedelta(days=2)).strftime("%a, %d %b %Y %H:%M:%S +0800")
        newer_date = (now - timedelta(hours=2)).strftime("%a, %d %b %Y %H:%M:%S +0800")
        older_email = UserCachedEmail(
            user_id=admin_user.id,
            msg_uid="test_uid_older",
            subject="早期通知",
            sender_name="教务处",
            sender_email="notice@lab.edu",
            recipient="admin@lab.edu",
            date_str=older_date,
            snippet="较早前的选课通知...",
            body_text="较早前的选课通知正文...",
            has_attachments=False,
            poster_url="",
            is_read=True
        )
        newer_email = UserCachedEmail(
            user_id=admin_user.id,
            msg_uid="test_uid_newer",
            subject="最新组会通知",
            sender_name="组长",
            sender_email="leader@lab.edu",
            recipient="admin@lab.edu",
            date_str=newer_date,
            snippet="今天最新的组会安排...",
            body_text="今天最新的组会安排正文...",
            has_attachments=False,
            poster_url="",
            is_read=False
        )
        db.add(older_email)
        db.add(newer_email)
        db.commit()

    sorted_res = client.get("/api/mailbox/emails", headers=admin_headers)
    assert sorted_res.status_code == 200
    sorted_data = sorted_res.json()
    assert len(sorted_data) >= 3
    # 最新的一封必须排在最上方
    assert sorted_data[0]["subject"] == "最新组会通知"

    # 5. 清理测试数据
    client.delete("/api/mailbox/config", headers=admin_headers)


def test_sync_mailbox_stream():
    admin_headers = login("admin@lab.edu")
    # 保存配置
    client.post("/api/mailbox/config", headers=admin_headers, json={
        "email_address": "admin@lab.edu",
        "protocol": "imap",
        "server_host": "mail.cstnet.cn",
        "server_port": 993,
        "use_ssl": True,
        "username": "admin@lab.edu",
        "password": "test_password_123"
    })

    with patch("backend.routers.mailbox.sync_mailbox_messages") as mock_sync:
        def fake_sync(config, db, limit=50, on_progress=None):
            if on_progress:
                on_progress({"step": "connect", "percent": 10, "message": "连接中"})
                on_progress({"step": "auth", "percent": 20, "message": "验证中"})
            return [{
                "msg_uid": "uid_stream_test",
                "subject": "测试邮件",
                "sender_name": "发件人",
                "sender_email": "s@lab.edu",
                "recipient": "admin@lab.edu",
                "date_str": "Thu, 10 Sep 2026 12:00:00 +0800",
                "snippet": "测试摘要",
                "body_text": "测试正文",
                "body_html": "",
                "has_attachments": False,
                "is_read": False
            }]
        mock_sync.side_effect = fake_sync

        stream_res = client.get("/api/mailbox/sync-stream", headers=admin_headers)
        assert stream_res.status_code == 200
        text = stream_res.text
        assert "data: " in text
        assert "progress" in text
        assert "done" in text
        assert "100" in text

    client.delete("/api/mailbox/config", headers=admin_headers)


def test_talk_email_and_image_attachment_extraction():
    from backend.services.mailbox_service import is_talk_email, extract_email_image_attachment
    from email.mime.multipart import MIMEMultipart
    from email.mime.text import MIMEText
    from email.mime.image import MIMEImage
    from backend.routers.files import store_file
    from backend.models import UploadedFile

    # 1. 验证学术报告通知识别
    assert is_talk_email("学术报告通知：宇宙学巡天", "本周五报告", "主讲人：张研究员") is True
    assert is_talk_email("Seminar Announcement: Fast Radio Bursts", "Online Zoom", "Speaker: Dr. Li") is True
    assert is_talk_email("关于五一放假安排的日常行政通知", "放假通知", "请各位老师知悉") is False

    # 2. 验证图片附件提取
    msg = MIMEMultipart()
    msg["Subject"] = "学术报告通知"
    msg["From"] = "academic@lab.edu"
    msg["To"] = "admin@lab.edu"
    msg.attach(MIMEText("请见附件报告海报", "plain", "utf-8"))

    fake_png_data = b"\x89PNG\r\n\x1a\n" + b"\x00" * 2048 + b"IEND\xaeB`\x82"
    img_part = MIMEImage(fake_png_data, _subtype="png")
    img_part.add_header("Content-Disposition", "attachment", filename="talk_poster.png")
    msg.attach(img_part)

    extracted = extract_email_image_attachment(msg)
    assert extracted is not None
    assert extracted["filename"] == "talk_poster.png"
    assert "image/png" in extracted["content_type"]
    assert extracted["content"] == fake_png_data

    from backend.services.mailbox_service import extract_email_image_attachments
    all_extracted = extract_email_image_attachments(msg)
    assert len(all_extracted) == 1
    assert all_extracted[0]["filename"] == "talk_poster.png"

    # 3. 验证文件保存并生成可访问 url
    with SessionLocal() as db:
        url = store_file(db, extracted["filename"], extracted["content_type"], extracted["content"])
        db.commit()
        assert url.startswith("/api/files/")
        file_id = url.replace("/api/files/", "")
        f_row = db.get(UploadedFile, file_id)
        assert f_row is not None
        assert f_row.filename == "talk_poster.png"
        assert f_row.content == fake_png_data
        # 清理
        db.delete(f_row)
        db.commit()


def test_mailbox_clear_and_delete_emails():
    from backend.routers.files import store_file
    from backend.models import UploadedFile, ObservatoryTalk
    admin_headers = login("admin@lab.edu")
    user_b_headers = login("mailbox_user_b@lab.edu")

    with SessionLocal() as db:
        admin_user = db.query(User).filter_by(email="admin@lab.edu").first()
        user_b = db.query(User).filter_by(email="mailbox_user_b@lab.edu").first()
        admin_user_id = admin_user.id
        user_b_id = user_b.id

        # 为 admin 存一个海报文件
        url1 = store_file(db, "admin_talk_poster1.png", "image/png", b"\x89PNGposter1")
        url2 = store_file(db, "admin_talk_poster2.png", "image/png", b"\x89PNGposter2")
        db.commit()

        # 创建 admin 邮箱配置
        cfg = db.query(UserMailConfig).filter_by(user_id=admin_user_id).first()
        if not cfg:
            cfg = UserMailConfig(
                user_id=admin_user_id,
                email_address="admin@lab.edu",
                protocol="imap",
                server_host="mail.lab.edu",
                server_port=993,
                use_ssl=True,
                username="admin@lab.edu",
                encrypted_password=encrypt_password("pass123")
            )
            db.add(cfg)

        # 清除之前的测试邮件
        db.query(UserCachedEmail).filter_by(user_id=admin_user_id).delete()
        db.query(UserCachedEmail).filter_by(user_id=user_b_id).delete()

        # 创建 admin 的 2 封邮件
        email1 = UserCachedEmail(
            user_id=admin_user_id,
            msg_uid="uid_del_1",
            subject="待删除邮件一",
            sender_name="报告人A",
            sender_email="speakerA@lab.edu",
            date_str="Thu, 17 Sep 2026 10:00:00 +0800",
            poster_url=url1,
            body_text="正文1"
        )
        email2 = UserCachedEmail(
            user_id=admin_user_id,
            msg_uid="uid_del_2",
            subject="待清空邮件二",
            sender_name="报告人B",
            sender_email="speakerB@lab.edu",
            date_str="Thu, 17 Sep 2026 11:00:00 +0800",
            poster_url=url2,
            body_text="正文2"
        )
        # 创建 user_b 的 1 封邮件
        email_b = UserCachedEmail(
            user_id=user_b_id,
            msg_uid="uid_user_b_keep",
            subject="用户B的邮件不应被删除",
            sender_name="测试B",
            sender_email="b@lab.edu",
            date_str="Thu, 17 Sep 2026 12:00:00 +0800",
            body_text="用户B正文"
        )
        db.add_all([email1, email2, email_b])
        db.commit()
        email1_id = email1.id
        email2_id = email2.id
        email_b_id = email_b.id
        file1_id = url1.replace("/api/files/", "")
        file2_id = url2.replace("/api/files/", "")

    # 1. 测试 user_b 越权删除 admin 的邮件 -> 404
    forbidden_res = client.delete(f"/api/mailbox/emails/{email1_id}", headers=user_b_headers)
    assert forbidden_res.status_code == 404

    # 2. 测试删除不存在的邮件 -> 404
    not_found_res = client.delete("/api/mailbox/emails/999999", headers=admin_headers)
    assert not_found_res.status_code == 404

    # 3. admin 删除 email1 成功，且孤立海报 url1 被自动清理
    del1_res = client.delete(f"/api/mailbox/emails/{email1_id}", headers=admin_headers)
    assert del1_res.status_code == 200
    assert del1_res.json()["id"] == email1_id

    with SessionLocal() as db:
        # email1 已从数据库中删除
        assert db.query(UserCachedEmail).filter_by(id=email1_id).first() is None
        # url1 对应的 UploadedFile 已被清理
        assert db.get(UploadedFile, file1_id) is None
        # url2 仍在
        assert db.get(UploadedFile, file2_id) is not None

    # 4. 模拟 email2 的海报同时被某个天文台日程 ObservatoryTalk 引用
    with SessionLocal() as db:
        talk = ObservatoryTalk(
            date="2026-09-25",
            time="14:00",
            title="已推送到日程的学术报告",
            speaker="报告人B",
            location="大楼216",
            poster_url=url2,
            created_by_id=admin_user_id
        )
        db.add(talk)
        db.commit()
        talk_id = talk.id

    # 5. admin 执行「清空邮件」DELETE /api/mailbox/emails
    clear_res = client.delete("/api/mailbox/emails", headers=admin_headers)
    assert clear_res.status_code == 200
    assert clear_res.json()["deleted_count"] >= 1

    with SessionLocal() as db:
        # admin 的邮件已被清空
        admin_emails = db.query(UserCachedEmail).filter_by(user_id=admin_user_id).all()
        assert len(admin_emails) == 0

        # user_b 的邮件未受影响
        assert db.query(UserCachedEmail).filter_by(id=email_b_id).first() is not None

        # 因为 ObservatoryTalk 还在引用 url2，所以 file2_id 绝不能被误删！
        assert db.get(UploadedFile, file2_id) is not None

        # admin 的邮箱配置保留无损
        admin_cfg = db.query(UserMailConfig).filter_by(user_id=admin_user_id).first()
        assert admin_cfg is not None

        # 清理测试 talk 与 file2
        db.query(ObservatoryTalk).filter_by(id=talk_id).delete()
        f2 = db.get(UploadedFile, file2_id)
        if f2:
            db.delete(f2)
        db.query(UserCachedEmail).filter_by(id=email_b_id).delete()
        db.commit()


def test_conference_email_and_document_attachment_and_dedup():
    from backend.services.mailbox_service import is_conference_email, extract_email_document_attachments
    from backend.routers.files import store_file
    from backend.routers.mailbox import cleanup_orphan_posters
    from backend.models import UploadedFile, ObservatoryTalk
    import email
    from email.mime.multipart import MIMEMultipart
    from email.mime.base import MIMEBase
    from email.mime.text import MIMEText
    from email import encoders

    # 1. 会议邮件识别测试
    assert is_conference_email(subject="关于召开第十五届全国星系宇宙学学术研讨会的通知", body_text="大会定于开封召开") is True
    assert is_conference_email(subject="2026年黑洞物理暑期学校第一轮通知", body_text="注册截止：2026-06-30") is True
    assert is_conference_email(subject="普通组会通知", body_text="本周五下午两点") is False

    # 2. 文档附件解析测试
    msg = MIMEMultipart()
    msg["Subject"] = "会议通知及手册"
    msg.attach(MIMEText("会议通知详情请见附件。", "plain", "utf-8"))

    pdf_part = MIMEBase("application", "pdf")
    pdf_part.set_payload(b"%PDF-1.4 conference handbook mock data" * 10)
    encoders.encode_base64(pdf_part)
    pdf_part.add_header("Content-Disposition", 'attachment; filename="notice.pdf"')
    msg.attach(pdf_part)

    docx_part = MIMEBase("application", "vnd.openxmlformats-officedocument.wordprocessingml.document")
    docx_part.set_payload(b"PK mock word docx content" * 10)
    encoders.encode_base64(docx_part)
    docx_part.add_header("Content-Disposition", 'attachment; filename="handbook.docx"')
    msg.attach(docx_part)

    docs = extract_email_document_attachments(msg)
    assert len(docs) == 2
    assert docs[0]["filename"] == "notice.pdf"
    assert "pdf" in docs[0]["content_type"]
    assert docs[1]["filename"] == "handbook.docx"

    # 3. SHA-256 去重测试
    with SessionLocal() as db:
        content_a = b"%PDF-1.4 test deduplication payload identical"
        url_a1 = store_file(db, "first_copy.pdf", "application/pdf", content_a)
        url_a2 = store_file(db, "second_copy.pdf", "application/pdf", content_a)
        db.commit()
        # 相同内容的文件必须复用相同的 URL，绝不创建两份记录
        assert url_a1 == url_a2

        # 4. 会议手册被 ObservatoryTalk 引用时的孤立文件清理保护测试
        file_id = url_a1.replace("/api/files/", "")
        talk = ObservatoryTalk(
            date="2026-10-01",
            end_date="2026-10-05",
            time="全天",
            title="全国天文会议",
            event_type="conference",
            handbook_url=url_a1,
            created_by_id=1
        )
        db.add(talk)
        db.commit()

        # 尝试清理该文件，但因 ObservatoryTalk 的 handbook_url 引用，不应被删除
        cleanup_orphan_posters(db, [url_a1])
        db.commit()
        assert db.get(UploadedFile, file_id) is not None

        # 清除 talk 引用后再次清理，文件应被正常清理
        db.delete(talk)
        db.commit()
        cleanup_orphan_posters(db, [url_a1])
        db.commit()
        assert db.get(UploadedFile, file_id) is None


if __name__ == "__main__":
    print("Testing password encryption roundtrip...")
    test_password_encryption_roundtrip()
    print("Testing mailbox config CRUD and email operations...")
    test_mailbox_config_crud_and_isolation()
    print("Testing mailbox sync stream...")
    test_sync_mailbox_stream()
    print("Testing talk email and poster extraction...")
    test_talk_email_and_image_attachment_extraction()
    print("Testing clear and delete emails...")
    test_mailbox_clear_and_delete_emails()
    print("Testing conference email, documents, and SHA-256 dedup...")
    test_conference_email_and_document_attachment_and_dedup()
    print("All mailbox unit tests passed successfully!")

