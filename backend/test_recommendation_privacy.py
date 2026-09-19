import uuid
import pytest
from fastapi.testclient import TestClient
from backend.main import app
from backend.database import SessionLocal
from backend.services.library_service import backfill

client = TestClient(app)

@pytest.fixture
def people():
    result = []
    for email in ('student@lab.edu', 'shu@lab.edu', 'wang@lab.edu', 'admin@lab.edu'):
        login = client.post('/api/auth/login', json={'email': email, 'password': 'lab123456'}).json()
        result.append((login['user'], {'Authorization': 'Bearer ' + login['access_token']}))
    return result


def payload(**extra):
    return dict(arxiv_id='2609.' + str(int(uuid.uuid4().hex[:8], 16) % 100000).zfill(5), title='Private recommendation test', authors=['Author'], abstract='Abstract', recommend_comment='Private research note', **extra)


def feed_ids(headers, scope='all'):
    response = client.get('/api/arxiv/feed', params={'scope': scope}, headers=headers)
    assert response.status_code == 200
    return {p['id'] for p in response.json()}


def test_direct_recommendation_visibility_and_independent_public_copy(people):
    (a, ah), (b, bh), (c, ch), (_, adminh) = people
    data = payload(visibility='direct', recipient_ids=[b['id']])
    result = client.post('/api/arxiv/recommend', json=data, headers=ah)
    assert result.status_code == 200, result.text
    private = result.json(); paper_id = private['id']
    assert private['visibility'] == 'direct' and private['recipients'] == [{'id': b['id'], 'name': b['name']}]
    assert paper_id in feed_ids(ah, 'sent') and paper_id in feed_ids(bh, 'received')
    for outsider in (ch, adminh):
        for scope in ('all', 'public', 'received', 'sent', 'teacher', 'unread'):
            assert paper_id not in feed_ids(outsider, scope)
        assert client.post(f'/api/arxiv/{paper_id}/read-toggle', headers=outsider).status_code == 404
        assert client.delete(f'/api/arxiv/{paper_id}', headers=outsider).status_code == 404
        assert client.get('/api/library', params={'q': data['arxiv_id']}, headers=outsider).json() == []
    assert paper_id not in feed_ids(ah, 'public')
    assert client.post(f'/api/arxiv/{paper_id}/read-toggle', headers=bh).status_code == 200
    assert client.post('/api/arxiv/recommend', json=data, headers=ah).status_code == 400
    # The public recommendation must not reveal that a private recommendation existed.
    public_data = dict(data, visibility='public', recipient_ids=[], recommend_comment='Public discussion')
    public = client.post('/api/arxiv/recommend', json=public_data, headers=ch)
    assert public.status_code == 200, public.text
    assert public.json()['id'] in feed_ids(ah, 'public')
    assert public.json()['recipients'] == []
    assert paper_id not in feed_ids(ch)
    own_public = client.post('/api/arxiv/recommend', json=public_data, headers=ah)
    assert own_public.status_code == 200
    private_other = client.post('/api/arxiv/recommend', json=dict(data, recipient_ids=[c['id']]), headers=ah)
    assert private_other.status_code == 200
    assert private_other.json()['id'] in feed_ids(ch, 'received')
    assert private_other.json()['id'] not in feed_ids(bh)


