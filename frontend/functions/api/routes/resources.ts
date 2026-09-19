import { Hono } from 'hono';
import { Env, UserRow } from '../types';
import { authMiddleware, adminOnlyMiddleware } from '../middleware/auth';

const app = new Hono<{ Bindings: Env; Variables: { user: UserRow } }>();

app.use('*', authMiddleware);

const DEFAULT_CATEGORIES = [
  { id: 1, name: '教材', is_default: true },
  { id: 2, name: '工具', is_default: true },
  { id: 3, name: '网站', is_default: true },
];

app.get('/categories', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT id, name, is_default FROM resource_categories ORDER BY is_default DESC, id ASC'
  ).all<any>();

  if (!results || results.length === 0) {
    return c.json(DEFAULT_CATEGORIES);
  }

  return c.json(results.map(r => ({
    id: r.id,
    name: r.name,
    is_default: Boolean(r.is_default)
  })));
});

app.post('/categories', adminOnlyMiddleware, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const name = (body.name || '').trim();
  if (!name) return c.json({ detail: '分类名称不能为空' }, 400);
  if (name === '全部') return c.json({ detail: '不能添加名为「全部」的分类' }, 400);

  const existing = await c.env.DB.prepare('SELECT id FROM resource_categories WHERE name = ?').bind(name).first();
  if (existing) return c.json({ detail: `分类「${name}」已存在` }, 400);

  const res = await c.env.DB.prepare(
    "INSERT INTO resource_categories (name, is_default, created_at) VALUES (?, 0, datetime('now'))"
  ).bind(name).run();

  return c.json({
    id: res.meta.last_row_id,
    name,
    is_default: false
  }, 201);
});

app.delete('/categories/:name', adminOnlyMiddleware, async (c) => {
  const name = decodeURIComponent(c.req.param('name'));
  const cat = await c.env.DB.prepare('SELECT * FROM resource_categories WHERE name = ?').bind(name).first<any>();
  if (!cat) return c.json({ detail: '分类不存在' }, 404);
  if (cat.is_default) return c.json({ detail: '系统内置分类不允许删除' }, 400);

  await c.env.DB.prepare('DELETE FROM resource_categories WHERE name = ?').bind(name).run();
  return c.json({ message: '分类已删除' });
});

app.get('/books', async (c) => {
  const category = c.req.query('category');
  const q = (c.req.query('q') || '').trim().toLowerCase();

  let query = `
    SELECT b.*,
      COALESCE((
        SELECT COUNT(*) FROM favorites f 
        WHERE f.kind = 'book' AND (f.target = CAST(b.id AS TEXT) OR f.target = '' || b.id)
      ), 0) AS favorite_count
    FROM resource_books b 
    WHERE 1=1
  `;
  const params: any[] = [];

  if (category && category !== '全部') {
    query += ' AND b.category = ?';
    params.push(category);
  }

  if (q) {
    query += ' AND (LOWER(b.title) LIKE ? OR LOWER(b.original_title) LIKE ? OR LOWER(b.authors) LIKE ? OR LOWER(COALESCE(b.description, \'\')) LIKE ?)';
    const pattern = `%${q}%`;
    params.push(pattern, pattern, pattern, pattern);
  }

  query += ' ORDER BY b.order_num ASC, b.id DESC';

  const stmt = c.env.DB.prepare(query);
  const { results: books } = await (params.length ? stmt.bind(...params) : stmt).all();

  return c.json(books || []);
});

