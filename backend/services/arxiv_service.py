import asyncio
import re
import xml.etree.ElementTree as ET
from html.parser import HTMLParser
from urllib.parse import unquote

import aiohttp

ARXIV_REGEX = re.compile(r"(?<![\w.])(\d{4}\.\d{4,5}(?:v\d+)?|[a-zA-Z\-]+(?:\.[a-zA-Z]{2})?/\d{7}(?:v\d+)?)(?![\w])", re.I)


def extract_arxiv_id(raw_input):
    match = ARXIV_REGEX.search(unquote(raw_input or '').strip().removesuffix('.pdf'))
    return match.group(1) if match else None


def canonical_id(value):
    if value.strip().lower().startswith(('doi:', 'url:')):
        return value.strip().lower()
    return re.sub(r'v\d+$', '', extract_arxiv_id(value) or value.strip(), flags=re.I).lower()


def clean(value):
    return re.sub(r'\s+', ' ', value or '').strip()


def parse_atom(content, arxiv_id):
    ns = {'a': 'http://www.w3.org/2005/Atom', 'x': 'http://arxiv.org/schemas/atom'}
    entry = ET.fromstring(content).find('a:entry', ns)
    if entry is None or '/api/errors' in entry.findtext('a:id', '', ns):
        raise ValueError('官方接口尚未收录该编号，请核对编号或稍后重试')
    title = clean(entry.findtext('a:title', '', ns))
    authors = [clean(a.findtext('a:name', '', ns)) for a in entry.findall('a:author', ns)]
    if not title or not authors:
        raise ValueError('官方接口返回的文献信息不完整')
    category = entry.find('x:primary_category', ns)
    return dict(arxiv_id=arxiv_id, title=title, authors=authors,
                abstract=clean(entry.findtext('a:summary', '', ns)),
                published_date=entry.findtext('a:published', '', ns)[:10],
                primary_category=category.get('term', '') if category is not None else '',
                pdf_url=f'https://arxiv.org/pdf/{arxiv_id}',
                source_url=('https://doi.org/' + clean(entry.findtext('x:doi', '', ns))) if entry.findtext('x:doi', '', ns) else '',
                journal=clean(entry.findtext('x:journal_ref', '', ns)))


class CitationParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.meta = {}

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'meta' and attrs.get('name', '').startswith('citation_'):
            self.meta.setdefault(attrs['name'], []).append(attrs.get('content', ''))


def parse_html(content, arxiv_id):
    parser = CitationParser()
    parser.feed(content)
    meta = parser.meta
    first = lambda key: clean(meta.get('citation_' + key, [''])[0])
    if not first('title') or not meta.get('citation_author') or canonical_id(first('arxiv_id')) != canonical_id(arxiv_id):
        raise ValueError('官方摘要页未返回匹配的文献，请核对编号或稍后重试')
    return dict(arxiv_id=arxiv_id, title=first('title'), authors=meta['citation_author'],
                abstract=first('abstract'), published_date=first('date').replace('/', '-'),
                primary_category='', pdf_url=f'https://arxiv.org/pdf/{arxiv_id}',
                source_url='https://doi.org/' + first('doi') if first('doi') else '')


async def fetch_arxiv_metadata(arxiv_id):
    """Use two official sources within a bounded timeout; honor deployment proxies."""
    arxiv_id = extract_arxiv_id(arxiv_id)
    if not arxiv_id:
        raise ValueError('未识别到有效的 arXiv 编号')
    errors = []
    timeout = aiohttp.ClientTimeout(total=9, connect=4)
    async with aiohttp.ClientSession(timeout=timeout, trust_env=True,
            headers={'User-Agent': 'Lab-Hub/1.1 (academic literature sharing)'}) as session:
        for url, parser in [(f'https://export.arxiv.org/api/query?id_list={arxiv_id}', parse_atom),
                            (f'https://arxiv.org/abs/{arxiv_id}', parse_html)]:
            try:
                async with session.get(url) as response:
                    if response.status != 200:
                        raise ValueError(f'HTTP {response.status}')
                    return parser(await response.text(), arxiv_id)
            except asyncio.TimeoutError:
                errors.append('连接 arXiv 超时')
            except aiohttp.ClientError:
                errors.append('无法连接 arXiv，请检查服务器网络或代理配置')
            except (ValueError, ET.ParseError) as exc:
                errors.append(str(exc))
    raise ValueError('；'.join(dict.fromkeys(errors)))