def test_private_library_backfill_refresh_and_retention(people, monkeypatch):
    (a, ah), (b, bh), (_, ch), _ = people
    data = payload(visibility='direct', recipient_ids=[b['id']])
    private = client.post('/api/arxiv/recommend', json=data, headers=ah).json()
    with SessionLocal() as db:
        backfill(db); backfill(db)
    for headers in (ah, bh):
        rows = client.get('/api/library', params={'q': data['arxiv_id'], 'source': 'recommendation'}, headers=headers).json()
        assert len(rows) == 1 and rows[0]['from_direct']
    library_id = rows[0]['id']
    assert client.post(f'/api/library/{library_id}/refresh', headers=ch).status_code == 404
    async def metadata(_): return {**data, 'title': 'Updated private metadata'}
    monkeypatch.setattr('backend.routers.library.fetch_arxiv_metadata', metadata)
    assert client.post(f'/api/library/{library_id}/refresh', headers=bh).status_code == 200
    assert client.get('/api/library', params={'q': data['arxiv_id']}, headers=ch).json() == []
    assert client.delete(f"/api/arxiv/{private['id']}", headers=ah).status_code == 200
    assert len(client.get('/api/library', params={'q': data['arxiv_id']}, headers=bh).json()) == 1
    assert client.get('/api/library', params={'q': data['arxiv_id']}, headers=ch).json() == []


def test_direct_recommendations_cannot_leak_through_seminars(people):
    (a, ah), (b, bh), (_, ch), _ = people
    paper = client.post('/api/arxiv/recommend', json=payload(visibility='direct', recipient_ids=[b['id']]), headers=ah).json()
    meeting = dict(date='2026-09-11', time='14:30', presenter_name='Presenter', topic='Public meeting', paper_id=paper['id'])
    for headers in (ah, bh, ch):
        result = client.post('/api/seminars', json=meeting, headers=headers)
        assert result.status_code == 400
    assert all(not (s.get('paper') and s['paper']['id'] == paper['id']) for s in client.get('/api/seminars', headers=ch).json())


def test_audience_validation_and_multi_recipient(people):
    (a, ah), (b, bh), (c, ch), _ = people
    cases = [({'visibility': 'direct', 'recipient_ids': []}, 422),
             ({'visibility': 'public', 'recipient_ids': [b['id']]}, 422),
             ({'visibility': 'direct', 'recipient_ids': [b['id'], b['id']]}, 422),
             ({'visibility': 'direct', 'recipient_ids': [999999]}, 400),
             ({'visibility': 'direct', 'recipient_ids': [a['id']]}, 400),
             ({'visibility': 'direct', 'recipient_ids': ['2']}, 422)]
    for values, status in cases:
        response = client.post('/api/arxiv/recommend', json=payload(**values), headers=ah)
        assert response.status_code == status, response.text
    response = client.post('/api/arxiv/recommend', json=payload(visibility='direct', recipient_ids=[b['id'], c['id']]), headers=ah)
    assert response.status_code == 200
    assert response.json()['id'] in feed_ids(bh, 'received') & feed_ids(ch, 'received')


def change_visibility(paper_id, headers, visibility, recipients=None):
    return client.put(f'/api/arxiv/{paper_id}/visibility', headers=headers,
                      json={'visibility': visibility, 'recipient_ids': recipients or []})


def library_rows(arxiv_id, headers):
    return client.get('/api/library', params={'q': arxiv_id}, headers=headers).json()


def test_edit_public_direct_recipient_change_and_back_again(people):
    (a, ah), (b, bh), (c, ch), _ = people
    data = payload()
    original = client.post('/api/arxiv/recommend', json=data, headers=ah).json()
    paper_id = original['id']
    private = change_visibility(paper_id, ah, 'direct', [b['id']])
    assert private.status_code == 200, private.text
    assert private.json()['recommend_comment'] == original['recommend_comment']
    assert private.json()['created_at'] == original['created_at']
    assert paper_id not in feed_ids(ch) and not library_rows(data['arxiv_id'], ch)
    assert paper_id in feed_ids(bh, 'received')
    assert len(library_rows(data['arxiv_id'], bh)) == 1
    moved = change_visibility(paper_id, ah, 'direct', [c['id']])
    assert moved.status_code == 200
    assert paper_id not in feed_ids(bh) and not library_rows(data['arxiv_id'], bh)
    assert client.post(f'/api/arxiv/{paper_id}/read-toggle', headers=bh).status_code == 404
    assert paper_id in feed_ids(ch, 'received') and library_rows(data['arxiv_id'], ch)
    # Repeating an unchanged save and restarting/backfilling must not revive revoked grants.
    assert change_visibility(paper_id, ah, 'direct', [c['id']]).status_code == 200
    with SessionLocal() as db:
        backfill(db); backfill(db)
    assert not library_rows(data['arxiv_id'], bh)
    public = change_visibility(paper_id, ah, 'public')
    assert public.status_code == 200 and public.json()['recipients'] == []
    assert paper_id in feed_ids(bh, 'public') and library_rows(data['arxiv_id'], bh)


