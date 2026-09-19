import io
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
import pytest
from PIL import Image
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text, inspect
from backend.main import app
from backend.database import SessionLocal
from backend.models import User, SeminarSchedule
from backend.auth import get_password_hash
from backend.services.reminders import due_seminars
from backend.migrations import migrate

client = TestClient(app)


def login(email, password='lab123456'):
    response = client.post('/api/auth/login', json={'email': email, 'password': password})
    assert response.status_code == 200, response.text
    data = response.json()
    return data['user'], {'Authorization': 'Bearer ' + data['access_token']}


def test_account_profile_avatar_credentials():
    # Dedicated fixture account: never change demo users or the development database.
    with SessionLocal() as db:
        db.add(User(name='Account fixture', email='account-fixture@example.org', hashed_password=get_password_hash('initial123'), role='student')); db.commit()
    user, headers = login('account-fixture@example.org', 'initial123')
    result = client.put('/api/account/profile', headers=headers, json={'real_name': '测试真名', 'nickname': '测试昵称'})
    assert result.status_code == 200 and result.json()['name'] == '测试昵称'
    assert client.put('/api/account/profile', headers=headers, json={'real_name': '   ', 'nickname': ''}).status_code == 422
    assert client.put('/api/account/profile', headers=headers, json={'real_name': 'Name', 'role': 'admin'}).status_code == 422
    image = Image.new('RGB', (60, 40), 'blue'); stream = io.BytesIO(); image.save(stream, format='PNG')
    uploaded = client.post('/api/account/avatar', headers=headers, files={'file': ('avatar.png', stream.getvalue(), 'image/png')})
    assert uploaded.status_code == 200, uploaded.text
    avatar = client.get(uploaded.json()['avatar'], headers=headers)
    assert Image.open(io.BytesIO(avatar.content)).size == (256, 256)
    assert client.post('/api/account/avatar', headers=headers, files={'file': ('evil.png', b'<script>bad</script>', 'image/png')}).status_code == 400
    assert client.post('/api/account/avatar', files={'file': ('avatar.png', stream.getvalue(), 'image/png')}).status_code == 401
    assert client.put('/api/account/credentials', headers=headers, json={'current_password': 'wrong', 'new_password': 'changed123'}).status_code == 400
    assert client.put('/api/account/credentials', headers=headers, json={'current_password': 'initial123', 'email': 'admin@lab.edu'}).status_code == 409
    assert client.put('/api/account/credentials', headers=headers, json={'current_password': 'initial123', 'new_password': '短' * 30}).status_code == 422
    updated = client.put('/api/account/credentials', headers=headers, json={'current_password': 'initial123', 'email': 'updated-account@example.org', 'new_password': 'changed123'})
    assert updated.status_code == 200, updated.text
    assert client.get('/api/auth/me', headers=headers).status_code == 401
    assert client.get('/api/auth/me', headers={'Authorization': 'Bearer ' + updated.json()['access_token']}).json()['real_name'] == '测试真名'
    assert client.post('/api/auth/login', json={'email': 'account-fixture@example.org', 'password': 'initial123'}).status_code == 401
    login('updated-account@example.org', 'changed123')


def test_journal_recommendation_library_and_favorites(monkeypatch):
    user, headers = login('student@lab.edu'); _, outsider = login('admin@lab.edu'); recipient, rh = login('shu@lab.edu')
    async def metadata(_):
        return {'arxiv_id': 'doi:10.9999/journal-test', 'title': 'Journal fixture', 'journal': 'Test Journal', 'authors': ['Author'], 'abstract': '', 'source_url': 'https://doi.org/10.9999/journal-test', 'pdf_url': None}
    monkeypatch.setattr('backend.routers.arxiv.fetch_journal_metadata', metadata)
    preview = client.post('/api/arxiv/preview', headers=headers, json={'url_or_id': '10.9999/journal-test'})
    assert preview.status_code == 200 and preview.json()['journal'] == 'Test Journal'
    data = dict(preview.json(), visibility='direct', recipient_ids=[recipient['id']])
    created = client.post('/api/arxiv/recommend', headers=headers, json=data)
    assert created.status_code == 200, created.text
    assert not created.json()['pdf_url']
    assert client.get('/api/library?q=journal-test', headers=outsider).json() == []
    library = client.get('/api/library?q=Test%20Journal', headers=rh).json()
    assert any(p['journal'] == 'Test Journal' and not p['pdf_url'] for p in library)
    assert client.put('/api/favorites/paper/doi:10.9999/journal-test', headers=rh).status_code == 200
    assert client.put('/api/favorites/paper/doi:10.9999/journal-test', headers=outsider).status_code == 404
    # A publisher URL without DOI works through manual input and has a stable dedup key.
    manual = {'title': 'No DOI fixture', 'authors': ['Author'], 'abstract': '', 'journal': 'Other Journal', 'source_url': 'https://example.org/article/fixture'}
    result = client.post('/api/arxiv/recommend', headers=headers, json=manual)
    assert result.status_code == 200 and result.json()['arxiv_id'].startswith('url:')
    assert client.post('/api/arxiv/recommend', headers=headers, json=manual).status_code == 400
    assert client.post('/api/arxiv/recommend', headers=headers, json=dict(manual, source_url='javascript:alert(1)')).status_code == 422
    assert client.post('/api/arxiv/recommend', headers=headers, json=dict(manual, pdf_url='javascript:alert(1)')).status_code == 422


