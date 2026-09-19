import pytest
from fastapi.testclient import TestClient
from backend.main import app

client = TestClient(app)


def test_talk_and_multi_day_conference_crud():
    login_res = client.post("/api/auth/login", json={"email": "admin@lab.edu", "password": "lab123456"})
    assert login_res.status_code == 200
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Create a regular talk
    talk_payload = {
        "date": "2026-10-12",
        "time": "14:30",
        "title": "高能天体物理前沿专题报告",
        "speaker": "王学者",
        "location": "天文楼 502",
        "notes": "专题讲座",
        "event_type": "talk"
    }
    t_res = client.post("/api/talks", json=talk_payload, headers=headers)
    assert t_res.status_code == 200
    talk_data = t_res.json()
    assert talk_data["title"] == "高能天体物理前沿专题报告"
    assert talk_data["event_type"] == "talk"
    talk_id = talk_data["id"]

    # 2. Create a multi-day academic conference
    conf_payload = {
        "date": "2026-10-15",
        "end_date": "2026-10-18",
        "time": "全天",
        "title": "全国星系宇宙学学术研讨会",
        "speaker": "国家天文台",
        "location": "北京国际会议中心",
        "notes": "多日学术交流",
        "event_type": "conference"
    }
    c_res = client.post("/api/talks", json=conf_payload, headers=headers)
    assert c_res.status_code == 200
    conf_data = c_res.json()
    assert conf_data["title"] == "全国星系宇宙学学术研讨会"
    assert conf_data["event_type"] == "conference"
    assert conf_data["end_date"] == "2026-10-18"
    assert conf_data["time"] == "全天"
    conf_id = conf_data["id"]

    # 3. Retrieve talks and verify both are returned
    list_res = client.get("/api/talks", headers=headers)
    assert list_res.status_code == 200
    all_talks = list_res.json()
    found_conf = next((item for item in all_talks if item["id"] == conf_id), None)
    assert found_conf is not None
    assert found_conf["event_type"] == "conference"
    assert found_conf["end_date"] == "2026-10-18"

    # 4. Update conference
    update_res = client.put(f"/api/talks/{conf_id}", json={
        "date": "2026-10-15",
        "end_date": "2026-10-19",
        "time": "09:00 - 18:00",
        "title": "全国星系宇宙学学术研讨会（更新会期）",
        "speaker": "国家天文台 / 某学会",
        "location": "北京国际会议中心主会场",
        "event_type": "conference"
    }, headers=headers)
    assert update_res.status_code == 200
    updated_conf = update_res.json()
    assert updated_conf["end_date"] == "2026-10-19"
    assert updated_conf["time"] == "09:00 - 18:00"

    # 5. Clean up
    del_t = client.delete(f"/api/talks/{talk_id}", headers=headers)
    assert del_t.status_code == 200
    del_c = client.delete(f"/api/talks/{conf_id}", headers=headers)
    assert del_c.status_code == 200


def test_normal_user_can_update_talk_time_but_cannot_delete():
    from backend.database import SessionLocal
    from backend.models import User
    from backend.auth import get_password_hash

    db = SessionLocal()
    student = db.query(User).filter(User.email == "student_talk_test@lab.edu").first()
    if not student:
        student = User(
            email="student_talk_test@lab.edu",
            name="普通组员",
            real_name="普通组员",
            hashed_password=get_password_hash("123456"),
            role="student"
        )
        db.add(student)
        db.commit()
        db.refresh(student)
    db.close()

    admin_login = client.post("/api/auth/login", json={"email": "admin@lab.edu", "password": "lab123456"})
    admin_headers = {"Authorization": f"Bearer {admin_login.json()['access_token']}"}

    student_login = client.post("/api/auth/login", json={"email": "student_talk_test@lab.edu", "password": "123456"})
    student_headers = {"Authorization": f"Bearer {student_login.json()['access_token']}"}

    # 1. Admin creates a talk
    create_res = client.post("/api/talks", json={
        "date": "2026-11-01",
        "time": "10:00",
        "title": "台站学术报告·原初黑洞探讨",
        "speaker": "张专家",
        "location": "大会议室",
        "event_type": "talk"
    }, headers=admin_headers)
    assert create_res.status_code == 200
    talk_id = create_res.json()["id"]

    # 2. Normal student user updates the talk time
    update_res = client.put(f"/api/talks/{talk_id}", json={
        "date": "2026-11-01",
        "time": "16:00",
        "title": "台站学术报告·原初黑洞探讨",
        "speaker": "张专家",
        "location": "大会议室",
        "event_type": "talk"
    }, headers=student_headers)
    assert update_res.status_code == 200
    assert update_res.json()["time"] == "16:00"

    # 2.1 Normal student user attempts to modify protected title -> 403 Forbidden
    update_forbidden = client.put(f"/api/talks/{talk_id}", json={
        "date": "2026-11-01",
        "time": "16:00",
        "title": "篡改后的报告标题",
        "speaker": "张专家",
        "location": "大会议室",
        "event_type": "talk"
    }, headers=student_headers)
    assert update_forbidden.status_code == 403

    # 3. Normal student user attempts to delete the talk -> 403 Forbidden
    del_forbidden = client.delete(f"/api/talks/{talk_id}", headers=student_headers)
    assert del_forbidden.status_code == 403

    # 4. Admin cleans up
    del_ok = client.delete(f"/api/talks/{talk_id}", headers=admin_headers)
    assert del_ok.status_code == 200

