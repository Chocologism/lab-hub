"""Favorites and feedback must be persistent and enforced per authenticated user."""
import pytest
from fastapi.testclient import TestClient
from backend.main import app
from backend.database import SessionLocal
from backend.models import Favorite, IssueFeedback, LibraryPaper, LibraryAccess, ResourceBook

client = TestClient(app)


@pytest.fixture
def accounts():
    result = {}
    for role, email in [('member', 'student@lab.edu'), ('teacher', 'shu@lab.edu'), ('admin', 'admin@lab.edu')]:
        response = client.post('/api/auth/login', json={'email': email, 'password': 'lab123456'})
        assert response.status_code == 200
        data = response.json()
        result[role] = (data['user']['id'], {'Authorization': 'Bearer ' + data['access_token']})
    return result


@pytest.fixture
def items(accounts):
    with SessionLocal() as db:
        public = LibraryPaper(arxiv_id='9912.12345', title='Public favorite', from_seminar=True)
        private = LibraryPaper(arxiv_id='9912.54321', title='Private favorite')
        legacy = LibraryPaper(arxiv_id='astro-ph/9912345', title='Legacy favorite', from_seminar=True)
        book = ResourceBook(title='Favorite textbook', authors='Test author')
        db.add_all([public, private, legacy, book]); db.flush()
        db.add(LibraryAccess(paper_id=private.id, user_id=accounts['member'][0])); db.commit()
        refs = {'public': public.arxiv_id, 'private': private.arxiv_id, 'legacy': legacy.arxiv_id, 'book': str(book.id)}
        paper_ids = [public.id, private.id, legacy.id]
    yield refs
    with SessionLocal() as db:
        db.query(Favorite).filter(Favorite.target.in_(refs.values())).delete(synchronize_session=False)
        db.query(LibraryAccess).filter(LibraryAccess.paper_id.in_(paper_ids)).delete(synchronize_session=False)
        db.query(LibraryPaper).filter(LibraryPaper.id.in_(paper_ids)).delete(synchronize_session=False)
        db.query(ResourceBook).filter(ResourceBook.id == int(refs['book'])).delete()
        db.commit()


def test_favorites_persist_deduplicate_and_isolate(accounts, items):
    headers = accounts['member'][1]
    for path in [f"paper/{items['public']}", f"paper/{items['public']}v2", f"paper/{items['legacy']}", f"book/{items['book']}"]:
        assert client.put('/api/favorites/' + path, headers=headers).status_code == 200
    # A new client sees the same account's saved records; another account cannot.
    rows = TestClient(app).get('/api/favorites', headers=headers).json()
    assert {(r['kind'], r['target']) for r in rows} == {('paper', items['public']), ('paper', items['legacy']), ('book', items['book'])}
    assert any(r['item']['title'] == 'Favorite textbook' for r in rows)
    assert client.get('/api/favorites', headers=accounts['admin'][1]).json() == []
    url = '/api/favorites/paper/' + items['public']
    assert client.delete(url, headers=accounts['teacher'][1]).status_code == 200
    assert len(client.get('/api/favorites', headers=headers).json()) == 3
    for _ in range(2):
        assert client.delete(url, headers=headers).status_code == 200
    assert len(client.get('/api/favorites', headers=headers).json()) == 2


def test_favorite_does_not_grant_private_access(accounts, items):
    url = '/api/favorites/paper/' + items['private']
    for role in ['teacher', 'admin']:
        assert client.put(url, headers=accounts[role][1]).status_code == 404
    headers = accounts['member'][1]
    assert client.put(url, headers=headers).status_code == 200
    with SessionLocal() as db:
        paper = db.query(LibraryPaper).filter_by(arxiv_id=items['private']).one()
        db.query(LibraryAccess).filter_by(paper_id=paper.id).delete(); db.commit()
    assert client.get('/api/favorites', headers=headers).json() == []
    assert client.put(url, headers=headers).status_code == 404
    assert client.delete(url, headers=headers).status_code == 200


def test_deleted_book_disappears_from_favorites(accounts, items):
    headers = accounts['member'][1]
    assert client.put('/api/favorites/book/' + items['book'], headers=headers).status_code == 200
    with SessionLocal() as db:
        db.query(ResourceBook).filter_by(id=int(items['book'])).delete(); db.commit()
    assert client.get('/api/favorites', headers=headers).json() == []


@pytest.mark.parametrize('target', ['0', '-1', 'no-book', '999999999999999999999999999999', '１２３'])
def test_bad_book_targets_return_not_found(accounts, target):
    assert client.put('/api/favorites/book/' + target, headers=accounts['member'][1]).status_code == 404


def test_personal_endpoints_require_login():
    for method, path in [('get', '/api/favorites'), ('put', '/api/favorites/book/1'), ('delete', '/api/favorites/book/1'), ('get', '/api/feedback')]:
        assert getattr(client, method)(path).status_code == 401
    assert client.post('/api/feedback', json={'title': 'Example', 'content': 'Details'}).status_code == 401


def test_feedback_admin_only_and_resolution(accounts):
    title = 'Private feedback permission test'
    try:
        for role in accounts:
            response = client.post('/api/feedback', headers=accounts[role][1], json={'title': title, 'content': 'Only administrators see this', 'page': '/favorites'})
            assert response.status_code == 201
            assert 'content' not in response.json()
        admin_headers = accounts['admin'][1]
        rows = client.get('/api/feedback', headers=admin_headers).json()
        ours = [r for r in rows if r['title'] == title]
        assert len(ours) == 3 and all(r['author'] and not r['resolved'] for r in ours)
        url = f"/api/feedback/{ours[0]['id']}"
        for role in ['member', 'teacher']:
            assert client.get('/api/feedback', headers=accounts[role][1]).status_code == 403
            assert client.patch(url, headers=accounts[role][1], json={'resolved': True}).status_code == 403
        assert client.patch(url, headers=admin_headers, json={'resolved': True}).json() == {'resolved': True}
        assert next(r for r in client.get('/api/feedback', headers=admin_headers).json() if r['id'] == ours[0]['id'])['resolved']
        assert client.patch(url, headers=admin_headers, json={'resolved': False}).json() == {'resolved': False}
    finally:
        with SessionLocal() as db:
            db.query(IssueFeedback).filter_by(title=title).delete(); db.commit()


@pytest.mark.parametrize('body', [
    {'title': '  ', 'content': 'Details'},
    {'title': 'Title', 'content': '  '},
    {'title': 'Title', 'content': 'x' * 5001},
    {'title': 'Title', 'content': 'Details', 'user_id': 1},
])
def test_feedback_rejects_invalid_or_spoofed_input(accounts, body):
    assert client.post('/api/feedback', headers=accounts['member'][1], json=body).status_code == 422