def test_reminder_window_reassignment_and_abstract_permissions():
    member, mh = login('student@lab.edu'); teacher, th = login('shu@lab.edu'); _, ah = login('admin@lab.edu')
    now = datetime.now(ZoneInfo('Asia/Shanghai')).replace(second=0, microsecond=0)
    ids = []
    with SessionLocal() as db:
        for offset, status, abstract in [(6, 'upcoming', ''), (8, 'upcoming', ''), (2, 'cancelled', ''), (3, 'completed', ''), (4, 'upcoming', 'Already filled'), (-1, 'upcoming', '')]:
            date = now + timedelta(days=offset)
            s = SeminarSchedule(date=date.date().isoformat(), time=date.strftime('%H:%M'), presenter_id=member['id'], presenter_name=member['name'], topic='Reminder fixture', status=status, abstract=abstract)
            db.add(s); db.flush(); ids.append(s.id)
        db.commit()
        assert [s.id for s in due_seminars(db, member['id'], now) if s.id in ids] == [ids[0]]
        assert not [s.id for s in due_seminars(db, teacher['id'], now) if s.id in ids]
    try:
        url = f'/api/seminars/{ids[0]}/abstract'
        assert client.put(url, headers=th, json={'abstract': 'Not mine'}).status_code == 403
        assert client.put(f'/api/seminars/{ids[0]}', headers=th, json={'abstract': 'Bypass'}).status_code == 403
        assert client.put(url, headers=mh, json={'abstract': '  '}).status_code == 422
        assert any(s['id'] == ids[0] for s in client.get('/api/seminars/reminders', headers=mh).json())
        assert client.put(url, headers=mh, json={'abstract': 'My talk abstract'}).status_code == 200
        assert not any(s['id'] == ids[0] for s in client.get('/api/seminars/reminders', headers=mh).json())
        assert client.put(f'/api/seminars/{ids[0]}', headers=ah, json={'abstract': '', 'presenter_id': teacher['id'], 'presenter_name': teacher['name']}).status_code == 200
        assert any(s['id'] == ids[0] for s in client.get('/api/seminars/reminders', headers=th).json())
        assert not any(s['id'] == ids[0] for s in client.get('/api/seminars/reminders', headers=mh).json())
    finally:
        with SessionLocal() as db:
            db.query(SeminarSchedule).filter(SeminarSchedule.id.in_(ids)).delete(synchronize_session=False); db.commit()


def test_import_is_atomic_and_associates_registered_presenter():
    member, headers = login('student@lab.edu')
    row = {'date': '2033-01-14', 'presenter_name': member['name'], 'topic': 'Imported fixture', 'presenter_id': member['id']}
    invalid = dict(row, date='2033-01-21', presenter_id=None, presenter_name='Unregistered person')
    assert client.post('/api/seminars/import', headers=headers, json={'rows': [row, invalid]}).status_code == 400
    with SessionLocal() as db:
        assert not db.query(SeminarSchedule).filter_by(topic='Imported fixture').first()
    imported = client.post('/api/seminars/import', headers=headers, json={'rows': [row]})
    assert imported.status_code == 200 and imported.json()['imported'] == 1
    assert client.post('/api/seminars/import', headers=headers, json={'rows': [row]}).status_code == 409
    unknown = client.post('/api/seminars', headers=headers, json=dict(row, date='2033-02-04', presenter_id=None, presenter_name='External speaker'))
    assert unknown.status_code == 200 and unknown.json()['presenter_id'] is None
    assert unknown.json()['abstract'] == ''


def test_additive_migration_keeps_existing_data(tmp_path):
    engine = create_engine('sqlite:///' + str(tmp_path / 'legacy.db'))
    with engine.begin() as con:
        con.execute(text('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)'))
        con.execute(text("INSERT INTO users VALUES (1, 'Original')"))
    migrate(engine); migrate(engine)
    assert {'real_name', 'nickname', 'token_version'} <= {c['name'] for c in inspect(engine).get_columns('users')}
    with engine.connect() as con:
        assert con.execute(text('SELECT name, real_name, token_version FROM users')).one() == ('Original', '', 0)
    engine.dispose()
