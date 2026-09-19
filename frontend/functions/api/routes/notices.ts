import { Hono } from 'hono';
import { Env, UserRow } from '../types';
import { authMiddleware } from '../middleware/auth';

const app = new Hono<{ Bindings: Env; Variables: { user: UserRow } }>();

app.use('*', authMiddleware);

let tableEnsured = false;
async function ensureNoticesTable(db: any) {
  if (tableEnsured) return;
  try {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS notices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        category VARCHAR(50) DEFAULT 'general',
        importance VARCHAR(20) DEFAULT 'normal',
        start_date VARCHAR(30) DEFAULT '',
        end_date VARCHAR(30) DEFAULT '',
        attachments TEXT DEFAULT '[]',
        source_email_uid VARCHAR(150) DEFAULT '',
        source_email_subject TEXT DEFAULT '',
        source_email_sender TEXT DEFAULT '',
        created_by_id INTEGER,
        created_by_name VARCHAR(100) DEFAULT '',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    await db.prepare('CREATE INDEX IF NOT EXISTS idx_notices_source_uid ON notices(source_email_uid)').run();
    await db.prepare('CREATE INDEX IF NOT EXISTS idx_notices_end_date ON notices(end_date)').run();
    try {
      await db.prepare("ALTER TABLE notices ADD COLUMN attachments TEXT DEFAULT '[]'").run();
    } catch {}
    tableEnsured = true;
  } catch (e) {
    console.warn('ensureNoticesTable warning:', e);
  }
}

function getShanghaiToday(): string {
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());
  const year = parts.find(p => p.type === 'year')?.value;
  const month = parts.find(p => p.type === 'month')?.value;
  const day = parts.find(p => p.type === 'day')?.value;
  return `${year}-${month}-${day}`;
}

function sanitizeNoticeDates(startDateRaw: string, endDateRaw: string): { startDate: string; endDate: string } {
  const today = getShanghaiToday();
  const currentYear = parseInt(today.slice(0, 4), 10) || 2026;

  function parsePart(d: string) {
    if (!d || typeof d !== 'string') return null;
    const clean = d.replace(/[/.]/g, '-').trim();
    const m = clean.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) {
      return {
        y: parseInt(m[1], 10),
        m: m[2].padStart(2, '0'),
        day: m[3].padStart(2, '0')
      };
    }
    const md = clean.match(/(?:^|[^\d])(\d{1,2})[-月](\d{1,2})/);
    if (md) {
      return {
        y: currentYear,
        m: md[1].padStart(2, '0'),
        day: md[2].padStart(2, '0')
      };
    }
    return null;
  }

  let start = parsePart(startDateRaw);
  let end = parsePart(endDateRaw);

  if (start && start.y < currentYear) {
    start.y = currentYear;
  }
  const startDateStr = start ? `${start.y}-${start.m}-${start.day}` : (startDateRaw ? startDateRaw.slice(0, 10) : today);

  let endDateStr = '';
  if (end) {
    if (end.y < currentYear) {
      end.y = currentYear;
    }
    if (start && end.y < start.y) {
      end.y = start.y;
    }
    if (start && parseInt(end.m, 10) < parseInt(start.m, 10) && `${end.y}-${end.m}-${end.day}` < startDateStr) {
      end.y = start.y + 1;
    }
    endDateStr = `${end.y}-${end.m}-${end.day}`;
  }

  return { startDate: startDateStr, endDate: endDateStr };
}

function normalizeNoticeTitle(title: string): string {
  return (title || '')
    .replace(/^[【\[](?:重要通知|通知|温馨提示|转发|教务通知|后勤通知|放假通知)[\]】]\s*/i, '')
    .replace(/[\s·•（）()\[\]【】《》""''“”‘’，。、：:；;！!？?·•\-—_]/g, '')
    .toLowerCase();
}

/**
 * 获取通知列表
 * 支持 ?active_only=true|false, ?category=xxx, ?keyword=xxx
 */
