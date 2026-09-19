import pytest
from fastapi.testclient import TestClient
from backend.main import app
from backend.database import SessionLocal
from backend.models import User, SeminarSchedule, SeminarPresentation, ResourceBook, ResourceCategory
from backend.auth import get_password_hash

client = TestClient(app)

def login(email, password="123456"):
    res = client.post("/api/auth/login", json={"email": email, "password": password})
    if res.status_code != 200:
        res = client.post("/api/auth/login", json={"email": email, "password": "lab123456"})
    assert res.status_code == 200
    token = res.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}

def test_resource_categories_and_author_requirement():
    admin_headers = login("admin@lab.edu")
    
    # 1. 获取默认分类
    res = client.get("/api/resources/categories", headers=admin_headers)
    assert res.status_code == 200
    names = [c["name"] for c in res.json()]
    assert "教材" in names and "工具" in names and "网站" in names

    # 2. 管理员新增自定义分类
    res = client.post("/api/resources/categories", headers=admin_headers, json={"name": "观测数据库"})
    assert res.status_code == 201
    assert res.json()["name"] == "观测数据库"

    # 重复添加报错
    assert client.post("/api/resources/categories", headers=admin_headers, json={"name": "观测数据库"}).status_code == 400

    # 3. 添加资料验证
    # 教材无作者应报错
    bad_book = client.post("/api/resources/books", headers=admin_headers, json={
        "title": "数值模拟进阶",
        "authors": "",
        "category": "教材"
    })
    assert bad_book.status_code == 422

    # 教材有作者，并包含外链
    ok_book = client.post("/api/resources/books", headers=admin_headers, json={
        "title": "数值模拟进阶",
        "authors": "作者A",
        "category": "教材",
        "tutorial_url": "https://example.com/notes",
        "exercise_url": "https://example.com/exercises",
        "github_url": "https://github.com/example/repo"
    })
    assert ok_book.status_code == 200
    book_data = ok_book.json()
    assert book_data["tutorial_url"] == "https://example.com/notes"
    assert book_data["exercise_url"] == "https://example.com/exercises"
    assert book_data["github_url"] == "https://github.com/example/repo"

    # 网站分类，作者留空应成功
    web_res = client.post("/api/resources/books", headers=admin_headers, json={
        "title": "NASA ADS",
        "authors": "",
        "category": "网站",
        "download_url": "https://ui.adsabs.harvard.edu"
    })
    assert web_res.status_code == 200
    assert web_res.json()["category"] == "网站"

    # 4. 删除自定义分类
    del_res = client.delete("/api/resources/categories/观测数据库", headers=admin_headers)
    assert del_res.status_code == 200

    # 删除内置分类应被拒绝
    assert client.delete("/api/resources/categories/教材", headers=admin_headers).status_code == 400

    # 清理创建的资料
    client.delete(f"/api/resources/books/{book_data['id']}", headers=admin_headers)
    client.delete(f"/api/resources/books/{web_res.json()['id']}", headers=admin_headers)

