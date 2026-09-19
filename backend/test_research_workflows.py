import asyncio
from datetime import date
from email.message import EmailMessage
import pytest
from fastapi.testclient import TestClient
from backend.main import app
from backend.database import SessionLocal
from backend.models import LibraryPaper
from backend.services.arxiv_service import extract_arxiv_id, canonical_id, parse_html, parse_atom, fetch_arxiv_metadata
from backend.services.email_service import parse_mail
from backend.services.library_service import backfill

client = TestClient(app)

@pytest.fixture
def headers():
    token = client.post('/api/auth/login', json={'email': 'student@lab.edu', 'password': 'lab123456'}).json()['access_token']
    return {'Authorization': f'Bearer {token}'}

@pytest.mark.parametrize('raw', ['arXiv:2609.04305', '2609.04305', 'https://arxiv.org/abs/2609.04305', 'https://arxiv.org/pdf/2609.04305.pdf'])
def test_arxiv_inputs(raw):
    assert extract_arxiv_id(raw) == '2609.04305'
    assert canonical_id('2609.04305v2') == '2609.04305'


def test_official_parsers():
    html = '<meta name="citation_title" content="Error bounds &amp; cosmology"><meta name="citation_author" content="A"><meta name="citation_arxiv_id" content="2609.04305"><meta name="citation_abstract" content="Full abstract">'
    assert parse_html(html, '2609.04305')['title'] == 'Error bounds & cosmology'
    with pytest.raises(ValueError): parse_html(html, '2609.04306')
    atom = '<feed xmlns="http://www.w3.org/2005/Atom"><entry><id>https://arxiv.org/abs/2609.04305v1</id><title>Error Bounds in Cosmology</title><author><name>A</name></author><summary>Abstract</summary></entry></feed>'
    assert parse_atom(atom, '2609.04305')['title'] == 'Error Bounds in Cosmology'


def test_timeout_falls_back_and_errors_not_blank(monkeypatch):
    import backend.services.arxiv_service as service
    html = '<meta name="citation_title" content="Fallback"><meta name="citation_author" content="A"><meta name="citation_arxiv_id" content="2609.04305">'
    class Response:
        status = 200
        def __init__(self, url): self.url = url
        async def __aenter__(self):
            if 'export' in self.url: raise asyncio.TimeoutError()
            return self
        async def __aexit__(self, *args): pass
        async def text(self): return html
    class Session:
        def __init__(self, **kwargs): assert kwargs['trust_env']
        async def __aenter__(self): return self
        async def __aexit__(self, *args): pass
        def get(self, url): return Response(url)
    monkeypatch.setattr(service.aiohttp, 'ClientSession', Session)
    assert asyncio.run(fetch_arxiv_metadata('2609.04305'))['title'] == 'Fallback'
    async def fail(self): raise asyncio.TimeoutError()
    monkeypatch.setattr(Response, '__aenter__', fail)
    with pytest.raises(ValueError, match='超时'): asyncio.run(fetch_arxiv_metadata('2609.04305'))


def test_seminar_library_archive_and_retention(headers, monkeypatch):
    async def metadata(arxiv_id):
        return dict(arxiv_id=arxiv_id, title='Shared cosmological research', authors=['Researcher'], abstract='Dark matter test')
    monkeypatch.setattr('backend.services.library_service.fetch_arxiv_metadata', metadata)
    data = dict(date='2026-09-11', time='14:30', presenter_name='主讲', topic='工作汇报', presentations=[
        dict(presenter_name='同学甲', arxiv_id='arXiv:2609.04305v2', slides_url='https://example.com/one.pdf'),
        dict(presenter_name='同学乙', arxiv_id='https://arxiv.org/abs/2609.04305')])
    created = client.post('/api/seminars', headers=headers, json=data)
    assert created.status_code == 200, created.text
    seminar = created.json()
    assert len(seminar['presentations']) == 2
    result = client.get('/api/library?q=cosmological%20research&source=seminar', headers=headers).json()
    matching = [p for p in result if p['arxiv_id'] == '2609.04305']
    assert len(matching) == 1 and matching[0]['from_seminar']
    recommendation = client.post('/api/arxiv/recommend', headers=headers, json=dict(arxiv_id='2609.04305v3', title='Shared cosmological research', authors=['Researcher'], abstract='Dark matter test'))
    assert recommendation.status_code == 200
    result = client.get('/api/library?q=2609.04305', headers=headers).json()
    assert len(result) == 1 and result[0]['from_recommendation']
    updated = client.put(f"/api/seminars/{seminar['id']}", headers=headers, json={'presentations': []})
    assert updated.status_code == 200 and updated.json()['presentations'] == []
    client.delete(f"/api/seminars/{seminar['id']}", headers=headers)
    client.delete(f"/api/arxiv/{recommendation.json()['id']}", headers=headers)
    assert len(client.get('/api/library?q=2609.04305', headers=headers).json()) == 1


