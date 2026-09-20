import { D1Database } from '@cloudflare/workers-types';

export function extractArxivId(input: string): string | null {
  if (!input) return null;
  const clean = input.trim();
  const match = clean.match(/(\d{4}\.\d{4,5}(?:v\d+)?)/);
  if (match) return match[1];
  const oldMatch = clean.match(/([a-zA-Z\-]+(?:\.[a-zA-Z]+)?\/\d{7})/);
  if (oldMatch) return oldMatch[1];
  return null;
}

export function extractDoi(input: string): string | null {
  if (!input) return null;
  const match = input.match(/(10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+)/);
  return match ? match[1].replace(/[.,;)]+$/, '') : null;
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x2F;/g, '/');
}

export function parseArxivAbsHtml(html: string, arxivId: string) {
  let title = '';
  const h1Match = html.match(/<h1[^>]*class="[^"]*title[^"]*"[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1Match) {
    title = h1Match[1]
      .replace(/<span[^>]*class="descriptor"[^>]*>[\s\S]*?<\/span>/i, '')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  } else {
    const metaTitle = html.match(/<meta\s+name="citation_title"\s+content="([^"]*)"/i)
      || html.match(/<meta\s+property="og:title"\s+content="([^"]*)"/i);
    if (metaTitle) title = metaTitle[1].replace(/\s+/g, ' ').trim();
  }
  title = decodeHtmlEntities(title);

  let authors: string[] = [];
  const authorsDivMatch = html.match(/<div[^>]*class="authors"[^>]*>([\s\S]*?)<\/div>/i);
  if (authorsDivMatch) {
    const aMatches = Array.from(authorsDivMatch[1].matchAll(/<a[^>]*>([\s\S]*?)<\/a>/gi));
    authors = aMatches.map(m => decodeHtmlEntities(m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim())).filter(Boolean);
  }
  if (authors.length === 0) {
    const metaAuthors = Array.from(html.matchAll(/<meta\s+name="citation_author"\s+content="([^"]*)"/gi));
    authors = metaAuthors.map(m => {
      const raw = decodeHtmlEntities(m[1].trim());
      if (raw.includes(',')) {
        const [last, first] = raw.split(',').map(s => s.trim());
        return first ? `${first} ${last}` : last;
      }
      return raw;
    }).filter(Boolean);
  }

  let abstract = '';
  const blockquoteMatch = html.match(/<blockquote[^>]*class="[^"]*abstract[^"]*"[^>]*>([\s\S]*?)<\/blockquote>/i);
  if (blockquoteMatch) {
    abstract = blockquoteMatch[1]
      .replace(/<span[^>]*class="descriptor"[^>]*>[\s\S]*?<\/span>/i, '')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  } else {
    const metaAbs = html.match(/<meta\s+name="citation_abstract"\s+content="([^"]*)"/i)
      || html.match(/<meta\s+property="og:description"\s+content="([^"]*)"/i);
    if (metaAbs) {
      abstract = metaAbs[1].replace(/\s+/g, ' ').trim();
    }
  }
  abstract = decodeHtmlEntities(abstract).replace(/^Abstract:\s*/i, '').trim();

  let published = '';
  const dateMatch = html.match(/<meta\s+name="citation_date"\s+content="([^"]*)"/i)
    || html.match(/<meta\s+name="citation_online_date"\s+content="([^"]*)"/i);
  if (dateMatch) {
    published = dateMatch[1].replace(/\//g, '-').slice(0, 10);
  }

  let primaryCategory = 'astro-ph';
  const catMatch = html.match(/<span[^>]*class="primary-subject"[^>]*>[\s\S]*?\(([^)]+)\)<\/span>/i)
    || html.match(/<td[^>]*class="tablecell subjects"[^>]*>[\s\S]*?\(([^)]+)\)/i);
  if (catMatch) {
    primaryCategory = catMatch[1].trim();
  }

  return {
    arxiv_id: arxivId,
    title: title || `arXiv:${arxivId}`,
    authors,
    abstract,
    published_date: published,
    primary_category: primaryCategory,
    pdf_url: `https://arxiv.org/pdf/${arxivId}.pdf`,
    source_url: `https://arxiv.org/abs/${arxivId}`,
    journal: ''
  };
}

