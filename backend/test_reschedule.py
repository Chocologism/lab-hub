from concurrent.futures import ThreadPoolExecutor
import pytest
from fastapi.testclient import TestClient
from backend.main import app

client = TestClient(app)


@pytest.fixture
def headers():
    result = client.post("/api/auth/login", json={"email": "admin@lab.edu", "password": "lab123456"})
    return {"Authorization": "Bearer " + result.json()["access_token"]}


def make_seminar(headers, date="2026-12-31"):
    response = client.post("/api/seminars", headers=headers, json={
        "date": date, "time": "23:30", "presenter_name": "测试组员", "topic": "跨年研讨",
        "location": "302", "notes": "保留纪要", "slides_url": "https://example.com/slides",
    })
    assert response.status_code == 200
    return response.json()


def change(item, date="2027-01-01"):
    return {"id": item["id"], "expected_date": item["date"], "date": date}


def get_item(headers, item):
    return next(s for s in client.get("/api/seminars", headers=headers).json() if s["id"] == item["id"])


def test_atomic_success_and_other_fields_preserved(headers):
    a, b = make_seminar(headers), make_seminar(headers)
    result = client.post("/api/seminars/reschedule", headers=headers, json={"changes": [change(a), change(b)]})
    assert result.status_code == 200
    assert result.json() == {"updated_ids": [a["id"], b["id"]]}
    saved = get_item(headers, a)
    assert saved["date"] == "2027-01-01"
    for field in ("time", "topic", "presenter_id", "presenter_name", "notes", "slides_url", "location", "status"):
        assert saved[field] == a[field]


@pytest.mark.parametrize("kind", ["date_changed", "completed", "missing"])
def test_conflict_rolls_back_every_change(headers, kind):
    a, b = make_seminar(headers), make_seminar(headers)
    if kind == "date_changed":
        client.put(f'/api/seminars/{b["id"]}', headers=headers, json={"date": "2027-02-01"})
    elif kind == "completed":
        client.put(f'/api/seminars/{b["id"]}', headers=headers, json={"status": "completed"})
    else:
        client.delete(f'/api/seminars/{b["id"]}', headers=headers)
    result = client.post("/api/seminars/reschedule", headers=headers, json={"changes": [change(a), change(b)]})
    assert result.status_code == 409
    assert result.json()["detail"]["conflicts"][0]["reason"] == kind
    assert get_item(headers, a)["date"] == a["date"]


@pytest.mark.parametrize("date", ["2026-02-30", "2026-2-01", "20260101", "2026-01-01T00:00:00Z", "wrong", None])
def test_bad_dates_rejected(headers, date):
    a = make_seminar(headers)
    assert client.post("/api/seminars/reschedule", headers=headers, json={"changes": [change(a, date)]}).status_code == 422
    assert get_item(headers, a)["date"] == a["date"]


def test_duplicate_empty_and_unauthenticated(headers):
    a = make_seminar(headers)
    for changes in ([], [change(a), change(a)]):
        assert client.post("/api/seminars/reschedule", headers=headers, json={"changes": changes}).status_code == 422
    assert client.post("/api/seminars/reschedule", json={"changes": [change(a)]}).status_code == 401


def test_competing_batches_have_one_winner(headers):
    a, b = make_seminar(headers), make_seminar(headers)
    def submit(date):
        with TestClient(app) as concurrent_client:
            return concurrent_client.post("/api/seminars/reschedule", headers=headers,
                json={"changes": [change(a, date), change(b, date)]}).status_code
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(submit, ["2027-01-02", "2027-01-03"]))
    assert sorted(results) == [200, 409]
    assert get_item(headers, a)["date"] == get_item(headers, b)["date"]
