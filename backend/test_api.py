import os
import uuid
import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.database import Base, engine, SessionLocal
from backend.models import User, ArxivPaper

client = TestClient(app)

def test_health_check():
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert "Lab" in data["service"]

def test_login_demo_users():
    # 测试课题组导师（PI）登录
    res = client.post("/api/auth/login", json={"email": "shu@lab.edu", "password": "lab123456"})
    assert res.status_code == 200, res.text
    data = res.json()
    assert "access_token" in data
    assert data["user"]["role"] == "teacher"
    assert "导师" in data["user"]["name"]

    # 测试错误密码拦截
    bad_res = client.post("/api/auth/login", json={"email": "shu@lab.edu", "password": "wrongpassword"})
    assert bad_res.status_code == 401

def test_register_with_invite_code():
    random_email = f"student_{uuid.uuid4().hex[:8]}@lab.edu"
    # 错误邀请码被拦截
    bad_reg = client.post("/api/auth/register", json={
        "name": "新同学",
        "email": random_email,
        "password": "mypassword123",
        "invite_code": "WRONG_CODE"
    })
    assert bad_reg.status_code == 400
    assert "邀请码错误" in bad_reg.json()["detail"]

    # 正确邀请码注册成功 (支持 LAB-2026)
    good_reg = client.post("/api/auth/register", json={
        "name": "新同学 (研一)",
        "email": random_email,
        "password": "mypassword123",
        "invite_code": "LAB-2026"
    })
    assert good_reg.status_code == 200
    reg_data = good_reg.json()
    assert "access_token" in reg_data
    assert reg_data["user"]["name"] == "新同学 (研一)"

def test_arxiv_feed_and_recommendation():
    # 登录学生
    login_res = client.post("/api/auth/login", json={"email": "student@lab.edu", "password": "lab123456"})
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 获取文献流
    feed_res = client.get("/api/arxiv/feed?scope=all", headers=headers)
    assert feed_res.status_code == 200
    papers = feed_res.json()
    assert len(papers) >= 2
    # 第一篇应该包含导师高亮或置顶
    assert papers[0]["is_pinned"] is True

    # 推荐新文献（使用动态 ID 避免唯一冲突）
    test_arxiv_id = f"2403.{int(uuid.uuid4().hex[:8], 16) % 100000:05d}"
    new_paper_res = client.post("/api/arxiv/recommend", headers=headers, json={
        "arxiv_id": test_arxiv_id,
        "title": "A Novel Test Paper on Deep Learning",
        "authors": ["Test Author A", "Test Author B"],
        "abstract": "This is a test abstract for automated verification.",
        "primary_category": "astro-ph.CO",
        "published_date": "2024-03-20",
        "pdf_url": f"https://arxiv.org/pdf/{test_arxiv_id}.pdf",
        "recommend_comment": "测试推荐语：这篇方法很有新意！"
    })
    assert new_paper_res.status_code == 200
    new_paper = new_paper_res.json()
    assert new_paper["arxiv_id"] == test_arxiv_id

    # 打卡阅读
    paper_id = new_paper["id"]
    read_res = client.post(f"/api/arxiv/{paper_id}/read-toggle", headers=headers)
    assert read_res.status_code == 200
    assert read_res.json()["is_read"] is True

def test_seminar_schedule_and_linking():
    login_res = client.post("/api/auth/login", json={"email": "shu@lab.edu", "password": "lab123456"})
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 获取已有组会列表
    res = client.get("/api/seminars", headers=headers)
    assert res.status_code == 200
    seminars = res.json()
    assert len(seminars) >= 2

    # 新建组会并关联文献
    create_res = client.post("/api/seminars", headers=headers, json={
        "date": "2026-09-25",
        "time": "15:00",
        "location": "物理楼 302",
        "presenter_name": "王同学 (研二)",
        "topic": "高维时序数据分析与动力学参数反演",
        "slides_url": "https://example.com/slides-demo.pdf",
        "notes": "建议大家提前复习相关基础章节"
    })
    assert create_res.status_code == 200
    created = create_res.json()
    assert created["topic"] == "高维时序数据分析与动力学参数反演"

def test_resource_books_catalog():
    login_res = client.post("/api/auth/login", json={"email": "student@lab.edu", "password": "lab123456"})
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 获取全部书籍
    books_res = client.get("/api/resources/books", headers=headers)
    assert books_res.status_code == 200
    books = books_res.json()
    assert len(books) >= 3
    # 验证书籍是否包含了教程与习题集直达外链
    first_book = books[0]
    assert first_book["tutorial_url"] is not None
    assert first_book["exercise_url"] is not None
    assert first_book["github_url"] is not None

def test_spa_frontend_serving():
    # 测试直接通过 FastAPI 访问根路径是否返回打包后的 index.html
    root_res = client.get("/")
    assert root_res.status_code == 200
    assert "Lab-Hub" in root_res.text or "科研协作" in root_res.text or "<title>" in root_res.text