export async function fetchArxivMetadata(arxivId: string) {
  const cleanId = arxivId.replace(/v\d+$/, '');

  // 1. 优先尝试从 arXiv.org 页面直接解析元数据（经全球 CDN 加速，响应极快，无 export.arxiv.org API 的 429 限流问题）
  try {
    const absUrl = cleanId.includes('/') ? `https://arxiv.org/abs/${cleanId}` : `https://arxiv.org/abs/${encodeURIComponent(cleanId)}`;
    const res = await fetch(absUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 (LabOrbit/1.0)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });
    if (res.ok) {
      const html = await res.text();
      const meta = parseArxivAbsHtml(html, arxivId);
      if (meta && meta.title && meta.title !== `arXiv:${arxivId}` && meta.authors.length > 0) {
        return meta;
      }
    }
  } catch (err) {
    console.warn(`Direct arXiv abs HTML fetch failed for ${cleanId}, falling back to API:`, err);
  }

  // 2. 回退机制：从 export.arxiv.org API 查询
  const url = `https://export.arxiv.org/api/query?id_list=${encodeURIComponent(cleanId)}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'LabOrbit/1.0 (mailto:admin@lab.edu)' } });
  if (!res.ok) throw new Error(`arXiv API 返回 HTTP ${res.status}`);
  const text = await res.text();

  const titleMatch = text.match(/<title>([\s\S]*?)<\/title>/g);
  const title = titleMatch && titleMatch[1] ? decodeHtmlEntities(titleMatch[1].replace(/<\/?title>/g, '').replace(/\s+/g, ' ').trim()) : `arXiv:${arxivId}`;

  const summaryMatch = text.match(/<summary>([\s\S]*?)<\/summary>/);
  const abstract = summaryMatch ? decodeHtmlEntities(summaryMatch[1].replace(/\s+/g, ' ').trim()) : '';

  const publishedMatch = text.match(/<published>([\s\S]*?)<\/published>/);
  const publishedDate = publishedMatch ? publishedMatch[1].slice(0, 10) : '';

  const categoryMatch = text.match(/<arxiv:primary_category[\s\S]*?term="([^"]+)"/);
  const primaryCategory = categoryMatch ? categoryMatch[1].trim() : '';

  const authorMatches = Array.from(text.matchAll(/<author>\s*<name>([\s\S]*?)<\/name>/g));
  const authors = authorMatches.map(m => decodeHtmlEntities(m[1].trim()));

  return {
    arxiv_id: arxivId,
    title,
    authors,
    abstract,
    published_date: publishedDate,
    primary_category: primaryCategory,
    pdf_url: `https://arxiv.org/pdf/${arxivId}.pdf`,
    source_url: `https://arxiv.org/abs/${arxivId}`,
    journal: ''
  };
}

