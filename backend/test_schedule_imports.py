import pytest
from fastapi.testclient import TestClient
from backend.main import app
from backend.database import SessionLocal
from backend.models import PendingScheduleImport, ObservatoryTalk, Notice

client = TestClient(app)


def test_schedule_imports_crud_and_resolution():
    login_res = client.post("/api/auth/login", json={"email": "admin@lab.edu", "password": "lab123456"})
    assert login_res.status_code == 200
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 1. 验证空内容创建报错 400
    empty_res = client.post("/api/schedule-imports/pending", json={}, headers=headers)
    assert empty_res.status_code == 400

    # 2. 创建一个待审核报告条目
    payload = {
        "raw_text": "学术报告通知\n主讲人：王专家\n题目：引力波暴与千新星探测\n时间：2026-11-25 14:00\n地点：天文楼 216 会议室",
        "inferred_type": "talk",
        "parsed_data": {
            "title": "引力波暴与千新星探测",
            "speaker": "王专家",
            "date": "2026-11-25",
            "time": "14:00",
            "location": "天文楼 216 会议室"
        },
        "image_urls": ["/api/files/poster1.png"]
    }
    create_res = client.post("/api/schedule-imports/pending", json=payload, headers=headers)
    assert create_res.status_code == 200
    created_id = create_res.json()["id"]

    # 3. 列表查询应包含该待审核项
    list_res = client.get("/api/schedule-imports/pending", headers=headers)
    assert list_res.status_code == 200
    items = list_res.json()["list"]
    target_item = next((it for it in items if it["id"] == created_id), None)
    assert target_item is not None
    assert target_item["inferred_type"] == "talk"
    assert target_item["status"] == "pending"
    assert target_item["parsed_data"]["speaker"] == "王专家"

    talk_to_clean = None
    notice_to_clean = None
    try:
        # 4. 审核通过并正式发布为报告
        resolve_res = client.post(
            f"/api/schedule-imports/{created_id}/resolve",
            json={
                "target_type": "talk",
                "data": {
                    "title": "引力波暴与千新星探测",
                    "speaker": "王专家",
                    "date": "2026-11-25",
                    "time": "14:00",
                    "location": "天文楼 216 会议室",
                    "notes": "正式发布"
                }
            },
            headers=headers
        )
        assert resolve_res.status_code == 200
        talk_to_clean = resolve_res.json()["target_id"]

        # 5. 再次查询 pending，已完成的不应出现在列表中
        list_res2 = client.get("/api/schedule-imports/pending", headers=headers)
        assert not any(it["id"] == created_id for it in list_res2.json()["list"])

        # 6. 测试删除操作
        payload_notice = {
            "raw_text": "【重要通知】关于国庆节放假调休安排的通知",
            "inferred_type": "notice",
            "parsed_data": {"title": "关于国庆节放假调休安排的通知"}
        }
        create_res2 = client.post("/api/schedule-imports/pending", json=payload_notice, headers=headers)
        assert create_res2.status_code == 200
        notice_id = create_res2.json()["id"]

        del_res = client.delete(f"/api/schedule-imports/{notice_id}", headers=headers)
        assert del_res.status_code == 200

        list_res3 = client.get("/api/schedule-imports/pending", headers=headers)
        assert not any(it["id"] == notice_id for it in list_res3.json()["list"])

    finally:
        with SessionLocal() as db:
            db.query(PendingScheduleImport).filter(PendingScheduleImport.id.in_([created_id])).delete(synchronize_session=False)
            if talk_to_clean:
                db.query(ObservatoryTalk).filter(ObservatoryTalk.id == talk_to_clean).delete(synchronize_session=False)
            db.commit()