def test_only_sender_edits_and_conflicts_leave_original_unchanged(people):
    (a, ah), (b, bh), (c, ch), (_, adminh) = people
    data = payload()
    public = client.post('/api/arxiv/recommend', json=data, headers=ah).json()
    for headers in (bh, adminh):
        assert change_visibility(public['id'], headers, 'direct', [c['id']]).status_code == 403
    assert change_visibility(public['id'], ah, 'direct').status_code == 422
    assert change_visibility(public['id'], ah, 'direct', [999999]).status_code == 400
    other = client.post('/api/arxiv/recommend', json=dict(data, visibility='direct', recipient_ids=[b['id']]), headers=ah).json()
    assert change_visibility(public['id'], ah, 'direct', [b['id']]).status_code == 400
    assert public['id'] in feed_ids(ch, 'public')
    assert change_visibility(other['id'], ch, 'public').status_code == 404


def test_visibility_edit_preserves_other_public_and_private_sources(people):
    (a, ah), (b, bh), (c, ch), (_, adminh) = people
    data = payload()
    own = client.post('/api/arxiv/recommend', json=data, headers=ah).json()
    separate = client.post('/api/arxiv/recommend', json=data, headers=ch).json()
    assert change_visibility(own['id'], ah, 'direct', [b['id']]).status_code == 200
    assert library_rows(data['arxiv_id'], adminh)
    assert separate['id'] in feed_ids(adminh, 'public') and own['id'] not in feed_ids(adminh)
    # The independent public archive remains after its recommendation is deleted.
    client.delete(f"/api/arxiv/{separate['id']}", headers=ch)
    assert change_visibility(own['id'], ah, 'direct', [c['id']]).status_code == 200
    assert library_rows(data['arxiv_id'], adminh)
    assert own['id'] not in feed_ids(bh)


def test_visibility_edit_preserves_retained_direct_archive(people):
    (a, ah), (b, bh), (c, ch), _ = people
    data = payload(visibility='direct', recipient_ids=[b['id']])
    retained = client.post('/api/arxiv/recommend', json=data, headers=ch).json()
    client.delete(f"/api/arxiv/{retained['id']}", headers=ch)
    own = client.post('/api/arxiv/recommend', json=data, headers=ah).json()
    assert change_visibility(own['id'], ah, 'direct', [c['id']]).status_code == 200
    assert own['id'] not in feed_ids(bh)
    assert library_rows(data['arxiv_id'], bh), 'Keep access acquired from an independent archived recommendation'


def test_shared_seminar_does_not_expose_restricted_recommendation(people):
    (a, ah), (b, bh), (c, ch), _ = people
    data = payload()
    paper = client.post('/api/arxiv/recommend', json=data, headers=ah).json()
    seminar = client.post('/api/seminars', headers=ah, json={
        'date': '2026-09-11', 'time': '14:30', 'presenter_name': 'A', 'topic': 'Shared talk', 'paper_id': paper['id']}).json()
    assert change_visibility(paper['id'], ah, 'direct', [b['id']]).status_code == 200
    result = next(s for s in client.get('/api/seminars', headers=ch).json() if s['id'] == seminar['id'])
    assert result['paper'] is None and result['paper_id'] is None
    assert library_rows(data['arxiv_id'], ch)[0]['from_seminar']