export async function fetchDoiMetadata(doi: string) {
  const cleanDoi = doi.trim();

  // 1. 优先尝试从 arXiv 官方 API 通过 search_query=doi:"..." 精准查询
  // 若匹配到对应 arXiv 预印本，则能直接获得标准 arXiv 编号、摘要、主分类及免翻墙的 open-access PDF 链接
  try {
    const arxivUrl = `https://export.arxiv.org/api/query?search_query=doi:${encodeURIComponent(cleanDoi)}&max_results=1`;
    const res = await fetch(arxivUrl, { headers: { 'User-Agent': 'LabOrbit/1.0 (mailto:admin@lab.edu)' } });
    if (res.ok) {
      const text = await res.text();
      const entryMatch = text.match(/<entry>[\s\S]*?<\/entry>/);
      if (entryMatch) {
        const entryXml = entryMatch[0];
        const idMatch = entryXml.match(/<id>[\s\S]*?(?:abs\/|arxiv\.org\/abs\/)?([0-9]{4}\.[0-9]{4,5}|[a-zA-Z.-]+(?:\.[a-zA-Z]+)?\/\d{7})(?:v\d+)?<\/id>/);
        if (idMatch) {
          const matchedArxivId = idMatch[1];
          const titleMatch = entryXml.match(/<title>([\s\S]*?)<\/title>/);
          const summaryMatch = entryXml.match(/<summary>([\s\S]*?)<\/summary>/);
          const publishedMatch = entryXml.match(/<published>([\s\S]*?)<\/published>/);
          const categoryMatch = entryXml.match(/<arxiv:primary_category[\s\S]*?term="([^"]+)"/);
          const authorMatches = Array.from(entryXml.matchAll(/<author>\s*<name>([\s\S]*?)<\/name>/g));
          const authors = authorMatches.map(m => decodeHtmlEntities(m[1].trim()));

          const title = titleMatch ? decodeHtmlEntities(titleMatch[1].replace(/\s+/g, ' ').trim()) : '';
          const abstract = summaryMatch ? decodeHtmlEntities(summaryMatch[1].replace(/\s+/g, ' ').trim()) : '';
          const published = publishedMatch ? publishedMatch[1].slice(0, 10) : '';
          const primaryCategory = categoryMatch ? categoryMatch[1].trim() : '';

          if (abstract && title) {
            let journal = '';
            try {
              const crossrefRes = await fetch(`https://api.crossref.org/works/${encodeURIComponent(cleanDoi)}`, {
                headers: { 'User-Agent': 'LabOrbit/1.0 (mailto:admin@lab.edu)' }
              });
              if (crossrefRes.ok) {
                const crData: any = await crossrefRes.json();
                const crMsg = crData.message || {};
                journal = Array.isArray(crMsg['container-title']) ? crMsg['container-title'][0] : (crMsg['container-title'] || '');
              }
            } catch (e) {}

            return {
              arxiv_id: matchedArxivId,
              title,
              authors,
              abstract,
              published_date: published,
              primary_category: primaryCategory,
              pdf_url: `https://arxiv.org/pdf/${matchedArxivId}.pdf`,
              source_url: `https://doi.org/${cleanDoi}`,
              journal
            };
          }
        }
      }
    }
  } catch (err) {
    console.warn('Querying arXiv by DOI failed, falling back to Crossref / Semantic Scholar:', err);
  }

  // 2. 回退机制：从 Crossref 抓取基础元数据
  const url = `https://api.crossref.org/works/${encodeURIComponent(cleanDoi)}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'LabOrbit/1.0 (mailto:admin@lab.edu)' } });
  if (!res.ok) throw new Error(`Crossref API 返回 HTTP ${res.status}`);
  const data: any = await res.json();
  const msg = data.message || {};

  const title = Array.isArray(msg.title) ? msg.title[0] : (msg.title || cleanDoi);
  const authors = (msg.author || []).map((a: any) => `${a.given || ''} ${a.family || ''}`.trim()).filter(Boolean);
  const journal = Array.isArray(msg['container-title']) ? msg['container-title'][0] : (msg['container-title'] || '');
  const publishedDate = msg.published?.['date-parts']?.[0]?.join('-') || '';
  let abstract = (msg.abstract || '').replace(/<[^>]+>/g, '').trim();

  // 3. 若 Crossref 缺失摘要，从 Semantic Scholar 补全
  if (!abstract) {
    try {
      const s2Res = await fetch(`https://api.semanticscholar.org/graph/v1/paper/DOI:${encodeURIComponent(cleanDoi)}?fields=title,abstract,authors,year,journal,openAccessPdf`, {
        headers: { 'User-Agent': 'LabOrbit/1.0' }
      });
      if (s2Res.ok) {
        const s2Data: any = await s2Res.json();
        if (s2Data?.abstract) {
          abstract = s2Data.abstract.trim();
        }
      }
    } catch (e) {
      console.warn('Semantic Scholar abstract fallback failed:', e);
    }
  }

  return {
    arxiv_id: `doi:${cleanDoi}`,
    title: decodeHtmlEntities(title),
    authors,
    abstract: decodeHtmlEntities(abstract),
    published_date: publishedDate,
    primary_category: '',
    pdf_url: msg.link?.[0]?.URL || '',
    source_url: `https://doi.org/${cleanDoi}`,
    journal
  };
}