app.get('', async (c) => {
  await ensureNoticesTable(c.env.DB);
  const marqueeOnly = c.req.query('marquee_only') === 'true';
  const activeOnly = c.req.query('active_only') === 'true';
  const category = (c.req.query('category') || '').trim();
  const keyword = (c.req.query('keyword') || '').trim();

  let query = 'SELECT * FROM notices WHERE 1=1';
  const params: any[] = [];

  if (marqueeOnly) {
    const today = getShanghaiToday();
    const [ty, tm, td] = today.split('-').map(Number);
    const twoWeeksAgoMs = Date.UTC(ty, tm - 1, td) - 14 * 24 * 60 * 60 * 1000;
    const twoWeeksAgo = new Date(twoWeeksAgoMs).toISOString().slice(0, 10);
    query += " AND ((end_date IS NOT NULL AND end_date != '' AND end_date >= ?) OR ((end_date IS NULL OR end_date = '') AND ((start_date != '' AND start_date >= ?) OR (start_date = '' AND substr(created_at, 1, 10) >= ?))))";
    params.push(today, twoWeeksAgo, twoWeeksAgo);
  } else if (activeOnly) {
    const today = getShanghaiToday();
    query += " AND (end_date IS NULL OR end_date = '' OR end_date >= ?)";
    params.push(today);
  }

  if (category && category !== 'all') {
    query += ' AND category = ?';
    params.push(category);
  }

  if (keyword) {
    query += ' AND (title LIKE ? OR content LIKE ? OR source_email_subject LIKE ?)';
    const kw = `%${keyword}%`;
    params.push(kw, kw, kw);
  }

  query += ` ORDER BY 
    CASE 
      WHEN importance = 'urgent' THEN 0 
      WHEN importance = 'important' THEN 1 
      ELSE 2 
    END ASC, 
    id DESC`;

  const stmt = c.env.DB.prepare(query);
  const bound = params.length > 0 ? stmt.bind(...params) : stmt;
  const { results } = await bound.all();

  return c.json(results || []);
});

/**
 * 获取单条通知详情
 */
app.get('/:id', async (c) => {
  await ensureNoticesTable(c.env.DB);
  const id = Number(c.req.param('id'));
  if (isNaN(id)) {
    return c.json({ detail: '无效的通知ID' }, 400);
  }

  const notice = await c.env.DB.prepare('SELECT * FROM notices WHERE id = ?').bind(id).first();
  if (!notice) {
    return c.json({ detail: '通知不存在或已被删除' }, 404);
  }

  return c.json(notice);
});

/**
 * 单条新建通知（手动新建或单封添加）
 */
app.post('', async (c) => {
  const user = c.get('user');
  await ensureNoticesTable(c.env.DB);

  const body = await c.req.json().catch(() => ({}));
  const title = (body.title || '').trim();
  const content = (body.content || '').trim();
  const category = (body.category || 'general').trim();
  const importance = (body.importance || 'normal').trim();
  const { startDate, endDate } = sanitizeNoticeDates(body.start_date, body.end_date);
  const rawAttachments = body.attachments;
  const attachments = typeof rawAttachments === 'string' ? rawAttachments : JSON.stringify(rawAttachments || []);
  const sourceEmailUid = (body.source_email_uid || '').trim();
  const sourceEmailSubject = (body.source_email_subject || '').trim();
  const sourceEmailSender = (body.source_email_sender || '').trim();

  if (!title) {
    return c.json({ detail: '通知标题/简短描述不能为空' }, 400);
  }
  if (!content) {
    return c.json({ detail: '通知详细内容不能为空' }, 400);
  }

  // 防重检查 1：根据 source_email_uid 精确去重
  if (sourceEmailUid) {
    const existingByUid = await c.env.DB.prepare(
      'SELECT id, title FROM notices WHERE source_email_uid = ?'
    ).bind(sourceEmailUid).first();
    if (existingByUid) {
      return c.json({
        detail: '该通知已由他人或您之前添加过，无需重复入库。',
        existing: existingByUid
      }, 409);
    }
  }

  // 防重检查 2：根据标准化标题与时效去重（避免换邮箱/不同UID的相同通告重复添加）
  const normTitle = normalizeNoticeTitle(title);
  if (normTitle.length >= 4) {
    const { results: recentNotices } = await c.env.DB.prepare(
      "SELECT id, title FROM notices WHERE end_date = '' OR end_date >= ? LIMIT 100"
    ).bind(getShanghaiToday()).all();

    const matched = (recentNotices || []).find((n: any) => normalizeNoticeTitle(n.title) === normTitle);
    if (matched) {
      return c.json({
        detail: `云端已有类似通知「${matched.title}」，无需重复添加。`,
        existing: matched
      }, 409);
    }
  }

  const creatorName = user.real_name || user.nickname || user.name || '系统组员';

  const res = await c.env.DB.prepare(`
    INSERT INTO notices (
      title, content, category, importance, start_date, end_date, attachments,
      source_email_uid, source_email_subject, source_email_sender,
      created_by_id, created_by_name, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `).bind(
    title, content, category, importance, startDate, endDate, attachments,
    sourceEmailUid, sourceEmailSubject, sourceEmailSender,
    user.id, creatorName
  ).run();

  const createdId = res.meta?.last_row_id;
  const created = await c.env.DB.prepare('SELECT * FROM notices WHERE id = ?').bind(createdId).first();

  return c.json(created, 201);
});

