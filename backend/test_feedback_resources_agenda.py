from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
import pytest
from fastapi.testclient import TestClient
from backend.main import app
from backend.database import SessionLocal
from backend.models import IssueFeedback, FeedbackReply, SeminarSchedule, SeminarPresentation, User
from backend.services.reminders import upcoming_for_user
from backend.test_personal import accounts

client = TestClient(app)


def test_feedback_reply_roundtrip_and_privacy(accounts):
    teacher, admin, member = [accounts[r][1] for r in ('teacher', 'admin', 'member')]
    title = 'Teacher feedback roundtrip'
    assert client.post('/api/feedback', headers=teacher, json={'title': title, 'content': 'Cannot open PDF'}).status_code == 201
    row = next(r for r in client.get('/api/feedback', headers=admin).json() if r['title'] == title)
    path = f"/api/feedback/{row['id']}/replies"
    try:
        for h in (teacher, member):
            assert client.post(path, headers=h, json={'content': 'Spoofed reply'}).status_code == 403
            assert client.get('/api/feedback', headers=h).status_code == 403
        assert client.post(path, headers=admin, json={'content': '   '}).status_code == 422
        assert client.post(path, headers=admin, json={'content': 'x', 'user_id': accounts['member'][0]}).status_code == 422
        assert client.post(path, headers=admin, json={'content': '已修复 PDF 打开问题', 'resolved': True}).status_code == 201
        mine = next(r for r in TestClient(app).get('/api/feedback/mine', headers=teacher).json() if r['id'] == row['id'])
        assert mine['resolved'] and mine['replies'][0]['content'] == '已修复 PDF 打开问题'
        assert not any(r['id'] == row['id'] for r in client.get('/api/feedback/mine', headers=member).json())
        assert client.get('/api/feedback/unread', headers=teacher).json()['count'] >= 1
        read_path = f"/api/feedback/replies/{mine['replies'][0]['id']}/read"
        assert client.put(read_path, headers=member).status_code == 404
        assert client.put(read_path, headers=teacher).status_code == 200
        assert client.put(read_path, headers=teacher).status_code == 200
        updated = next(r for r in client.get('/api/feedback/mine', headers=teacher).json() if r['id'] == row['id'])
        assert updated['replies'][0]['read_at']
        assert client.post(path, headers=admin, json={'content': '继续跟进', 'resolved': False}).status_code == 201
        updated = next(r for r in client.get('/api/feedback/mine', headers=teacher).json() if r['id'] == row['id'])
        assert len(updated['replies']) == 2 and not updated['resolved']
    finally:
        with SessionLocal() as db:
            db.query(FeedbackReply).filter_by(feedback_id=row['id']).delete()
            db.query(IssueFeedback).filter_by(id=row['id']).delete(); db.commit()


def test_resource_pdf_upload_and_authenticated_open(accounts):
    h = accounts['teacher'][1]
    pdf = b'%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF'
    assert client.post('/api/resources/pdf', files={'file': ('notes.pdf', pdf, 'application/pdf')}).status_code == 401
    response = client.post('/api/resources/pdf', headers=h, files={'file': ('讲义.pdf', pdf, 'application/pdf')})
    assert response.status_code == 201
    url = response.json()['url']
    book = client.post('/api/resources/books', headers=h, json={'title': 'PDF lecture test', 'authors': 'Test author', 'download_url': url})
    assert book.status_code == 200
    try:
        assert any(r['download_url'] == url for r in client.get('/api/resources/books', headers=accounts['member'][1]).json())
        assert client.get(url).status_code == 401
        opened = client.get(url, headers=accounts['member'][1])
        assert opened.content == pdf and opened.headers['content-type'] == 'application/pdf'
        for name, content in [('wrong.pdf', b'<html>not PDF</html>'), ('wrong.txt', pdf), ('empty.pdf', b'')]:
            assert client.post('/api/resources/pdf', headers=h, files={'file': (name, content, 'application/pdf')}).status_code == 400
    finally:
        client.delete(f"/api/resources/books/{book.json()['id']}", headers=h)