/**
 * 解析并关联或创建组会关联文献：
 * 1. 优先检测输入是否为有效 arXiv 编号或 DOI；
 * 2. 避免与已有文献重复：先检索库中已有记录，若已存在直接复用并将 library_papers.from_seminar 标记为 1；
 * 3. 若不存在，抓取元数据并自动同步归档到文献库 (library_papers) 与 arxiv_papers；
 * 4. 若为纯文本，优先精准匹配已有标题，未匹配则创建轻量文献记录入库。
 */
export async function resolveOrCreateSeminarPaper(
  db: D1Database,
  input: string | number | null | undefined,
  userId: number,
  presenterName: string
): Promise<number | null> {
  if (input === null || input === undefined) return null;
  const inputStr = String(input).trim();
  if (!inputStr || inputStr === 'null' || inputStr === 'undefined') return null;

  // 1. 如果传入的是已存在的纯数字 paper_id
  if (/^\d+$/.test(inputStr)) {
    const existing = await db.prepare('SELECT id, arxiv_id FROM arxiv_papers WHERE id = ?').bind(parseInt(inputStr, 10)).first<{ id: number; arxiv_id: string }>();
    if (existing) {
      await db.prepare('UPDATE library_papers SET from_seminar = 1 WHERE arxiv_id = ?').bind(existing.arxiv_id).run();
      return existing.id;
    }
  }

  // 2. 检测是否包含有效 arXiv 编号
  const arxivId = extractArxivId(inputStr);
  if (arxivId) {
    const cleanId = arxivId.replace(/v\d+$/, '');
    // 查重：避免重复添加已有文献
    const existingPaper = await db.prepare(
      'SELECT id, arxiv_id FROM arxiv_papers WHERE arxiv_id = ? OR arxiv_id = ? OR arxiv_id = ? LIMIT 1'
    ).bind(cleanId, arxivId, `arXiv:${cleanId}`).first<{ id: number; arxiv_id: string }>();

    const existingLib = await db.prepare(
      'SELECT id, arxiv_id, title, authors, abstract, primary_category, published_date, pdf_url, journal, source_url FROM library_papers WHERE arxiv_id = ? OR arxiv_id = ? LIMIT 1'
    ).bind(cleanId, arxivId).first<any>();

    if (existingPaper) {
      if (existingLib) {
        await db.prepare('UPDATE library_papers SET from_seminar = 1 WHERE id = ?').bind(existingLib.id).run();
      } else {
        await db.prepare(
          `INSERT OR IGNORE INTO library_papers 
           (arxiv_id, title, authors, abstract, primary_category, published_date, pdf_url, metadata_status, from_recommendation, from_seminar, journal, source_url, created_at)
           SELECT arxiv_id, title, authors, abstract, primary_category, published_date, pdf_url, 'ready', 0, 1, journal, source_url, datetime('now')
           FROM arxiv_papers WHERE id = ?`
        ).bind(existingPaper.id).run();
      }
      return existingPaper.id;
    }

    if (existingLib) {
      const insRes = await db.prepare(
        `INSERT INTO arxiv_papers 
         (arxiv_id, title, journal, source_url, authors, abstract, primary_category, published_date, pdf_url, recommended_by_id, recommend_comment, is_pinned, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '组会关联文献', 0, datetime('now'))`
      ).bind(
        existingLib.arxiv_id,
        existingLib.title,
        existingLib.journal || '',
        existingLib.source_url || `https://arxiv.org/abs/${existingLib.arxiv_id}`,
        existingLib.authors || '[]',
        existingLib.abstract || '',
        existingLib.primary_category || '',
        existingLib.published_date || '',
        existingLib.pdf_url || '',
        userId
      ).run();
      await db.prepare('UPDATE library_papers SET from_seminar = 1 WHERE id = ?').bind(existingLib.id).run();
      return insRes.meta.last_row_id as number;
    }

    // 两库均无，抓取元数据入库
    let meta;
    try {
      meta = await fetchArxivMetadata(cleanId);
    } catch {
      meta = {
        arxiv_id: cleanId,
        title: `arXiv:${cleanId}`,
        authors: [presenterName || '未知作者'],
        abstract: '',
        published_date: new Date().toISOString().slice(0, 10),
        primary_category: 'astro-ph',
        pdf_url: `https://arxiv.org/pdf/${cleanId}.pdf`,
        source_url: `https://arxiv.org/abs/${cleanId}`,
        journal: ''
      };
    }

    const insArxiv = await db.prepare(
      `INSERT INTO arxiv_papers 
       (arxiv_id, title, journal, source_url, authors, abstract, primary_category, published_date, pdf_url, recommended_by_id, recommend_comment, is_pinned, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '组会关联文献', 0, datetime('now'))`
    ).bind(
      meta.arxiv_id,
      meta.title,
      meta.journal || '',
      meta.source_url || `https://arxiv.org/abs/${meta.arxiv_id}`,
      JSON.stringify(meta.authors || []),
      meta.abstract || '',
      meta.primary_category || '',
      meta.published_date || '',
      meta.pdf_url || '',
      userId
    ).run();
    const newPaperId = insArxiv.meta.last_row_id as number;

    await db.prepare(
      `INSERT OR IGNORE INTO library_papers 
       (arxiv_id, title, journal, source_url, authors, abstract, primary_category, published_date, pdf_url, metadata_status, from_recommendation, from_seminar, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ready', 0, 1, datetime('now'))`
    ).bind(
      meta.arxiv_id,
      meta.title,
      meta.journal || '',
      meta.source_url || '',
      JSON.stringify(meta.authors || []),
      meta.abstract || '',
      meta.primary_category || '',
      meta.published_date || '',
      meta.pdf_url || ''
    ).run();

    return newPaperId;
  }

  // 3. 检测是否包含 DOI
  const doi = extractDoi(inputStr);
  if (doi) {
    const doiClean = doi.trim();
    const doiKey = `doi:${doiClean}`;

    const existingPaper = await db.prepare(
      'SELECT id, arxiv_id FROM arxiv_papers WHERE arxiv_id = ? OR source_url LIKE ? LIMIT 1'
    ).bind(doiKey, `%doi.org/${doiClean}%`).first<{ id: number; arxiv_id: string }>();

    const existingLib = await db.prepare(
      'SELECT id, arxiv_id, title, authors, abstract, primary_category, published_date, pdf_url, journal, source_url FROM library_papers WHERE arxiv_id = ? OR source_url LIKE ? LIMIT 1'
    ).bind(doiKey, `%doi.org/${doiClean}%`).first<any>();

    if (existingPaper) {
      if (existingLib) {
        await db.prepare('UPDATE library_papers SET from_seminar = 1 WHERE id = ?').bind(existingLib.id).run();
      } else {
        await db.prepare(
          `INSERT OR IGNORE INTO library_papers 
           (arxiv_id, title, authors, abstract, primary_category, published_date, pdf_url, metadata_status, from_recommendation, from_seminar, journal, source_url, created_at)
           SELECT arxiv_id, title, authors, abstract, primary_category, published_date, pdf_url, 'ready', 0, 1, journal, source_url, datetime('now')
           FROM arxiv_papers WHERE id = ?`
        ).bind(existingPaper.id).run();
      }
      return existingPaper.id;
    }

    if (existingLib) {
      const insRes = await db.prepare(
        `INSERT INTO arxiv_papers 
         (arxiv_id, title, journal, source_url, authors, abstract, primary_category, published_date, pdf_url, recommended_by_id, recommend_comment, is_pinned, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '组会关联文献', 0, datetime('now'))`
      ).bind(
        existingLib.arxiv_id,
        existingLib.title,
        existingLib.journal || '',
        existingLib.source_url || `https://doi.org/${doiClean}`,
        existingLib.authors || '[]',
        existingLib.abstract || '',
        existingLib.primary_category || '',
        existingLib.published_date || '',
        existingLib.pdf_url || '',
        userId
      ).run();
      await db.prepare('UPDATE library_papers SET from_seminar = 1 WHERE id = ?').bind(existingLib.id).run();
      return insRes.meta.last_row_id as number;
    }

    let meta;
    try {
      meta = await fetchDoiMetadata(doiClean);
    } catch {
      meta = {
        arxiv_id: doiKey,
        title: doiClean,
        authors: [presenterName || '未知作者'],
        abstract: '',
        published_date: new Date().toISOString().slice(0, 10),
        primary_category: '',
        pdf_url: '',
        source_url: `https://doi.org/${doiClean}`,
        journal: ''
      };
    }

    const insArxiv = await db.prepare(
      `INSERT INTO arxiv_papers 
       (arxiv_id, title, journal, source_url, authors, abstract, primary_category, published_date, pdf_url, recommended_by_id, recommend_comment, is_pinned, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '组会关联文献', 0, datetime('now'))`
    ).bind(
      meta.arxiv_id,
      meta.title,
      meta.journal || '',
      meta.source_url || `https://doi.org/${doiClean}`,
      JSON.stringify(meta.authors || []),
      meta.abstract || '',
      meta.primary_category || '',
      meta.published_date || '',
      meta.pdf_url || '',
      userId
    ).run();
    const newPaperId = insArxiv.meta.last_row_id as number;

    await db.prepare(
      `INSERT OR IGNORE INTO library_papers 
       (arxiv_id, title, journal, source_url, authors, abstract, primary_category, published_date, pdf_url, metadata_status, from_recommendation, from_seminar, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ready', 0, 1, datetime('now'))`
    ).bind(
      meta.arxiv_id,
      meta.title,
      meta.journal || '',
      meta.source_url || '',
      JSON.stringify(meta.authors || []),
      meta.abstract || '',
      meta.primary_category || '',
      meta.published_date || '',
      meta.pdf_url || ''
    ).run();

    return newPaperId;
  }

  // 4. 输入简单文本（优先匹配已有标题，未匹配则创建轻量条目归档）
  const matchedTitle = await db.prepare(
    'SELECT id, arxiv_id FROM arxiv_papers WHERE LOWER(TRIM(title)) = LOWER(?) LIMIT 1'
  ).bind(inputStr).first<{ id: number; arxiv_id: string }>();

  if (matchedTitle) {
    await db.prepare('UPDATE library_papers SET from_seminar = 1 WHERE arxiv_id = ?').bind(matchedTitle.arxiv_id).run();
    return matchedTitle.id;
  }

  const customKey = `custom:${Date.now()}`;
  const insArxiv = await db.prepare(
    `INSERT INTO arxiv_papers 
     (arxiv_id, title, journal, source_url, authors, abstract, primary_category, published_date, pdf_url, recommended_by_id, recommend_comment, is_pinned, created_at)
     VALUES (?, ?, '', '', ?, '组会主讲人指定文献', 'seminar', ?, '', ?, '组会关联文献', 0, datetime('now'))`
  ).bind(
    customKey,
    inputStr,
    JSON.stringify([presenterName || '主讲人']),
    new Date().toISOString().slice(0, 10),
    userId
  ).run();
  const newPaperId = insArxiv.meta.last_row_id as number;

  await db.prepare(
    `INSERT INTO library_papers 
     (arxiv_id, title, journal, source_url, authors, abstract, primary_category, published_date, pdf_url, metadata_status, from_recommendation, from_seminar, created_at)
     VALUES (?, ?, '', '', ?, '组会主讲人指定文献', 'seminar', ?, '', 'ready', 0, 1, datetime('now'))`
  ).bind(
    customKey,
    inputStr,
    JSON.stringify([presenterName || '主讲人']),
    new Date().toISOString().slice(0, 10)
  ).run();

  return newPaperId;
}

