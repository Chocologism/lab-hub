import { Hono } from 'hono';
import { Env, UserRow } from '../types';
import { authMiddleware } from '../middleware/auth';

const app = new Hono<{ Bindings: Env; Variables: { user: UserRow } }>();

app.use('*', authMiddleware);

let tableEnsured = false;
async function ensurePendingImportsTable(db: any) {
  if (tableEnsured) return;
  try {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS pending_schedule_imports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        raw_text TEXT NOT NULL,
        inferred_type VARCHAR(20) NOT NULL DEFAULT 'talk',
        parsed_data TEXT DEFAULT '{}',
        image_urls TEXT DEFAULT '[]',
        file_attachments TEXT DEFAULT '[]',
        status VARCHAR(20) DEFAULT 'pending',
        created_by_id INTEGER,
        created_by_name VARCHAR(100) DEFAULT '',
        resolved_by_id INTEGER,
        resolved_by_name VARCHAR(100) DEFAULT '',
        target_type VARCHAR(20) DEFAULT '',
        target_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        resolved_at DATETIME
      )
    `).run();
    await db.prepare('CREATE INDEX IF NOT EXISTS idx_pending_imports_status ON pending_schedule_imports(status)').run();
    tableEnsured = true;
  } catch (e) {
    console.warn('ensurePendingImportsTable warning:', e);
  }
}

let talksColumnsEnsured = false;
async function ensureTalksColumns(db: any) {
  if (talksColumnsEnsured) return;
  const cols = [
    "end_date VARCHAR(10) DEFAULT ''",
    "event_type VARCHAR(20) DEFAULT 'talk'",
    "city VARCHAR(100) DEFAULT ''",
    "organizer VARCHAR(200) DEFAULT ''",
    "sub_type VARCHAR(50) DEFAULT ''",
    "abstract_deadline VARCHAR(10) DEFAULT ''",
    "early_bird_deadline VARCHAR(10) DEFAULT ''",
    "registration_deadline VARCHAR(10) DEFAULT ''",
    "website_url TEXT DEFAULT ''",
    "registration_url TEXT DEFAULT ''",
    "handbook_url TEXT DEFAULT ''",
    "source VARCHAR(200) DEFAULT ''",
    "created_by_id INTEGER DEFAULT 0",
    "updated_at TEXT DEFAULT ''"
  ];
  for (const col of cols) {
    try {
      await db.prepare(`ALTER TABLE observatory_talks ADD COLUMN ${col}`).run();
    } catch {}
  }
  talksColumnsEnsured = true;
}

let noticesTableEnsured = false;
async function ensureNoticesTable(db: any) {
  if (noticesTableEnsured) return;
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
    noticesTableEnsured = true;
  } catch (e) {
    console.warn('ensureNoticesTable warning:', e);
  }
}

/**
 * 获取待处理队列列表及统计数量
 */
app.get('/pending', async (c) => {
  await ensurePendingImportsTable(c.env.DB);
  try {
    const { results } = await c.env.DB.prepare(
      "SELECT * FROM pending_schedule_imports WHERE status = 'pending' ORDER BY created_at DESC"
    ).all();

    const list = (results || []).map((row: any) => {
      let parsedData = {};
      let imageUrls = [];
      let fileAttachments = [];
      try {
        parsedData = typeof row.parsed_data === 'string' ? JSON.parse(row.parsed_data || '{}') : (row.parsed_data || {});
      } catch {}
      try {
        imageUrls = typeof row.image_urls === 'string' ? JSON.parse(row.image_urls || '[]') : (row.image_urls || []);
      } catch {}
      try {
        fileAttachments = typeof row.file_attachments === 'string' ? JSON.parse(row.file_attachments || '[]') : (row.file_attachments || []);
      } catch {}

      return {
        ...row,
        parsed_data: parsedData,
        image_urls: Array.isArray(imageUrls) ? imageUrls : [],
        file_attachments: Array.isArray(fileAttachments) ? fileAttachments : []
      };
    });

    return c.json({
      list,
      total: list.length
    });
  } catch (err: any) {
    return c.json({ detail: err.message || '获取待处理导入列表失败' }, 500);
  }
});

/**
 * 提交新的待处理文本导入草稿
 */
app.post('/pending', async (c) => {
  const user = c.get('user');
  await ensurePendingImportsTable(c.env.DB);

  try {
    const body = await c.req.json().catch(() => ({}));
    const rawText = (body.raw_text || '').trim();
    const inferredType = (body.inferred_type || 'talk').trim().toLowerCase();
    const parsedData = typeof body.parsed_data === 'string' ? body.parsed_data : JSON.stringify(body.parsed_data || {});
    let parsedImages: any[] = [];
    try {
      parsedImages = typeof body.image_urls === 'string' ? JSON.parse(body.image_urls) : (body.image_urls || []);
    } catch {}
    let parsedFiles: any[] = [];
    try {
      parsedFiles = typeof body.file_attachments === 'string' ? JSON.parse(body.file_attachments) : (body.file_attachments || []);
    } catch {}

    const hasImages = Array.isArray(parsedImages) && parsedImages.length > 0;
    const hasFiles = Array.isArray(parsedFiles) && parsedFiles.length > 0;

    if (!rawText && !hasImages && !hasFiles) {
      return c.json({ detail: '请提供需要识别导入的内容（文本、海报图片或附件文件）' }, 400);
    }

    const effectiveRawText = rawText || (hasImages ? '【随附海报图片】' : (hasFiles ? '【随附附件文件】' : ''));

    const validTypes = ['talk', 'conference', 'notice'];
    const finalType = validTypes.includes(inferredType) ? inferredType : 'talk';

    const creatorName = (user.real_name || user.name || user.email || '组员').trim();

    const imageUrlsJson = JSON.stringify(Array.isArray(parsedImages) ? parsedImages : []);
    const fileAttachmentsJson = JSON.stringify(Array.isArray(parsedFiles) ? parsedFiles : []);

    const insertRes = await c.env.DB.prepare(`
      INSERT INTO pending_schedule_imports (
        raw_text, inferred_type, parsed_data, image_urls, file_attachments,
        status, created_by_id, created_by_name, created_at
      ) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, datetime('now'))
    `).bind(
      effectiveRawText,
      finalType,
      parsedData,
      imageUrlsJson,
      fileAttachmentsJson,
      user.id || 0,
      creatorName
    ).run();

    const insertedId = insertRes.meta?.last_row_id;
    const createdRow = insertedId ? await c.env.DB.prepare('SELECT * FROM pending_schedule_imports WHERE id = ?').bind(insertedId).first() : null;

    return c.json({
      message: '已成功提交至待处理队列，等待管理员或其他成员进行 AI 识别填充。',
      item: createdRow || { id: insertedId, inferred_type: finalType, raw_text: effectiveRawText }
    }, 201);
  } catch (err: any) {
    console.error('Pending submit error:', err);
    return c.json({ detail: err.message || '提交至待处理队列失败' }, 500);
  }
});

app.post('/:id/resolve', async (c) => {
  const user = c.get('user');
  await ensurePendingImportsTable(c.env.DB);
  await ensureTalksColumns(c.env.DB);
  await ensureNoticesTable(c.env.DB);

  const id = Number(c.req.param('id'));
  if (isNaN(id)) {
    return c.json({ detail: '无效的待处理项 ID' }, 400);
  }

  const pendingItem = await c.env.DB.prepare('SELECT * FROM pending_schedule_imports WHERE id = ?').bind(id).first();
  if (!pendingItem) {
    return c.json({ detail: '未找到该待处理导入记录' }, 404);
  }

  const body = await c.req.json().catch(() => ({}));
  const targetType = (body.target_type || pendingItem.inferred_type || 'talk').trim().toLowerCase();
  const cardData = body.data || {};

  const resolverName = (user.real_name || user.name || user.email || '组员').trim();
  let targetId: number | null = null;

  try {
    if (targetType === 'notice') {
      // 写入 notices 表
      const title = (cardData.title || '').trim();
      const content = (cardData.content || pendingItem.raw_text || '').trim();
      const category = (cardData.category || 'general').trim();
      const importance = (cardData.importance || 'normal').trim();
      const startDate = (cardData.start_date || '').trim();
      const endDate = (cardData.end_date || '').trim();
      const attachments = typeof cardData.attachments === 'string'
        ? cardData.attachments
        : JSON.stringify(cardData.attachments || []);

      if (!title) {
        return c.json({ detail: '通知标题不能为空' }, 400);
      }
      if (!content) {
        return c.json({ detail: '通知内容不能为空' }, 400);
      }

      const insertNoticeRes = await c.env.DB.prepare(`
        INSERT INTO notices (
          title, content, category, importance, start_date, end_date,
          attachments, created_by_id, created_by_name, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `).bind(
        title,
        content,
        category,
        importance,
        startDate,
        endDate,
        attachments,
        user.id || 0,
        resolverName
      ).run();

      targetId = insertNoticeRes.meta?.last_row_id;
    } else {
      // 写入 observatory_talks 表 (报告或会议)
      const isConference = targetType === 'conference';
      const eventType = isConference ? 'conference' : 'talk';
      const title = (cardData.title || (isConference ? '学术会议' : '学术报告')).trim();
      const date = (cardData.date || new Date().toISOString().slice(0, 10)).trim();
      const effectiveEndDate = isConference ? (cardData.end_date || date).trim() : '';
      const effectiveTime = isConference ? (cardData.time || '全天').trim() : (cardData.time || '10:00').trim();
      const speaker = isConference ? '' : (cardData.speaker || '').trim();
      const location = (cardData.location || '').trim();
      const notes = (cardData.notes || pendingItem.raw_text || '').trim();
      const posterUrl = (cardData.poster_url || '').trim();
      const city = isConference ? (cardData.city || '').trim() : '';
      const organizer = isConference ? (cardData.organizer || '').trim() : '';
      const subType = isConference ? (cardData.sub_type || '研讨会').trim() : '';
      const abstractDeadline = isConference ? (cardData.abstract_deadline || '').trim() : '';
      const earlyBirdDeadline = isConference ? (cardData.early_bird_deadline || '').trim() : '';
      const registrationDeadline = isConference ? (cardData.registration_deadline || '').trim() : '';
      const websiteUrl = (cardData.website_url || '').trim();
      const registrationUrl = (cardData.registration_url || '').trim();
      const handbookUrl = (cardData.handbook_url || '').trim();
      const source = (cardData.source || `手动粘贴导入 (${resolverName})`).trim();

      const insertTalkRes = await c.env.DB.prepare(`
        INSERT INTO observatory_talks (
          date, end_date, time, title, speaker, location, poster_url, notes, event_type,
          city, organizer, sub_type, abstract_deadline, early_bird_deadline, registration_deadline,
          website_url, registration_url, handbook_url, source, created_by_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `).bind(
        date,
        effectiveEndDate,
        effectiveTime,
        title,
        speaker,
        location,
        posterUrl,
        notes,
        eventType,
        city,
        organizer,
        subType,
        abstractDeadline,
        earlyBirdDeadline,
        registrationDeadline,
        websiteUrl,
        registrationUrl,
        handbookUrl,
        source,
        user.id || 0
      ).run();

      targetId = insertTalkRes.meta?.last_row_id;
    }

    // 更新 pending_schedule_imports 表状态为 completed
    await c.env.DB.prepare(`
      UPDATE pending_schedule_imports
      SET status = 'completed',
          resolved_by_id = ?,
          resolved_by_name = ?,
          target_type = ?,
          target_id = ?,
          resolved_at = datetime('now')
      WHERE id = ?
    `).bind(
      user.id || 0,
      resolverName,
      targetType,
      targetId || null,
      id
    ).run();

    return c.json({
      success: true,
      message: '已成功审核并正式发布！',
      target_type: targetType,
      target_id: targetId
    });
  } catch (err: any) {
    console.error('Resolve error:', err);
    return c.json({ detail: err.message || '发布入库失败' }, 500);
  }
});

/**
 * 删除/废弃待处理项
 */
app.delete('/:id', async (c) => {
  await ensurePendingImportsTable(c.env.DB);
  const id = Number(c.req.param('id'));
  if (isNaN(id)) {
    return c.json({ detail: '无效的待处理项 ID' }, 400);
  }

  await c.env.DB.prepare('DELETE FROM pending_schedule_imports WHERE id = ?').bind(id).run();
  return c.json({ success: true, message: '待处理条目已移除' });
});

export default app;
