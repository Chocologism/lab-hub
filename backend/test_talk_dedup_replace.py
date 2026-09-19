import pytest
from fastapi.testclient import TestClient
from backend.main import app

client = TestClient(app)


def test_talk_duplicate_detection_and_latest_push_replacement():
    login_res = client.post("/api/auth/login", json={"email": "admin@lab.edu", "password": "lab123456"})
    assert login_res.status_code == 200
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 1. 初始推送创建日程
    initial_payload = {
        "date": "2026-11-20",
        "time": "10:00",
        "title": "黑洞吸积盘与射电喷流观测研讨",
        "speaker": "张学者",
        "location": "仙林 302",
        "notes": "初次通知：报告暂定于上午举行",
        "poster_url": "/api/files/11111111-1111-1111-1111-111111111111",
        "event_type": "talk"
    }
    create_res = client.post("/api/talks", json=initial_payload, headers=headers)
    assert create_res.status_code == 200
    created = create_res.json()
    talk_id = created["id"]
    assert created["merged"] is False
    assert created["replaced"] is False
    assert created["time"] == "10:00"

    try:
        # 2. 收到更新邮件，再次推送日程（检测到重复日程，但时间/地点/说明/海报有更新）
        updated_push_payload = {
            "date": "2026-11-20",
            "time": "15:30",
            "title": "【学术报告】黑洞吸积盘与射电喷流观测研讨（时间调整）",
            "speaker": "张学者 教授",
            "location": "科研楼 5-516",
            "notes": "最新更正通知：时间推迟至下午15:30，地点调整至5-516会议室",
            "poster_url": "/api/files/22222222-2222-2222-2222-222222222222",
            "event_type": "talk"
        }
        dup_res = client.post("/api/talks", json=updated_push_payload, headers=headers)
        assert dup_res.status_code == 200
        dup_data = dup_res.json()

        # 断言：已检测到重复并成功替换更新
        assert dup_data["id"] == talk_id
        assert dup_data["merged"] is True
        assert dup_data["replaced"] is True
        assert "更新替换" in dup_data.get("message", "")
        assert dup_data["time"] == "15:30"
        assert dup_data["location"] == "科研楼 5-516"
        assert dup_data["speaker"] == "张学者 教授"
        assert dup_data["notes"] == "最新更正通知：时间推迟至下午15:30，地点调整至5-516会议室"
        assert dup_data["poster_url"] == "/api/files/22222222-2222-2222-2222-222222222222"

        # 3. 再次推送完全相同的内容（无任何变化）
        identical_res = client.post("/api/talks", json=updated_push_payload, headers=headers)
        assert identical_res.status_code == 200
        identical_data = identical_res.json()
        assert identical_data["id"] == talk_id
        assert identical_data["merged"] is True
        assert identical_data["replaced"] is False
        assert "无变更" in identical_data.get("message", "")

    finally:
        # 清理测试数据
        client.delete(f"/api/talks/{talk_id}", headers=headers)
