import { Hono } from 'hono';
import { Env, UserRow } from '../types';
import { authMiddleware, adminOnlyMiddleware } from '../middleware/auth';

const app = new Hono<{ Bindings: Env; Variables: { user: UserRow } }>();

app.use('*', authMiddleware);

app.post('', async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const title = (body.title || '').trim();
  const content = (body.content || '').trim();
  const page = (body.page || '').trim();

  if (!title || !content) {
    return c.json({ detail: '标题与内容均不能为空' }, 400);
  }

  const res = await c.env.DB.prepare(
    `INSERT INTO issue_feedback (user_id, title, content, page, resolved, created_at)
     VALUES (?, ?, ?, ?, 0, datetime('now'))`
  ).bind(user.id, title, content, page).run();

  const created = await c.env.DB.prepare('SELECT * FROM issue_feedback WHERE id = ?').bind(res.meta.last_row_id).first();
  return c.json(created);
});

app.get('', adminOnlyMiddleware, async (c) => {
  const { results: issues } = await c.env.DB.prepare(
    `SELECT f.*, u.name as user_name, u.email as user_email
     FROM issue_feedback f
     JOIN users u ON u.id = f.user_id
     ORDER BY f.resolved ASC, f.id DESC`
  ).all();

  const list = [];
  for (const f of (issues || [])) {
    const { results: replies } = await c.env.DB.prepare(
      `SELECT r.*, a.name as admin_name FROM feedback_replies r
       JOIN users a ON a.id = r.admin_id
       WHERE r.feedback_id = ? ORDER BY r.id ASC`
    ).bind(f.id).all();
    list.push({ ...f, replies: replies || [] });
  }

  return c.json(list);
});

app.get('/mine', async (c) => {
  const user = c.get('user');
  const { results: issues } = await c.env.DB.prepare(
    'SELECT * FROM issue_feedback WHERE user_id = ? ORDER BY id DESC'
  ).bind(user.id).all();

  const list = [];
  for (const f of (issues || [])) {
    const { results: replies } = await c.env.DB.prepare(
      `SELECT r.*, a.name as admin_name FROM feedback_replies r
       JOIN users a ON a.id = r.admin_id
       WHERE r.feedback_id = ? ORDER BY r.id ASC`
    ).bind(f.id).all();
    list.push({ ...f, replies: replies || [] });
  }

  return c.json(list);
});

app.get('/unread', async (c) => {
  const user = c.get('user');
  const countRes = await c.env.DB.prepare(
    `SELECT count(*) as cnt FROM feedback_replies r
     JOIN issue_feedback f ON f.id = r.feedback_id
     WHERE f.user_id = ? AND r.read_at IS NULL`
  ).bind(user.id).first<{ cnt: number }>();

  return c.json({ count: countRes?.cnt || 0 });
});

app.post('/:id/replies', adminOnlyMiddleware, async (c) => {
  const admin = c.get('user');
  const feedbackId = parseInt(c.req.param('id'), 10);
  const body = await c.req.json().catch(() => ({}));
  const content = (body.content || '').trim();

  if (!content) return c.json({ detail: '回复内容不能为空' }, 400);

  const res = await c.env.DB.prepare(
    `INSERT INTO feedback_replies (feedback_id, admin_id, content, created_at)
     VALUES (?, ?, ?, datetime('now'))`
  ).bind(feedbackId, admin.id, content).run();

  const created = await c.env.DB.prepare(
    `SELECT r.*, a.name as admin_name FROM feedback_replies r
     JOIN users a ON a.id = r.admin_id WHERE r.id = ?`
  ).bind(res.meta.last_row_id).first();

  return c.json(created);
});

app.put('/replies/:id/read', async (c) => {
  const user = c.get('user');
  const replyId = parseInt(c.req.param('id'), 10);

  // Check ownership
  const reply = await c.env.DB.prepare(
    `SELECT r.id FROM feedback_replies r
     JOIN issue_feedback f ON f.id = r.feedback_id
     WHERE r.id = ? AND f.user_id = ?`
  ).bind(replyId, user.id).first();

  if (!reply) return c.json({ detail: '未找到对应回复' }, 404);

  await c.env.DB.prepare("UPDATE feedback_replies SET read_at = datetime('now') WHERE id = ?").bind(replyId).run();
  return c.json({ message: '已标记为已读' });
});

app.patch('/:id', adminOnlyMiddleware, async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const body = await c.req.json().catch(() => ({}));
  const resolved = body.resolved ? 1 : 0;

  await c.env.DB.prepare('UPDATE issue_feedback SET resolved = ? WHERE id = ?').bind(resolved, id).run();
  return c.json({ message: '状态已更新', resolved: Boolean(resolved) });
});

export default app;
