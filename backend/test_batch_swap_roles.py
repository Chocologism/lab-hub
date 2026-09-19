import pytest
from datetime import datetime, timedelta
from fastapi.testclient import TestClient
from backend.main import app
from backend.database import get_db, Base
from backend.models import User, SeminarSchedule
from backend.auth import get_password_hash, create_access_token
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Setup test DB
SQLALCHEMY_DATABASE_URL = "sqlite:///./test_batch_swap.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


client = TestClient(app)


@pytest.fixture(scope="module", autouse=True)
def setup_db():
    app.dependency_overrides[get_db] = override_get_db
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()

    # Create admin
    admin = User(
        name="管理员",
        real_name="管理员",
        nickname="Admin",
        email="admin@lab.edu",
        hashed_password=get_password_hash("password123"),
        role="admin",
        can_manage_seminars=True
    )
    # Create regular student
    student = User(
        name="张三",
        real_name="张三",
        nickname="San",
        email="zhangsan@lab.edu",
        hashed_password=get_password_hash("password123"),
        role="student",
        can_manage_seminars=False
    )
    # Create second student
    student2 = User(
        name="李四",
        real_name="李四",
        nickname="Si",
        email="lisi@lab.edu",
        hashed_password=get_password_hash("password123"),
        role="student",
        can_manage_seminars=False
    )
    db.add_all([admin, student, student2])
    db.commit()

    # Create 3 upcoming seminars
    s1 = SeminarSchedule(
        date="2026-10-01",
        time="14:00",
        location="待定",
        presenter_name="张三",
        topic="专题研讨一",
        status="upcoming"
    )
    s2 = SeminarSchedule(
        date="2026-10-08",
        time="14:30",
        location="待定",
        presenter_name="李四",
        topic="专题研讨二",
        status="upcoming"
    )
    s3 = SeminarSchedule(
        date="2026-10-15",
        time="15:00",
        location="旧会议室",
        presenter_name="王五",
        topic="专题研讨三",
        status="upcoming"
    )
    s_past = SeminarSchedule(
        date="2026-09-01",
        time="14:00",
        location="历史会议室",
        presenter_name="赵六",
        topic="历史组会",
        status="completed"
    )
    db.add_all([s1, s2, s3, s_past])
    db.commit()
    db.close()
    yield
    Base.metadata.drop_all(bind=engine)
    app.dependency_overrides.pop(get_db, None)


def test_batch_location():
    admin_token = create_access_token({"sub": 1, "ver": 0})
    student_token = create_access_token({"sub": 2, "ver": 0})

    # Student cannot set batch location (403)
    resp = client.post(
        "/api/seminars/batch-location",
        json={"location": "腾讯会议 111-222-333", "scope": "upcoming"},
        headers={"Authorization": f"Bearer {student_token}"}
    )
    assert resp.status_code == 403

    # Admin sets batch location on upcoming seminars
    resp = client.post(
        "/api/seminars/batch-location",
        json={"location": "腾讯会议 888-999-000", "scope": "upcoming"},
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["updated_count"] == 3
    assert data["location"] == "腾讯会议 888-999-000"

    # Verify past seminar location was not changed
    db = TestingSessionLocal()
    past_sem = db.query(SeminarSchedule).filter_by(status="completed").first()
    assert past_sem.location == "历史会议室"
    upcoming_sems = db.query(SeminarSchedule).filter_by(status="upcoming").all()
    for s in upcoming_sems:
        assert s.location == "腾讯会议 888-999-000"
    db.close()


def test_postpone_cascade():
    admin_token = create_access_token({"sub": 1, "ver": 0})

    # Target is s2 (2026-10-08). Postpone by 7 days (+1 week)
    db = TestingSessionLocal()
    s1 = db.query(SeminarSchedule).filter_by(topic="专题研讨一").first()
    s2 = db.query(SeminarSchedule).filter_by(topic="专题研讨二").first()
    s3 = db.query(SeminarSchedule).filter_by(topic="专题研讨三").first()
    s1_id, s2_id, s3_id = s1.id, s2.id, s3.id
    db.close()

    resp = client.post(
        f"/api/seminars/{s2_id}/postpone-cascade",
        json={"days": 7},
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert resp.status_code == 200
    res = resp.json()
    assert res["affected_count"] == 2  # s2 and s3

    db = TestingSessionLocal()
    s1_after = db.get(SeminarSchedule, s1_id)
    s2_after = db.get(SeminarSchedule, s2_id)
    s3_after = db.get(SeminarSchedule, s3_id)

    # s1 was before s2, so unchanged
    assert s1_after.date == "2026-10-01"
    # s2 moved from 2026-10-08 to 2026-10-15
    assert s2_after.date == "2026-10-15"
    # s3 moved from 2026-10-15 to 2026-10-22
    assert s3_after.date == "2026-10-22"
    db.close()


def test_swap_seminars():
    admin_token = create_access_token({"sub": 1, "ver": 0})
    student_token = create_access_token({"sub": 2, "ver": 0})

    db = TestingSessionLocal()
    s1 = db.query(SeminarSchedule).filter_by(topic="专题研讨一").first()
    s2 = db.query(SeminarSchedule).filter_by(topic="专题研讨二").first()
    s1_id, s2_id = s1.id, s2.id
    s1_orig_date, s1_orig_time = s1.date, s1.time
    s2_orig_date, s2_orig_time = s2.date, s2.time
    db.close()

    # Non-manager cannot swap
    resp = client.post(
        "/api/seminars/swap",
        json={"id1": s1_id, "id2": s2_id},
        headers={"Authorization": f"Bearer {student_token}"}
    )
    assert resp.status_code == 403

    # Swap with self rejected
    resp = client.post(
        "/api/seminars/swap",
        json={"id1": s1_id, "id2": s1_id},
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert resp.status_code == 400

    # Admin swaps s1 and s2
    resp = client.post(
        "/api/seminars/swap",
        json={"id1": s1_id, "id2": s2_id},
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert resp.status_code == 200

    db = TestingSessionLocal()
    s1_after = db.get(SeminarSchedule, s1_id)
    s2_after = db.get(SeminarSchedule, s2_id)
    assert s1_after.date == s2_orig_date
    assert s1_after.time == s2_orig_time
    assert s2_after.date == s1_orig_date
    assert s2_after.time == s1_orig_time
    assert s1_after.topic == "专题研讨一"
    assert s2_after.topic == "专题研讨二"
    db.close()


def test_member_role_management():
    admin_token = create_access_token({"sub": 1, "ver": 0})
    student_token = create_access_token({"sub": 2, "ver": 0})

    # Student cannot change roles (403)
    resp = client.patch(
        "/api/auth/members/3/role",
        json={"role": "admin"},
        headers={"Authorization": f"Bearer {student_token}"}
    )
    assert resp.status_code == 403

    # Admin promotes student (id 2) to admin
    resp = client.patch(
        "/api/auth/members/2/role",
        json={"role": "admin"},
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["role"] == "admin"
    assert data["can_manage_seminars"] is True

    # Demoting user 2 back to student
    resp = client.patch(
        "/api/auth/members/2/role",
        json={"role": "student"},
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert resp.status_code == 200
    assert resp.json()["role"] == "student"

    # Admin cannot demote self if only 1 admin left
    resp = client.patch(
        "/api/auth/members/1/role",
        json={"role": "student"},
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert resp.status_code == 400
    assert "至少需保留一名管理员" in resp.json()["detail"]