def test_seminar_relaxed_creation_and_dual_reminders():
    admin_headers = login("admin@lab.edu")

    # 确保测试成员存在
    with SessionLocal() as db:
        admin = db.query(User).filter_by(role="admin").first()
        sharer = db.query(User).filter_by(email="sharer_test@lab.edu").first()
        if not sharer:
            sharer = User(name="测试分享人", real_name="测试分享人", email="sharer_test@lab.edu", hashed_password=get_password_hash("123456"), role="student")
            db.add(sharer)
            db.commit()
            db.refresh(sharer)
        sharer_id = sharer.id
        admin_id = admin.id

    sharer_headers = login("sharer_test@lab.edu")

    # 1. 测试修改组会提醒设置
    settings_res = client.put("/api/seminars/settings", headers=admin_headers, json={
        "abstract_reminder_days": 10,
        "arxiv_reminder_days": 10
    })
    assert settings_res.status_code == 200
    assert settings_res.json()["abstract_reminder_days"] == 10

    # 2. 新建组会：只填时间、主讲人、arXiv 分享人姓名（topic, location, arxiv_id 留空）
    from datetime import date, timedelta
    meeting_date = (date.today() + timedelta(days=3)).isoformat()

    create_res = client.post("/api/seminars", headers=admin_headers, json={
        "date": meeting_date,
        "time": "15:00",
        "presenter_name": "系统管理员",
        "presenter_id": admin_id,
        "topic": "",  # 留空
        "location": "",  # 留空
        "presentations": [
            {
                "presenter_id": sharer_id,
                "presenter_name": "测试分享人",
                "arxiv_id": ""  # 留空
            }
        ]
    })
    assert create_res.status_code == 200
    seminar = create_res.json()
    assert seminar["topic"] == "工作汇报（待定）"
    assert seminar["location"] == "待定"
    assert len(seminar["presentations"]) == 1
    assert seminar["presentations"][0]["arxiv_id"] == ""

    # 3. 验证主讲人提醒（admin 登录查看 reminders）
    admin_reminders = client.get("/api/seminars/reminders", headers=admin_headers).json()
    abstract_reminders = [r for r in admin_reminders if r.get("type") == "abstract" and r.get("seminar_id") == seminar["id"]]
    assert len(abstract_reminders) == 1
    assert "摘要" in abstract_reminders[0]["message"]

    # 4. 验证分享人提醒（sharer 登录查看 reminders）
    sharer_reminders = client.get("/api/seminars/reminders", headers=sharer_headers).json()
    arxiv_reminders = [r for r in sharer_reminders if r.get("type") == "arxiv" and r.get("seminar_id") == seminar["id"]]
    assert len(arxiv_reminders) == 1
    assert "arXiv" in arxiv_reminders[0]["message"]

    # 5. 分享人补充 arXiv 编号
    sub_res = client.put(f"/api/seminars/{seminar['id']}/presentation-arxiv", headers=sharer_headers, json={
        "arxiv_id": "2301.00001"
    })
    assert sub_res.status_code == 200
    assert any(p["arxiv_id"] == "2301.00001" for p in sub_res.json()["presentations"])

    # 再次检查分享人提醒，已被消除
    sharer_reminders_after = client.get("/api/seminars/reminders", headers=sharer_headers).json()
    arxiv_reminders_after = [r for r in sharer_reminders_after if r.get("type") == "arxiv" and r.get("seminar_id") == seminar["id"]]
    assert len(arxiv_reminders_after) == 0

    # 清理组会
    client.delete(f"/api/seminars/{seminar['id']}", headers=admin_headers)


