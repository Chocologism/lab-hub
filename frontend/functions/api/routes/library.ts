import { Hono } from 'hono';
import { Env, UserRow } from '../types';
import { authMiddleware, adminOnlyMiddleware } from '../middleware/auth';

const app = new Hono<{ Bindings: Env; Variables: { user: UserRow } }>();

app.use('*', authMiddleware);

app.get('', async (c) => {
  const user = c.get('user');
  const q = (c.req.query('q') || '').trim().toLowerCase();
  const source = c.req.query('source') || 'all';

  // 确保 library_papers 包含 seminar_id 字段
  await c.env.DB.prepare('ALTER TABLE library_papers ADD COLUMN seminar_id INTEGER').run().catch(() => {});

  // 查询当前用户有权访问的定向收录文献集合
  const directAccess = await c.env.DB.prepare(
    'SELECT paper_id FROM library_access WHERE user_id = ?'
  ).bind(user.id).all<{ paper_id: number }>();
  const directSet = new Set((directAccess.results || []).map(r => r.paper_id));

  let query = `
    SELECT lp.*,
      COALESCE(
        lp.seminar_id,
        (SELECT sp.seminar_id FROM seminar_presentations sp WHERE (sp.arxiv_id = lp.arxiv_id OR sp.arxiv_id LIKE '%' || lp.arxiv_id || '%') AND sp.seminar_id IS NOT NULL ORDER BY sp.id ASC LIMIT 1),
        (SELECT ss.id FROM seminar_schedules ss JOIN arxiv_papers ap ON ss.paper_id = ap.id WHERE (ap.arxiv_id = lp.arxiv_id OR ap.arxiv_id LIKE '%' || lp.arxiv_id || '%') ORDER BY ss.id ASC LIMIT 1)
      ) AS seminar_id
    FROM library_papers lp
    WHERE 1=1
  `;
  const params: any[] = [];

  if (source === 'recommendation') {
    query += ' AND (lp.from_recommendation = 1 OR lp.id IN (SELECT paper_id FROM library_access WHERE user_id = ?))';
    params.push(user.id);
  } else if (source === 'direct') {
    query += ' AND lp.id IN (SELECT paper_id FROM library_access WHERE user_id = ?)';
    params.push(user.id);
  } else if (source === 'seminar') {
    query += ' AND lp.from_seminar = 1';
  }

  if (q) {
    query += ' AND (LOWER(lp.title) LIKE ? OR LOWER(lp.arxiv_id) LIKE ? OR LOWER(lp.authors) LIKE ? OR LOWER(lp.abstract) LIKE ?)';
    const pattern = `%${q}%`;
    params.push(pattern, pattern, pattern, pattern);
  }

  query += ' ORDER BY lp.id DESC';

  const stmt = c.env.DB.prepare(query);
  const { results: papers } = await (params.length ? stmt.bind(...params) : stmt).all();

  const formatted = (papers || []).map(p => {
    let authorsList: string[] = [];
    try {
      authorsList = JSON.parse(p.authors as string);
    } catch {
      authorsList = [(p.authors as string) || ''];
    }
    const hasDirect = directSet.has(p.id as number);
    return {
      ...p,
      from_direct: hasDirect,
      from_recommendation: Boolean(p.from_recommendation || hasDirect),
      from_seminar: Boolean(p.from_seminar),
      seminar_id: p.seminar_id ? Number(p.seminar_id) : null,
      authors: authorsList,
    };
  });

  return c.json(formatted);
});

app.delete('/:id', adminOnlyMiddleware, async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  await c.env.DB.prepare('DELETE FROM library_recommendation_sources WHERE library_id = ?').bind(id).run();
  await c.env.DB.prepare('DELETE FROM library_aliases WHERE library_id = ?').bind(id).run();
  await c.env.DB.prepare('DELETE FROM library_access WHERE paper_id = ?').bind(id).run();
  await c.env.DB.prepare('DELETE FROM library_papers WHERE id = ?').bind(id).run();

  return c.json({ message: '文献库条目已成功删除' });
});

export default app;