app.post('/books', async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));

  const title = (body.title || '').trim();
  if (!title) return c.json({ detail: '资料标题不能为空' }, 400);

  const original_title = (body.original_title || '').trim();
  const authors = (body.authors || '').trim();
  const category = (body.category || '教材').trim();
  const description = body.description || '';
  const cover_url = body.cover_url || '';
  const tutorial_url = body.tutorial_url || '';
  const exercise_url = body.exercise_url || '';
  const github_url = body.github_url || '';
  const download_url = body.download_url || '';
  const order_num = body.order_num || 0;

  const res = await c.env.DB.prepare(
    `INSERT INTO resource_books 
     (title, original_title, authors, category, description, cover_url, tutorial_url, exercise_url, github_url, download_url, order_num, created_by_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
  ).bind(title, original_title, authors, category, description, cover_url, tutorial_url, exercise_url, github_url, download_url, order_num, user.id).run();

  const created = await c.env.DB.prepare('SELECT * FROM resource_books WHERE id = ?').bind(res.meta.last_row_id).first();
  return c.json(created);
});

app.put('/books/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const body = await c.req.json().catch(() => ({}));

  const existing = await c.env.DB.prepare('SELECT * FROM resource_books WHERE id = ?').bind(id).first();
  if (!existing) return c.json({ detail: '资料条目不存在' }, 404);

  const title = body.title !== undefined ? body.title.trim() : existing.title;
  const original_title = body.original_title !== undefined ? body.original_title.trim() : existing.original_title;
  const authors = body.authors !== undefined ? body.authors.trim() : existing.authors;
  const category = body.category !== undefined ? body.category.trim() : existing.category;
  const description = body.description !== undefined ? body.description : existing.description;
  const cover_url = body.cover_url !== undefined ? body.cover_url : existing.cover_url;
  const tutorial_url = body.tutorial_url !== undefined ? body.tutorial_url : existing.tutorial_url;
  const exercise_url = body.exercise_url !== undefined ? body.exercise_url : existing.exercise_url;
  const github_url = body.github_url !== undefined ? body.github_url : existing.github_url;
  const download_url = body.download_url !== undefined ? body.download_url : existing.download_url;
  const order_num = body.order_num !== undefined ? body.order_num : existing.order_num;

  await c.env.DB.prepare(
    `UPDATE resource_books 
     SET title = ?, original_title = ?, authors = ?, category = ?, description = ?, cover_url = ?, tutorial_url = ?, exercise_url = ?, github_url = ?, download_url = ?, order_num = ?
     WHERE id = ?`
  ).bind(title, original_title, authors, category, description, cover_url, tutorial_url, exercise_url, github_url, download_url, order_num, id).run();

  const updated = await c.env.DB.prepare('SELECT * FROM resource_books WHERE id = ?').bind(id).first();
  return c.json(updated);
});

app.delete('/books/:id', async (c) => {
  const user = c.get('user');
  const rawId = c.req.param('id');
  const id = parseInt(rawId, 10);
  if (isNaN(id)) {
    return c.json({ detail: '资料条目不存在' }, 404);
  }

  const book = await c.env.DB.prepare('SELECT id, title, created_by_id FROM resource_books WHERE id = ?').bind(id).first<{ id: number; title: string; created_by_id: number }>();
  if (!book) return c.json({ detail: '资料条目不存在' }, 404);

  if (book.created_by_id !== user.id && user.role !== 'admin' && user.role !== 'teacher') {
    return c.json({ detail: '权限不足，无法删除此资料' }, 403);
  }

  await c.env.DB.prepare('DELETE FROM resource_books WHERE id = ?').bind(id).run();
  return c.json({ message: '资料条目已删除' });
});

app.post('/pdf', async (c) => {
  const formData = await c.req.formData().catch(() => null);
  if (!formData) return c.json({ detail: '无效表单' }, 400);

  const file = formData.get('file') as File | null;
  if (!file) return c.json({ detail: '未找到上传的 PDF' }, 400);

  const fileId = crypto.randomUUID();
  const buffer = await file.arrayBuffer();

  await c.env.FILES_BUCKET.put(fileId, buffer, {
    httpMetadata: {
      contentType: 'application/pdf',
      contentDisposition: `inline; filename="${encodeURIComponent(file.name)}"`
    }
  });

  await c.env.DB.prepare(
    "INSERT INTO uploaded_files (id, filename, content_type, size, created_at) VALUES (?, ?, 'application/pdf', ?, datetime('now'))"
  ).bind(fileId, file.name, file.size).run();

  return c.json({ url: `/api/files/${fileId}`, filename: file.name });
});

export default app;