def test_pending_metadata_does_not_lose_meeting(headers, monkeypatch):
    async def fail(_): raise ValueError('连接超时')
    monkeypatch.setattr('backend.services.library_service.fetch_arxiv_metadata', fail)
    response = client.post('/api/seminars', headers=headers, json=dict(date='2026-09-18', time='14:30', presenter_name='主讲', topic='工作汇报', presentations=[dict(presenter_name='分享人', arxiv_id='2609.99999')]))
    assert response.status_code == 200, response.text
    assert client.get('/api/library?q=2609.99999', headers=headers).json()[0]['metadata_status'] == 'pending'


def test_existing_linked_paper_response_and_backfill(headers):
    paper = client.get('/api/arxiv/feed', headers=headers).json()[0]
    response = client.post('/api/seminars', headers=headers, json=dict(date='2026-09-18', time='14:30', presenter_name='A', topic='Linked', paper_id=paper['id']))
    assert response.status_code == 200, response.text
    assert response.json()['paper']['authors'] == paper['authors']
    with SessionLocal() as db:
        backfill(db); count = db.query(LibraryPaper).count(); backfill(db)
        assert db.query(LibraryPaper).count() == count


def test_mail_dates_and_missing_fields():
    parsed, _ = parse_mail('报告题目：星系演化\n报告时间：2026年9月8日 下午2:30\n报告人：张老师\n地点：报告厅'.encode())
    assert (parsed['title'], parsed['date'], parsed['time'], parsed['speaker']) == ('星系演化', '2026-09-08', '14:30', '张老师')
    incomplete, _ = parse_mail(b'Title: Galaxy formation')
    assert not incomplete['date'] and not incomplete['time'] and len(incomplete['warnings']) >= 2
    multiple, _ = parse_mail('时间：2026-09-08 和 2026-09-09 14:30'.encode())
    assert multiple['date'] == ''
    english, _ = parse_mail(b'Title: Galaxies\nDate: September 8, 2026 2:30 PM')
    assert english['date'] == '2026-09-08' and english['time'] == '14:30'
    forum_mail = (
        '紫台青促会第181期青年论坛 时间2026年9月18日 上午10:30 地点5-516会议室\n'
        '各位老师、同学：\n'
        '紫台青年论坛第181期将于2026年9月18日（周五）上午 10：30 在紫台 5-516 会议室举办，'
        '本次邀请到中国科学院国家天文台的陈云博士，做题为《Probing Dynamical Dark Energy: Evidence & Tensions》的报告。'
    )
    forum_parsed, _ = parse_mail(forum_mail.encode())
    assert forum_parsed['title'] == 'Probing Dynamical Dark Energy: Evidence & Tensions'
    assert forum_parsed['date'] == '2026-09-18' and forum_parsed['time'] == '10:30'
    assert forum_parsed['speaker'] == '陈云 博士'
    assert forum_parsed['location'] == '紫台 5-516 会议室'


def test_eml_inline_poster_upload_and_talk_permissions(headers):
    mail = EmailMessage()
    mail['Subject'] = '台内学术报告'
    mail['Date'] = 'Mon, 07 Sep 2026 10:00:00 +0800'
    mail.set_content('报告题目：引力波探测\n时间：明天 10:30\n报告人：陈老师\n地点：会议室')
    mail.add_alternative('<p>报告题目：引力波探测</p><img src="cid:poster">', subtype='html')
    mail.get_payload()[1].add_related(b'\x89PNG\r\n\x1a\nposter', maintype='image', subtype='png', cid='<poster>', filename='poster.png')
    response = client.post('/api/talks/parse-email', headers=headers, files={'file': ('notice.eml', mail.as_bytes(), 'message/rfc822')})
    assert response.status_code == 200, response.text
    preview = response.json()
    assert preview['date'] == '2026-09-08' and preview['time'] == '10:30'
    assert preview['poster_url'].startswith('/api/files/')
    assert client.get(preview['poster_url']).status_code == 401
    image = client.get(preview['poster_url'], headers=headers)
    assert image.status_code == 200 and image.headers['content-type'] == 'image/png'
    saved = client.post('/api/talks', headers=headers, json=preview)
    assert saved.status_code == 200, saved.text
    talk = saved.json()
    other_token = client.post('/api/auth/login', json={'email': 'shu@lab.edu', 'password': 'lab123456'}).json()['access_token']
    assert client.delete(f"/api/talks/{talk['id']}", headers={'Authorization': f'Bearer {other_token}'}).status_code == 403
    assert client.delete(f"/api/talks/{talk['id']}", headers=headers).status_code == 200


@pytest.mark.parametrize('change', [{'date': '2026-02-30'}, {'time': '25:00'}, {'poster_url': 'javascript:alert(1)'}])
def test_talk_validation(headers, change):
    data = dict(title='Report', date='2026-09-08', time='10:00') | change
    assert client.post('/api/talks', headers=headers, json=data).status_code == 422


def test_invalid_seminar_reference_is_atomic(headers):
    before = len(client.get('/api/seminars', headers=headers).json())
    result = client.post('/api/seminars', headers=headers, json=dict(date='2026-09-08', time='10:00', presenter_name='A', topic='Invalid', paper_id=999999))
    assert result.status_code == 400
    assert len(client.get('/api/seminars', headers=headers).json()) == before
