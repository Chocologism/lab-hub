from fastapi.testclient import TestClient
from backend.main import app
from backend.database import SessionLocal
from backend.models import User, ArxivPaper, PaperComment
from backend.auth import get_password_hash

client = TestClient(app)


def login(email: str = "admin@lab.edu"):
    password = "lab123456" if email == "admin@lab.edu" else "123456"
    res = client.post("/api/auth/login", json={"email": email, "password": password})
    assert res.status_code == 200
    token = res.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def setup_test_users_and_paper():
    with SessionLocal() as db:
        admin = db.query(User).filter_by(email="admin@lab.edu").first()
        if not admin:
            admin = User(
                email="admin@lab.edu",
                name="管理员",
                real_name="系统管理员",
                hashed_password=get_password_hash("lab123456"),
                role="admin",
            )
            db.add(admin)
            db.commit()
            db.refresh(admin)

        user_b = db.query(User).filter_by(email="comment_user_b@lab.edu").first()
        if not user_b:
            user_b = User(
                email="comment_user_b@lab.edu",
                name="讨论测试员B",
                real_name="测试员B",
                hashed_password=get_password_hash("123456"),
                role="member",
            )
            db.add(user_b)
            db.commit()
            db.refresh(user_b)

        paper = db.query(ArxivPaper).filter_by(arxiv_id="2609.88888").first()
        if not paper:
            paper = ArxivPaper(
                arxiv_id="2609.88888",
                title="Adaptive Incremental Polling Test Paper",
                authors='["Author One", "Author Two"]',
                abstract="A test abstract for incremental discussion polling.",
                recommended_by_id=admin.id,
                recommend_comment="测试讨论文献",
            )
            db.add(paper)
            db.commit()
            db.refresh(paper)
        return paper.id, admin.id, user_b.id


def test_paper_comments_crud_and_incremental_cursor():
    paper_id, admin_id, user_b_id = setup_test_users_and_paper()
    admin_headers = login("admin@lab.edu")
    b_headers = login("comment_user_b@lab.edu")

    # 1. 验证空内容被拦截
    res = client.post(f"/api/arxiv/{paper_id}/comments", json={"content": "  "}, headers=admin_headers)
    assert res.status_code == 400

    # 2. 发布第一条留言（管理员）
    res1 = client.post(
        f"/api/arxiv/{paper_id}/comments",
        json={"content": "这篇论文的引言很有启发。"},
        headers=admin_headers
    )
    assert res1.status_code == 200
    c1 = res1.json()
    assert c1["paper_id"] == paper_id
    assert c1["user_id"] == admin_id
    assert c1["content"] == "这篇论文的引言很有启发。"
    assert "管理员" in c1["user"]["name"]
    c1_id = c1["id"]

    # 3. 发布第二条留言（成员B）
    res2 = client.post(
        f"/api/arxiv/{paper_id}/comments",
        json={"content": "同意，公式(3)的推导特别优雅。$E=mc^2$"},
        headers=b_headers
    )
    assert res2.status_code == 200
    c2 = res2.json()
    assert c2["paper_id"] == paper_id
    assert c2["user_id"] == user_b_id
    c2_id = c2["id"]
    assert c2_id > c1_id

    # 4. 全量查询 (since_id=0)
    list_res = client.get(f"/api/arxiv/{paper_id}/comments", headers=admin_headers)
    assert list_res.status_code == 200
    all_comments = list_res.json()
    ids = [c["id"] for c in all_comments]
    assert c1_id in ids
    assert c2_id in ids

    # 5. 增量游标查询 (since_id = c1_id)
    inc_res = client.get(f"/api/arxiv/{paper_id}/comments?since_id={c1_id}", headers=admin_headers)
    assert inc_res.status_code == 200
    inc_comments = inc_res.json()
    inc_ids = [c["id"] for c in inc_comments]
    assert c1_id not in inc_ids
    assert c2_id in inc_ids

    # 6. 游标为最新 ID 时返回空数组（0 DOM 冗余开销）
    empty_res = client.get(f"/api/arxiv/{paper_id}/comments?since_id={c2_id}", headers=admin_headers)
    assert empty_res.status_code == 200
    assert len(empty_res.json()) == 0

    # 7. 权限控制：成员B无法删除管理员的留言 (403)
    del_forbidden = client.delete(f"/api/arxiv/comments/{c1_id}", headers=b_headers)
    assert del_forbidden.status_code == 403

    # 8. 成员B可以删除自己的留言 (200)
    del_b = client.delete(f"/api/arxiv/comments/{c2_id}", headers=b_headers)
    assert del_b.status_code == 200

    # 9. 管理员可以删除任意留言 (200)
    del_admin = client.delete(f"/api/arxiv/comments/{c1_id}", headers=admin_headers)
    assert del_admin.status_code == 200

    # 10. 再次增量拉取，删除后的留言不再出现
    after_del = client.get(f"/api/arxiv/{paper_id}/comments", headers=admin_headers)
    assert after_del.status_code == 200
    current_ids = [c["id"] for c in after_del.json()]
    assert c1_id not in current_ids
    assert c2_id not in current_ids
