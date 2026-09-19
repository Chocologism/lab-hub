import pytest
from fastapi.testclient import TestClient
from backend.main import app
from backend.database import SessionLocal
from backend.models import User, SeminarSchedule, SeminarPresentation
from backend.auth import get_password_hash

client = TestClient(app)

def login(email, password="password123"):
    if email == "admin@lab.edu":
        password = "lab123456"
    elif email == "student@lab.edu":
        password = "lab123456"
    res = client.post("/api/auth/login", json={"email": email, "password": password})
    assert res.status_code == 200, f"Login failed for {email}: {res.text}"
    token = res.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}

def ensure_user(email, name, password="password123", role="student"):
    db = SessionLocal()
    u = db.query(User).filter(User.email == email).first()
    if not u:
        u = User(
            email=email,
            name=name,
            real_name=name,
            hashed_password=get_password_hash(password),
            role=role
        )
        db.add(u)
        db.commit()
        db.refresh(u)
    else:
        u.real_name = name
        u.hashed_password = get_password_hash(password)
        db.commit()
        db.refresh(u)
    uid = u.id
    db.close()
    return uid

def test_auto_association_and_stats():
    admin_headers = login("admin@lab.edu")

    # 1. 创建一场包含未知主讲人与分享人的组会
    import uuid
    unique_presenter = f"张三_{uuid.uuid4().hex[:6]}"
    unique_sharer = f"李四_{uuid.uuid4().hex[:6]}"

    res = client.post("/api/seminars", headers=admin_headers, json={
        "date": "2026-11-20",
        "time": "14:00",
        "location": "仙林主楼",
        "topic": "待定",
        "presenter_name": unique_presenter,
        "presentations": [
            {
                "presenter_name": unique_sharer,
                "arxiv_id": "2301.12345"
            }
        ]
    })
    assert res.status_code == 200
    seminar_id = res.json()["id"]

    # 2. 普通学生不能调用批量关联接口
    user_headers = login("student@lab.edu")
    assert client.post("/api/seminars/admin/batch-match-presenters", headers=user_headers).status_code == 403

    # 3. 新用户注册为“测试人员张三A”
    zhang_email = "zhangsan_test@lab.edu"
    db = SessionLocal()
    old_u = db.query(User).filter(User.email == zhang_email).first()
    if old_u:
        db.delete(old_u)
        db.commit()
    db.close()

    reg_res = client.post("/api/auth/register", json={
        "email": zhang_email,
        "name": unique_presenter,
        "password": "password123",
        "invite_code": "LAB-2026"
    })
    assert reg_res.status_code == 200
    zhang_user_id = reg_res.json()["user"]["id"]

    # 验证系统已自动将张三关联为主讲人
    check_res = client.get("/api/seminars", headers=admin_headers)
    assert check_res.status_code == 200
    s = next(item for item in check_res.json() if item["id"] == seminar_id)
    assert s["presenter_id"] == zhang_user_id
    assert s["presenter_name"] == unique_presenter

    # 4. 新用户李四先以别名注册，再在个人中心更新 real_name 为“测试人员李四B”
    lisi_email = "lisi_test@lab.edu"
    db = SessionLocal()
    old_l = db.query(User).filter(User.email == lisi_email).first()
    if old_l:
        db.delete(old_l)
        db.commit()
    db.close()

    reg_l = client.post("/api/auth/register", json={
        "email": lisi_email,
        "name": "初试李四",
        "password": "password123",
        "invite_code": "LAB-2026"
    })
    assert reg_l.status_code == 200
    lisi_token = reg_l.json()["access_token"]
    lisi_headers = {"Authorization": f"Bearer {lisi_token}"}
    lisi_user_id = reg_l.json()["user"]["id"]

    # 更新李四的个人信息 real_name
    update_res = client.put("/api/account/profile", headers=lisi_headers, json={
        "real_name": unique_sharer
    })
    assert update_res.status_code == 200

    # 验证李四更新姓名后，自动关联合约
    check_res2 = client.get("/api/seminars", headers=admin_headers)
    assert check_res2.status_code == 200
    s2 = next(item for item in check_res2.json() if item["id"] == seminar_id)
    assert s2["presentations"][0]["presenter_id"] == lisi_user_id
    assert s2["presentations"][0]["presenter_name"] == unique_sharer

    # 5. 测试管理员一键批量匹配
    batch_res = client.post("/api/seminars/admin/batch-match-presenters", headers=admin_headers)
    assert batch_res.status_code == 200
    assert "matched_users" in batch_res.json()

def test_granular_permissions():
    admin_headers = login("admin@lab.edu")
    
    # 确保用户张三与李四存在
    zhang_id = ensure_user("zhangsan_test@lab.edu", "测试人员张三A", "password123")
    lisi_id = ensure_user("lisi_test@lab.edu", "测试人员李四B", "password123")
    
    zhang_headers = login("zhangsan_test@lab.edu", "password123")
    lisi_headers = login("lisi_test@lab.edu", "password123")
    student_headers = login("student@lab.edu")

    # 创建一场组会，主讲人为张三，分享人为李四
    sem_res = client.post("/api/seminars", headers=admin_headers, json={
        "date": "2026-11-25",
        "time": "15:00",
        "location": "仙林主楼",
        "topic": "权限管控测试场次",
        "presenter_id": zhang_id,
        "presenter_name": "测试人员张三A",
        "presentations": [
            {
                "presenter_id": lisi_id,
                "presenter_name": "测试人员李四B",
                "arxiv_id": "2302.13971"
            }
        ]
    })
    assert sem_res.status_code == 200
    sem_id = sem_res.json()["id"]

    # 1. 普通非关联学生尝试篡改排期日期或主题 -> 403
    bad_edit = client.put(f"/api/seminars/{sem_id}", headers=student_headers, json={
        "date": "2026-11-28",
        "topic": "被篡改的主题"
    })
    assert bad_edit.status_code == 403

    # 普通非关联学生尝试删除组会 -> 403
    bad_del = client.delete(f"/api/seminars/{sem_id}", headers=student_headers)
    assert bad_del.status_code == 403

    # 2. 张三作为主讲人，填写自己的摘要 -> 成功
    ok_abs = client.put(f"/api/seminars/{sem_id}/abstract", headers=zhang_headers, json={
        "abstract": "这是张三的主讲摘要内容"
    })
    assert ok_abs.status_code == 200
    assert ok_abs.json()["abstract"] == "这是张三的主讲摘要内容"

    # 李四（不是主讲人）尝试修改张三的摘要 -> 403
    bad_abs = client.put(f"/api/seminars/{sem_id}/abstract", headers=lisi_headers, json={
        "abstract": "李四企图改张三的摘要"
    })
    assert bad_abs.status_code == 403

    # 3. 李四作为分享人，更新自己的 arXiv 与 Slides -> 成功
    ok_share = client.put(f"/api/seminars/{sem_id}/presentation-share", headers=lisi_headers, json={
        "arxiv_id": "2401.00001",
        "slides_url": "https://example.com/lisi_slides.pdf"
    })
    assert ok_share.status_code == 200
    assert ok_share.json()["presentations"][0]["arxiv_id"] == "2401.00001"
    assert ok_share.json()["presentations"][0]["slides_url"] == "https://example.com/lisi_slides.pdf"

    # 张三企图篡改李四的文献分享 -> 403
    bad_share = client.put(f"/api/seminars/{sem_id}/presentation-share", headers=zhang_headers, json={
        "presentation_id": ok_share.json()["presentations"][0]["id"],
        "arxiv_id": "2402.99999"
    })
    assert bad_share.status_code == 403