def test_role_countdowns_timezone_reassignment_and_legacy(accounts):
    now = datetime(2038, 1, 1, 23, 55, tzinfo=ZoneInfo('Asia/Shanghai'))
    with SessionLocal() as db:
        student, teacher = db.get(User, accounts['member'][0]), db.get(User, accounts['teacher'][0])
        rows = [SeminarSchedule(date='2038-01-02', time='00:05', presenter_id=student.id, presenter_name=student.name, topic='next main', status='upcoming'),
                SeminarSchedule(date='2038-01-03', time='14:30', presenter_id=teacher.id, presenter_name=teacher.name, topic='next share', status='upcoming'),
                SeminarSchedule(date='2038-01-01', time='12:00', presenter_id=student.id, presenter_name=student.name, topic='past today', status='upcoming')]
        rows[1].presentations = [SeminarPresentation(presenter_id=student.id, presenter_name='old nickname', arxiv_id='2609.04305')]
        db.add_all(rows); db.commit()
        try:
            result = upcoming_for_user(db, student, now)
            assert result['main']['id'] == rows[0].id and result['main']['days_until'] == 1
            assert result['arxiv']['id'] == rows[1].id and result['arxiv']['days_until'] == 2
            assert upcoming_for_user(db, teacher, now)['arxiv'] is None
            rows[0].status = 'cancelled'; rows[1].date = '2038-01-05'; db.commit()
            result = upcoming_for_user(db, student, now)
            assert result['main'] is None and result['arxiv']['days_until'] == 4
            rows[1].presentations[0].presenter_id = teacher.id; db.commit()
            assert upcoming_for_user(db, student, now)['arxiv'] is None
            rows[1].presentations[0].presenter_id = None
            rows[1].presentations[0].presenter_name = student.name; db.commit()
            assert upcoming_for_user(db, student, now)['arxiv']['id'] == rows[1].id
            rows[1].status = 'completed'; db.commit()
            assert upcoming_for_user(db, student, now) == {'main': None, 'arxiv': None}
        finally:
            for row in rows: db.delete(row)
            db.commit()


def test_home_agenda_requires_auth_and_returns_both_roles(accounts):
    assert client.get('/api/seminars/mine/upcoming').status_code == 401
    data = client.get('/api/seminars/mine/upcoming', headers=accounts['member'][1]).json()
    assert set(data) == {'main', 'arxiv'}


def test_share_account_binding_survives_save_and_edit(accounts, monkeypatch):
    async def prepared(db, presentations): return {}
    monkeypatch.setattr('backend.routers.seminar.prepare_references', prepared)
    day = (datetime.now(ZoneInfo('Asia/Shanghai')).date() + timedelta(days=20)).isoformat()
    h = accounts['teacher'][1]
    body = {'date': day, 'time': '14:30', 'location': 'test', 'topic': 'Bound presenter test',
            'presenter_name': 'Teacher', 'presenter_id': accounts['teacher'][0],
            'presentations': [{'presenter_name': 'Display name', 'presenter_id': accounts['member'][0], 'arxiv_id': '2609.04305'}]}
    response = client.post('/api/seminars', headers=h, json=body)
    assert response.status_code == 200
    row = response.json()
    try:
        assert row['presentations'][0]['presenter_id'] == accounts['member'][0]
        share = {**body['presentations'][0], 'presenter_id': accounts['teacher'][0]}
        updated = client.put(f"/api/seminars/{row['id']}", headers=h, json={'presentations': [share]})
        assert updated.status_code == 200
        assert updated.json()['presentations'][0]['presenter_id'] == accounts['teacher'][0]
        share['presenter_id'] = 2147483647
        assert client.put(f"/api/seminars/{row['id']}", headers=h, json={'presentations': [share]}).status_code == 400
        saved = next(r for r in client.get('/api/seminars', headers=h).json() if r['id'] == row['id'])
        assert saved['presentations'][0]['presenter_id'] == accounts['teacher'][0]
    finally:
        client.delete(f"/api/seminars/{row['id']}", headers=h)


def test_existing_share_records_are_preserved_by_migration():
    from sqlalchemy import create_engine, text
    from backend.migrations import migrate
    engine = create_engine('sqlite://')
    with engine.begin() as connection:
        connection.execute(text('CREATE TABLE seminar_presentations (id INTEGER PRIMARY KEY, presenter_name TEXT)'))
        connection.execute(text("INSERT INTO seminar_presentations VALUES (1, 'Existing speaker')"))
    migrate(engine); migrate(engine)
    with engine.connect() as connection:
        assert connection.execute(text('SELECT presenter_name, presenter_id FROM seminar_presentations')).one() == ('Existing speaker', None)
    engine.dispose()
