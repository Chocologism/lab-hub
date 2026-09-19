import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.main import app
from backend.database import Base, get_db
from backend.models import User, InviteCode, SystemSetting

client = TestClient(app)

from sqlalchemy.pool import StaticPool

# 为本测试文件建立独立的内存隔离数据库
TEST_DB_URL = "sqlite:///:memory:"
test_engine = create_engine(
    TEST_DB_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(scope="module", autouse=True)
def setup_test_db():
    Base.metadata.create_all(bind=test_engine)
    app.dependency_overrides[get_db] = override_get_db
    yield
    app.dependency_overrides.pop(get_db, None)
    test_engine.dispose()


def test_system_uninitialized_and_first_run_setup():
    # 1. 初始状态：无用户，未初始化
    res = client.get("/api/system/status")
    assert res.status_code == 200
    status_data = res.json()
    assert status_data["initialized"] is False
    assert status_data["user_count"] == 0

    # 2. 校验首次向导必填项
    bad_res = client.post("/api/system/setup", json={
        "admin_name": "",
        "admin_email": "admin@test.edu",
        "admin_password": "123", # 太短
        "lab_name": "",
        "lab_short_name": "",
        "invite_code": ""
    })
    assert bad_res.status_code == 400

    # 3. 正常执行首次向导
    setup_payload = {
        "admin_name": "张开源",
        "admin_real_name": "张三",
        "admin_email": "admin@opensource.edu",
        "admin_password": "securePassword123",
        "lab_name": "智能计算与开源实验室",
        "lab_short_name": "ICLAB",
        "site_slogan": "面向未来的科研协作平台",
        "site_title": "ICLAB-Hub",
        "invite_code": "ICLAB-2026",
        "institution": "某某大学",
        "default_location": "科技楼 501"
    }
    setup_res = client.post("/api/system/setup", json=setup_payload)
    assert setup_res.status_code == 200
    setup_data = setup_res.json()
    assert "access_token" in setup_data
    admin_user = setup_data["user"]
    assert admin_user["role"] == "admin"
    assert admin_user["can_manage_seminars"] is True
    assert admin_user["tutorial_completed"] is False
    admin_token = setup_data["access_token"]
    headers = {"Authorization": f"Bearer {admin_token}"}

    # 4. 再次请求初始化向导应被拦截并报错
    repeat_res = client.post("/api/system/setup", json=setup_payload)
    assert repeat_res.status_code == 400
    assert "禁止重复设置" in repeat_res.json()["detail"]

    # 5. 再次查询系统状态：已被标记为已初始化
    status_res2 = client.get("/api/system/status")
    assert status_res2.status_code == 200
    s2 = status_res2.json()
    assert s2["initialized"] is True
    assert s2["user_count"] == 1
    assert s2["lab_name"] == "智能计算与开源实验室"
    assert s2["lab_short_name"] == "ICLAB"

    # 6. 验证生成的邀请码生效：普通组员可使用该码注册
    member_reg = client.post("/api/auth/register", json={
        "name": "李学生",
        "email": "student@opensource.edu",
        "password": "studentPass123",
        "invite_code": "ICLAB-2026"
    })
    assert member_reg.status_code == 200
    member_token = member_reg.json()["access_token"]
    member_headers = {"Authorization": f"Bearer {member_token}"}
    assert member_reg.json()["user"]["role"] == "student"
    assert member_reg.json()["user"]["tutorial_completed"] is False

    # 7. 测试完成教程接口
    tutorial_res = client.post("/api/auth/complete-tutorial", headers=headers)
    assert tutorial_res.status_code == 200
    assert tutorial_res.json()["tutorial_completed"] is True

    # 验证 getMe 返回 tutorial_completed == True
    me_res = client.get("/api/auth/me", headers=headers)
    assert me_res.status_code == 200
    assert me_res.json()["tutorial_completed"] is True

    # 8. 管理员配置读取与修改
    # 普通用户无法访问 settings
    unauth_settings = client.get("/api/system/settings", headers=member_headers)
    assert unauth_settings.status_code == 403

    # 管理员读取与修改设置
    get_sett = client.get("/api/system/settings", headers=headers)
    assert get_sett.status_code == 200
    assert get_sett.json()["lab_name"] == "智能计算与开源实验室"

    put_sett = client.put("/api/system/settings", headers=headers, json={
        "lab_name": "新智能计算实验室",
        "lab_short_name": "NICLAB",
        "ai_system_prompt": "你是一个精通全学科的顶级科研导师。"
    })
    assert put_sett.status_code == 200

    # 再次查询状态验证更新
    final_status = client.get("/api/system/status")
    assert final_status.json()["lab_name"] == "新智能计算实验室"
    assert final_status.json()["lab_short_name"] == "NICLAB"
