import { Hono } from 'hono';
import { Env, UserRow } from '../types';
import { authMiddleware } from '../middleware/auth';

const app = new Hono<{ Bindings: Env; Variables: { user: UserRow } }>();

app.use('*', authMiddleware);

app.get('', async (c) => {
  const user = c.get('user');
  const { results: rows } = await c.env.DB.prepare(
    'SELECT kind, target, created_at FROM favorites WHERE user_id = ? ORDER BY created_at DESC'
  ).bind(user.id).all();

  const result: any[] = [];
  for (const entry of (rows || [])) {
    const kind = entry.kind as string;
    const target = entry.target as string;

    if (kind === 'paper') {
      const paper = await c.env.DB.prepare(
        'SELECT * FROM library_papers WHERE arxiv_id = ? OR id = ? LIMIT 1'
      ).bind(target, target).first<any>();

      if (!paper) continue;

      let authorsList: string[] = [];
      try {
        authorsList = JSON.parse(paper.authors || '[]');
      } catch {
        authorsList = [paper.authors || ''];
      }

      const item = {
        ...paper,
        authors: authorsList,
        from_direct: false,
        from_recommendation: Boolean(paper.from_recommendation),
        arxiv_url: paper.arxiv_id && !paper.arxiv_id.startsWith('doi:') && !paper.arxiv_id.startsWith('url:')
          ? `https://arxiv.org/abs/${paper.arxiv_id}`
          : '',
        doi_url: paper.source_url && paper.source_url.toLowerCase().startsWith('https://doi.org/')
          ? paper.source_url
          : ''
      };

      result.push({
        kind,
        target,
        saved_at: entry.created_at,
        item
      });
    } else if (kind === 'book') {
      const bookId = parseInt(target, 10);
      if (isNaN(bookId)) continue;

      const book = await c.env.DB.prepare(
        'SELECT * FROM resource_books WHERE id = ? LIMIT 1'
      ).bind(bookId).first<any>();

      if (!book) continue;

      result.push({
        kind,
        target,
        saved_at: entry.created_at,
        item: book
      });
    }
  }

  return c.json(result);
});

app.put('/:kind/:target{.*}', async (c) => {
  const user = c.get('user');
  const kind = c.req.param('kind');
  let target = decodeURIComponent(c.req.param('target') || '').trim();

  if (kind !== 'paper' && kind !== 'book') {
    return c.json({ detail: '不支持的收藏类型' }, 400);
  }

  if (kind === 'paper') {
    let paper = await c.env.DB.prepare(
      'SELECT * FROM library_papers WHERE arxiv_id = ? OR id = ? LIMIT 1'
    ).bind(target, target).first<any>();

    if (!paper) {
      const arxivPaper = await c.env.DB.prepare(
        'SELECT * FROM arxiv_papers WHERE arxiv_id = ? LIMIT 1'
      ).bind(target).first<any>();

      if (!arxivPaper) {
        return c.json({ detail: '内容不存在或无权访问' }, 404);
      }
      target = arxivPaper.arxiv_id;
    } else {
      target = paper.arxiv_id;
    }
  } else {
    const bookId = parseInt(target, 10);
    if (isNaN(bookId)) return c.json({ detail: '无效的目标 ID' }, 400);
    const book = await c.env.DB.prepare('SELECT id FROM resource_books WHERE id = ?').bind(bookId).first();
    if (!book) return c.json({ detail: '资料不存在或无权访问' }, 404);
  }

  await c.env.DB.prepare(
    `INSERT OR IGNORE INTO favorites (user_id, kind, target, created_at)
     VALUES (?, ?, ?, datetime('now'))`
  ).bind(user.id, kind, target).run();

  return c.json({ saved: true });
});

app.delete('/:kind/:target{.*}', async (c) => {
  const user = c.get('user');
  const kind = c.req.param('kind');
  const target = decodeURIComponent(c.req.param('target') || '').trim();

  let targetId = target;
  if (kind === 'paper') {
    const paper = await c.env.DB.prepare(
      'SELECT arxiv_id FROM library_papers WHERE arxiv_id = ? OR id = ? LIMIT 1'
    ).bind(target, target).first<any>();
    if (paper) {
      targetId = paper.arxiv_id;
    }
  }

  await c.env.DB.prepare(
    'DELETE FROM favorites WHERE user_id = ? AND kind = ? AND (target = ? OR target = ?)'
  ).bind(user.id, kind, target, targetId).run();

  return c.json({ saved: false });
});

export default app;