export async function ensureLibrarySeminarIdColumn(db: D1Database): Promise<void> {
  try {
    await db.prepare('ALTER TABLE library_papers ADD COLUMN seminar_id INTEGER').run();
  } catch (e) {
    // Column already exists or table not ready
  }
}

export async function ensureArxivSeminarIdColumn(db: D1Database): Promise<void> {
  try {
    await db.prepare('ALTER TABLE arxiv_papers ADD COLUMN seminar_id INTEGER').run();
  } catch (e) {
    // Column already exists or table not ready
  }
}

/**
 * 归档组会 arXiv 分享文献至文献库 (library_papers) 与文献推荐流 (arxiv_papers)：
 * 1. 自动确保 library_papers.seminar_id 与 arxiv_papers.seminar_id 字段存在；
 * 2. 规范化提取 arXiv ID 并查重；
 * 3. 若文献库已存在该条目，标记 from_seminar = 1，并在原有 seminar_id 为空时补充设置当前 seminarId；
 * 4. 若文献库不存在，抓取元数据并自动归档，保存 seminar_id = seminarId；
 * 5. 同步写入或更新 arxiv_papers 推荐流记录，绑定 seminar_id 与实际分享人 ID，设置推荐理由为“组会 arXiv 分享”。
 */
export async function archiveSeminarPresentationArxiv(
  db: D1Database,
  arxivInput: string | null | undefined,
  seminarId: number,
  presenterId?: number | null,
  presenterName?: string | null
): Promise<{ id: number; arxiv_id: string } | null> {
  if (!arxivInput) return null;
  const inputStr = String(arxivInput).trim();
  if (!inputStr) return null;

  await ensureLibrarySeminarIdColumn(db);
  await ensureArxivSeminarIdColumn(db);

  const arxivId = extractArxivId(inputStr);
  if (!arxivId) return null;

  const cleanId = arxivId.replace(/v\d+$/, '');

  // 解析实际推荐人/分享人 ID
  let recommenderId = presenterId ? Number(presenterId) : 0;
  if (!recommenderId && presenterName) {
    const pName = presenterName.trim();
    const u = await db.prepare('SELECT id FROM users WHERE name = ? OR real_name = ? LIMIT 1').bind(pName, pName).first<{ id: number }>();
    if (u?.id) {
      recommenderId = u.id;
    }
  }
  if (!recommenderId) {
    const firstUser = await db.prepare('SELECT id FROM users ORDER BY id ASC LIMIT 1').first<{ id: number }>();
    recommenderId = firstUser?.id || 1;
  }

  // 查重：检索文献库中是否已有此条目
  const existingLib = await db.prepare(
    `SELECT id, arxiv_id, seminar_id, from_seminar FROM library_papers
     WHERE arxiv_id = ? OR arxiv_id = ? OR arxiv_id = ? LIMIT 1`
  ).bind(cleanId, arxivId, `arXiv:${cleanId}`).first<{ id: number; arxiv_id: string; seminar_id: number | null; from_seminar: number }>();

  let libPaperId: number;
  if (existingLib) {
    await db.prepare(
      `UPDATE library_papers
       SET from_seminar = 1, seminar_id = COALESCE(seminar_id, ?)
       WHERE id = ?`
    ).bind(seminarId, existingLib.id).run();
    libPaperId = existingLib.id;
  } else {
    libPaperId = 0;
  }

  // 检索 arxiv_papers 是否已有缓存
  const existingArxiv = await db.prepare(
    `SELECT id, arxiv_id, seminar_id, recommend_comment, title, authors, abstract, primary_category, published_date, pdf_url, journal, source_url
     FROM arxiv_papers WHERE arxiv_id = ? OR arxiv_id = ? OR arxiv_id = ? LIMIT 1`
  ).bind(cleanId, arxivId, `arXiv:${cleanId}`).first<any>();

  let meta: any = null;
  if (existingArxiv) {
    let authorsList: string[] = [];
    try {
      authorsList = typeof existingArxiv.authors === 'string' ? JSON.parse(existingArxiv.authors) : existingArxiv.authors;
    } catch {
      authorsList = [existingArxiv.authors || ''];
    }
    meta = {
      arxiv_id: cleanId,
      title: existingArxiv.title,
      authors: authorsList,
      abstract: existingArxiv.abstract || '',
      primary_category: existingArxiv.primary_category || 'astro-ph',
      published_date: existingArxiv.published_date || '',
      pdf_url: existingArxiv.pdf_url || `https://arxiv.org/pdf/${cleanId}.pdf`,
      source_url: existingArxiv.source_url || `https://arxiv.org/abs/${cleanId}`,
      journal: existingArxiv.journal || ''
    };
  } else {
    try {
      meta = await fetchArxivMetadata(cleanId);
    } catch (err) {
      console.warn('fetchArxivMetadata failed for presentation share, creating pending record:', err);
      meta = {
        arxiv_id: cleanId,
        title: `arXiv:${cleanId}`,
        authors: [],
        abstract: '',
        primary_category: 'astro-ph',
        published_date: '',
        pdf_url: `https://arxiv.org/pdf/${cleanId}.pdf`,
        source_url: `https://arxiv.org/abs/${cleanId}`,
        journal: '',
        metadata_status: 'pending'
      };
    }
  }

  const authorsJson = JSON.stringify(meta.authors || []);
  const status = meta.metadata_status || 'ready';

  if (!existingLib) {
    const insLib = await db.prepare(
      `INSERT INTO library_papers
       (arxiv_id, title, authors, abstract, primary_category, published_date, pdf_url, source_url, journal, metadata_status, from_recommendation, from_seminar, seminar_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?, datetime('now'))`
    ).bind(
      cleanId,
      meta.title,
      authorsJson,
      meta.abstract || '',
      meta.primary_category || 'astro-ph',
      meta.published_date || '',
      meta.pdf_url || `https://arxiv.org/pdf/${cleanId}.pdf`,
      meta.source_url || `https://arxiv.org/abs/${cleanId}`,
      meta.journal || '',
      status,
      seminarId
    ).run();
    libPaperId = insLib.meta.last_row_id as number;
  }

  // 同步更新或新增至 arxiv_papers 推荐流
  if (existingArxiv) {
    await db.prepare(
      `UPDATE arxiv_papers
       SET seminar_id = ?,
           recommend_comment = CASE 
             WHEN recommend_comment IS NULL OR TRIM(recommend_comment) = '' THEN '组会 arXiv 分享'
             ELSE recommend_comment
           END,
           recommended_by_id = CASE
             WHEN recommended_by_id IS NULL OR recommended_by_id <= 0 THEN ?
             ELSE recommended_by_id
           END
       WHERE id = ?`
    ).bind(seminarId, recommenderId, existingArxiv.id).run();
  } else {
    await db.prepare(
      `INSERT OR IGNORE INTO arxiv_papers
       (arxiv_id, title, journal, source_url, authors, abstract, primary_category, published_date, pdf_url, recommended_by_id, recommend_comment, is_pinned, seminar_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '组会 arXiv 分享', 0, ?, datetime('now'))`
    ).bind(
      cleanId,
      meta.title,
      meta.journal || '',
      meta.source_url || `https://arxiv.org/abs/${cleanId}`,
      authorsJson,
      meta.abstract || '',
      meta.primary_category || 'astro-ph',
      meta.published_date || '',
      meta.pdf_url || `https://arxiv.org/pdf/${cleanId}.pdf`,
      recommenderId,
      seminarId
    ).run().catch(() => {});

    // 补充兜底更新 seminar_id
    await db.prepare(
      `UPDATE arxiv_papers
       SET seminar_id = ?
       WHERE (arxiv_id = ? OR arxiv_id = ? OR arxiv_id = ?) AND seminar_id IS NULL`
    ).bind(seminarId, cleanId, arxivId, `arXiv:${cleanId}`).run().catch(() => {});
  }

  return { id: libPaperId, arxiv_id: cleanId };
}