def test_flexible_presenter_and_sharers_and_import():
    admin_headers = login("admin@lab.edu")
    from datetime import date, timedelta
    meeting_date_1 = (date.today() + timedelta(days=5)).isoformat()
    meeting_date_2 = (date.today() + timedelta(days=6)).isoformat()
    meeting_date_3 = (date.today() + timedelta(days=7)).isoformat()

    # 1. 纯主讲人，无 arXiv 分享人 -> 应该成功创建
    res_main_only = client.post("/api/seminars", headers=admin_headers, json={
        "date": meeting_date_1,
        "time": "14:30",
        "presenter_name": "系统管理员",
        "topic": "仅有主讲汇报",
        "presentations": []
    })
    assert res_main_only.status_code == 200
    s1 = res_main_only.json()
    assert s1["presenter_name"] == "系统管理员"
    assert len(s1["presentations"]) == 0

    # 2. 无主讲人，仅有 arXiv 分享人 -> 应该成功创建
    res_sharer_only = client.post("/api/seminars", headers=admin_headers, json={
        "date": meeting_date_2,
        "time": "10:00",
        "presenter_name": "",
        "presentations": [
            {"presenter_name": "测试分享人", "arxiv_id": ""}
        ]
    })
    assert res_sharer_only.status_code == 200
    s2 = res_sharer_only.json()
    assert s2["presenter_name"] == ""
    assert s2["topic"] == "arXiv 文献分享"
    assert len(s2["presentations"]) == 1

    # 3. 既无主讲人，也无 arXiv 分享人 -> 应当被校验拦截（422）
    res_neither = client.post("/api/seminars", headers=admin_headers, json={
        "date": meeting_date_3,
        "time": "10:00",
        "presenter_name": "",
        "presentations": []
    })
    assert res_neither.status_code == 422

    # 4. 测试 CSV 文件解析接口
    csv_content = "报告人,日期,arxiv\n学者甲,9.9,～\n学者乙,9.16,分享人A，分享人B\n～,9.23,学者丙\n"
    parse_file_res = client.post(
        "/api/seminars/parse-import-file",
        headers=admin_headers,
        files={"file": ("seminar.csv", csv_content.encode("utf-8"), "text/csv")}
    )
    assert parse_file_res.status_code == 200
    file_data = parse_file_res.json()
    assert file_data["format"] in ("text", "csv")
    assert len(file_data["rows"]) == 3
    assert file_data["rows"][0]["presenter_name"] == "学者甲"

    # 5. 测试文本解析接口 (TSV 格式: 报告人 日期 arxiv)
    tsv_text = "报告人\t日期\tarxiv\n学者甲\t9.9\t～\n学者乙\t9.16\t分享人A，分享人B\n～\t9.23\t学者丙"
    parse_text_res = client.post(
        "/api/seminars/parse-import-text",
        headers=admin_headers,
        json={"text": tsv_text}
    )
    assert parse_text_res.status_code == 200
    text_data = parse_text_res.json()
    assert len(text_data["rows"]) == 3
    assert text_data["rows"][1]["presenter_name"] == "学者乙"
    assert len(text_data["rows"][1]["presentations"]) == 2
    assert text_data["rows"][2]["presenter_name"] == ""

    # 6. 测试批量导入接口（带 presentations，支持未注册成员）
    import_date_a = (date.today() + timedelta(days=20)).isoformat()
    import_date_b = (date.today() + timedelta(days=27)).isoformat()
    import_payload = {
        "rows": [
            {
                "date": import_date_a,
                "time": "10:00",
                "presenter_name": "外部学者张三",
                "topic": "宇宙学前沿",
                "location": "待定",
                "presentations": [
                    {"presenter_name": "李四", "arxiv_id": ""}
                ]
            },
            {
                "date": import_date_b,
                "time": "10:00",
                "presenter_name": "",
                "topic": "arXiv 文献分享",
                "location": "待定",
                "presentations": [
                    {"presenter_name": "王五", "arxiv_id": ""}
                ]
            }
        ]
    }
    import_res = client.post("/api/seminars/import", headers=admin_headers, json=import_payload)
    assert import_res.status_code == 200
    assert import_res.json()["imported"] == 2

    # 清理创建的组会
    client.delete(f"/api/seminars/{s1['id']}", headers=admin_headers)
    client.delete(f"/api/seminars/{s2['id']}", headers=admin_headers)


def test_admin_delete_library_paper():
    admin_headers = login("admin@lab.edu")
    user_headers = login("sharer_test@lab.edu")

    # 1. 创建一篇测试文献进入 library_papers
    from backend.database import SessionLocal
    from backend.models import LibraryPaper
    with SessionLocal() as db:
        p = LibraryPaper(arxiv_id="2301.99999", title="Test Paper To Delete", from_seminar=True)
        db.add(p)
        db.commit()
        db.refresh(p)
        paper_id = p.id

    # 2. 普通用户尝试删除 -> 403
    res_forbidden = client.delete(f"/api/library/{paper_id}", headers=user_headers)
    assert res_forbidden.status_code == 403

    # 3. 管理员删除 -> 200
    res_ok = client.delete(f"/api/library/{paper_id}", headers=admin_headers)
    assert res_ok.status_code == 200
    assert res_ok.json()["id"] == paper_id

    # 4. 确认已不存在
    with SessionLocal() as db:
        assert db.get(LibraryPaper, paper_id) is None