/**
 * 批量导入通知（供 AI 智能扫描最近一周邮件后一键同步，具备全自动查重过滤）
 */
app.post('/batch', async (c) => {
  const user = c.get('user');
  await ensureNoticesTable(c.env.DB);

  const body = await c.req.json().catch(() => ({}));
  const rawList = Array.isArray(body.notices) ? body.notices : [];

  if (rawList.length === 0) {
    return c.json({ inserted_count: 0, skipped_count: 0, total: 0, inserted_items: [] });
  }

  // 1. 预先加载所有已存在的 source_email_uid 与最近有效通知标题
  const [{ results: existingUids }, { results: activeNotices }] = await Promise.all([
    c.env.DB.prepare("SELECT source_email_uid FROM notices WHERE source_email_uid != ''").all(),
    c.env.DB.prepare("SELECT id, title FROM notices WHERE end_date = '' OR end_date >= ? LIMIT 300").bind(getShanghaiToday()).all()
  ]);

  const uidSet = new Set((existingUids || []).map((r: any) => String(r.source_email_uid).trim()));
  const normalizedTitleSet = new Set((activeNotices || []).map((r: any) => normalizeNoticeTitle(r.title)));

  const creatorName = user.real_name || user.nickname || user.name || '系统组员';
  let insertedCount = 0;
  let skippedCount = 0;
  const insertedItems: any[] = [];

  for (const item of rawList) {
    const title = (item.title || '').trim();
    const content = (item.content || '').trim();
    const category = (item.category || 'general').trim();
    const importance = (item.importance || 'normal').trim();
    const { startDate, endDate } = sanitizeNoticeDates(item.start_date, item.end_date);
    const rawAttachments = item.attachments;
    const attachments = typeof rawAttachments === 'string' ? rawAttachments : JSON.stringify(rawAttachments || []);
    const sourceUid = (item.source_email_uid || item.source_uid || '').trim();
    const sourceSubject = (item.source_email_subject || item.source_subject || '').trim();
    const sourceSender = (item.source_email_sender || item.source_sender || '').trim();

    if (!title || !content) {
      skippedCount++;
      continue;
    }

    // 查重 1: UID 匹配
    if (sourceUid && uidSet.has(sourceUid)) {
      skippedCount++;
      continue;
    }

    // 查重 2: 规范化标题匹配
    const normTitle = normalizeNoticeTitle(title);
    if (normTitle.length >= 4 && normalizedTitleSet.has(normTitle)) {
      skippedCount++;
      continue;
    }

    try {
      const res = await c.env.DB.prepare(`
        INSERT INTO notices (
          title, content, category, importance, start_date, end_date, attachments,
          source_email_uid, source_email_subject, source_email_sender,
          created_by_id, created_by_name, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `).bind(
        title, content, category, importance, startDate, endDate, attachments,
        sourceUid, sourceSubject, sourceSender,
        user.id, creatorName
      ).run();

      const createdId = res.meta?.last_row_id;
      if (sourceUid) uidSet.add(sourceUid);
      if (normTitle.length >= 4) normalizedTitleSet.add(normTitle);
      insertedCount++;
      insertedItems.push({ id: createdId, title, category, importance, start_date: startDate, end_date: endDate, attachments });
    } catch (e) {
      console.warn('Batch insert notice item error:', e);
      skippedCount++;
    }
  }

  return c.json({
    inserted_count: insertedCount,
    skipped_count: skippedCount,
    total: rawList.length,
    inserted_items: insertedItems
  });
});

