"""Journal metadata via Crossref; publisher URLs are stored, never fetched blindly."""
import hashlib
import html
import re
from urllib.parse import unquote, urlsplit, quote
import aiohttp


def doi_id(value):
    match = re.search(r'10\.\d{4,9}/[^\s?#]+', unquote(value or ''), re.I)
    return match.group(0).lower() if match else None


def http_url(value):
    if not value:
        return ''
    parts = urlsplit(value)
    if parts.scheme not in ('http', 'https') or not parts.hostname or parts.username or parts.password or any(c.isspace() for c in value):
        raise ValueError('请输入有效的 HTTP(S) 论文链接')
    return value


def paper_key(identifier, source_url=''):
    from .arxiv_service import canonical_id, extract_arxiv_id
    if not identifier.startswith(('doi:', 'url:')) and not doi_id(identifier) and extract_arxiv_id(identifier):
        return canonical_id(identifier)
    doi = doi_id(identifier) or doi_id(source_url)
    if doi:
        return 'doi:' + doi
    if identifier.startswith('url:') and source_url:
        return 'url:' + hashlib.sha256(http_url(source_url).encode()).hexdigest()
    if extract_arxiv_id(identifier):
        return canonical_id(identifier)
    if source_url:
        return 'url:' + hashlib.sha256(http_url(source_url).encode()).hexdigest()
    raise ValueError('请输入 arXiv 编号、DOI 或期刊论文链接')


def source_link(key):
    if key.startswith('doi:'):
        return 'https://doi.org/' + key[4:]
    return '' if key.startswith('url:') else 'https://arxiv.org/abs/' + key


def clean(value):
    return html.unescape(re.sub(r'<[^>]+>', '', value or '')).strip()


async def fetch_journal_metadata(value):
    doi = doi_id(value)
    if not doi:
        raise ValueError('此链接未包含 DOI，请复制论文 DOI，或使用手动录入')
    try:
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=18)) as session:
            async with session.get('https://api.crossref.org/works/' + quote(doi, safe=''), allow_redirects=False) as response:
                if response.status != 200:
                    raise ValueError('Crossref 暂无可用记录，请使用手动录入')
                data = (await response.json())['message']
    except (aiohttp.ClientError, TimeoutError, KeyError) as exc:
        raise ValueError('期刊元数据暂时无法读取，请稍后重试或手动录入') from exc
    if (data.get('DOI') or '').lower() != doi or not data.get('title'):
        raise ValueError('期刊记录不完整，请使用手动录入')
    date = data.get('published', {}).get('date-parts', [[]])[0]
    result = dict(arxiv_id='doi:' + doi, title=clean(data['title'][0]),
                authors=[clean(' '.join(filter(None, [a.get('given'), a.get('family')]))) or clean(a.get('name')) for a in data.get('author', [])],
                abstract=clean(data.get('abstract')), journal=clean((data.get('container-title') or [''])[0]),
                source_url='https://doi.org/' + doi, pdf_url=None,
                published_date='-'.join(str(part).zfill(4 if i == 0 else 2) for i, part in enumerate(date)))
    from .paper_identity import find_arxiv
    try:
        matched = await find_arxiv(doi, result)
    except (aiohttp.ClientError, TimeoutError, ValueError):
        matched = None
    if matched:
        result.update(matched)
        result['source_url'] = 'https://doi.org/' + doi
        result['journal'] = clean((data.get('container-title') or [''])[0]) or result.get('journal', '')
    elif not result.get('abstract'):
        try:
            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=8)) as session:
                async with session.get(f'https://api.semanticscholar.org/graph/v1/paper/DOI:{quote(doi, safe="")}', params={'fields': 'abstract'}) as s2_res:
                    if s2_res.status == 200:
                        s2_data = await s2_res.json()
                        if s2_data and s2_data.get('abstract'):
                            result['abstract'] = clean(s2_data['abstract'])
        except Exception:
            pass
    return result
