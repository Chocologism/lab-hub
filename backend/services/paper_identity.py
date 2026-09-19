"""Conservative Crossref → arXiv matching; never merge on fuzzy title alone."""
import re
import xml.etree.ElementTree as ET
import aiohttp
from .arxiv_service import canonical_id, parse_atom
from .paper_service import doi_id

NS = {'a': 'http://www.w3.org/2005/Atom', 'x': 'http://arxiv.org/schemas/atom'}


def normalized(value):
    return ''.join(c for c in value.casefold() if c.isalnum())


def match_feed(content, doi, metadata):
    root = ET.fromstring(content)
    matches = {}
    for entry in root.findall('a:entry', NS):
        candidate_doi = doi_id(entry.findtext('x:doi', '', NS))
        if candidate_doi and candidate_doi != doi:
            continue
        title = entry.findtext('a:title', '', NS)
        authors = [a.findtext('a:name', '', NS) for a in entry.findall('a:author', NS)]
        # Missing DOI is common on preprints: require the full title and first surname.
        first = metadata.get('authors') or []
        same_author = bool(first and authors and normalized(first[0].split()[-1]) == normalized(authors[0].split()[-1]))
        if candidate_doi != doi and not (normalized(title) == normalized(metadata['title']) and same_author):
            continue
        key = canonical_id(entry.findtext('a:id', '', NS))
        if not re.fullmatch(r'(\d{4}\.\d{4,5}|[a-z.-]+/\d{7})', key):
            continue
        feed = ET.Element('{http://www.w3.org/2005/Atom}feed')
        feed.append(entry)
        matches[key] = parse_atom(ET.tostring(feed), key)
    return next(iter(matches.values())) if len(matches) == 1 else None


async def find_arxiv(doi, metadata):
    # The documented API supports title searches; DOI is verified from each Atom entry.
    words = re.findall(r'\w+', metadata['title'], re.UNICODE)
    if not words:
        return None
    query = 'ti:"' + ' '.join(words[:40]) + '"'
    async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=8), trust_env=True) as session:
        async with session.get('https://export.arxiv.org/api/query', params={'search_query': query, 'max_results': 20}) as response:
            if response.status != 200:
                raise ValueError('arXiv 匹配暂时不可用')
            try:
                return match_feed(await response.text(), doi, metadata)
            except ET.ParseError as exc:
                raise ValueError('arXiv 返回内容无法解析') from exc