/**
 * 更新通知
 */
app.put('/:id', async (c) => {
  const user = c.get('user');
  await ensureNoticesTable(c.env.DB);

  const id = Number(c.req.param('id'));
  if (isNaN(id)) {
    return c.json({ detail: '无效的通知ID' }, 400);
  }

  const existing = await c.env.DB.prepare('SELECT * FROM notices WHERE id = ?').bind(id).first();
  if (!existing) {
    return c.json({ detail: '通知不存在或已被删除' }, 404);
  }

  // 权限检查：创建者、管理员或导师可修改
  const isOwner = Number(existing.created_by_id) === Number(user.id);
  const isAdminOrTeacher = user.role === 'admin' || user.identity === 'teacher';
  if (!isOwner && !isAdminOrTeacher) {
    return c.json({ detail: '您无权修改此通知' }, 403);
  }

  const body = await c.req.json().catch(() => ({}));
  const title = body.title !== undefined ? String(body.title).trim() : existing.title;
  const content = body.content !== undefined ? String(body.content).trim() : existing.content;
  const category = body.category !== undefined ? String(body.category).trim() : existing.category;
  const importance = body.importance !== undefined ? String(body.importance).trim() : existing.importance;
  
  const rawStart = body.start_date !== undefined ? String(body.start_date).trim() : existing.start_date;
  const rawEnd = body.end_date !== undefined ? String(body.end_date).trim() : existing.end_date;
  const { startDate, endDate } = sanitizeNoticeDates(rawStart, rawEnd);

  let attachments = existing.attachments || '[]';
  if (body.attachments !== undefined) {
    attachments = typeof body.attachments === 'string' ? body.attachments : JSON.stringify(body.attachments || []);
  }

  if (!title) {
    return c.json({ detail: '通知标题不能为空' }, 400);
  }
  if (!content) {
    return c.json({ detail: '通知内容不能为空' }, 400);
  }

  await c.env.DB.prepare(`
    UPDATE notices 
    SET title = ?, content = ?, category = ?, importance = ?, start_date = ?, end_date = ?, attachments = ?, updated_at = datetime('now')
    WHERE id = ?
  `).bind(title, content, category, importance, startDate, endDate, attachments, id).run();

  const updated = await c.env.DB.prepare('SELECT * FROM notices WHERE id = ?').bind(id).first();
  return c.json(updated);
});

/**
 * 删除通知
 */
app.delete('/:id', async (c) => {
  const user = c.get('user');
  await ensureNoticesTable(c.env.DB);

  const id = Number(c.req.param('id'));
  if (isNaN(id)) {
    return c.json({ detail: '无效的通知ID' }, 400);
  }

  const existing = await c.env.DB.prepare('SELECT * FROM notices WHERE id = ?').bind(id).first();
  if (!existing) {
    return c.json({ detail: '通知不存在或已被删除' }, 404);
  }

  // 权限检查：创建者、管理员或导师可删除
  const isOwner = Number(existing.created_by_id) === Number(user.id);
  const isAdminOrTeacher = user.role === 'admin' || user.identity === 'teacher';
  if (!isOwner && !isAdminOrTeacher) {
    return c.json({ detail: '您无权删除此通知' }, 403);
  }

  await c.env.DB.prepare('DELETE FROM notices WHERE id = ?').bind(id).run();
  return c.json({ success: true, message: '通知已删除' });
});

export default app;
