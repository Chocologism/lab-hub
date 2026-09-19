import { Hono } from 'hono';
import { Env, UserRow } from '../types';
import { authMiddleware, adminOnlyMiddleware, seminarManagerMiddleware } from '../middleware/auth';
import { resolveOrCreateSeminarPaper, archiveSeminarPresentationArxiv, extractArxivId } from '../utils/papers';

const app = new Hono<{ Bindings: Env; Variables: { user: UserRow } }>();

app.use('*', authMiddleware);

function getTodayString(): string {
  const d = new Date();
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(d);
}

function getDaysDiff(dateStr: string): number {
  const todayStr = getTodayString();
  const d1 = new Date(`${todayStr}T00:00:00+08:00`);
  const d2 = new Date(`${dateStr}T00:00:00+08:00`);
  return Math.round((d2.getTime() - d1.getTime()) / (86400 * 1000));
}

app.get('/check-arxiv-presented', async (c) => {
  const rawArxiv = c.req.query('arxiv_id') || '';
  const currentSeminarId = c.req.query('current_seminar_id') ? Number(c.req.query('current_seminar_id')) : null;

  const arxivId = extractArxivId(rawArxiv);
  if (!arxivId) {
    return c.json({ presented: false });
  }

  const cleanId = arxivId.replace(/v\d+$/, '');

  // 1. 检索 library_papers 中 from_seminar = 1 的记录
  const libPaper = await c.env.DB.prepare(
    `SELECT id, arxiv_id, title, seminar_id FROM library_papers
     WHERE from_seminar = 1 AND (
       arxiv_id = ? OR arxiv_id = ? OR arxiv_id LIKE ? OR arxiv_id LIKE ?
     ) LIMIT 1`
  ).bind(cleanId, arxivId, `${cleanId}v%`, `arXiv:${cleanId}%`).first<any>();

  if (libPaper) {
    // 若匹配到的正是当前正在编辑的组会排期，则不报重复
    if (currentSeminarId && libPaper.seminar_id && Number(libPaper.seminar_id) === Number(currentSeminarId)) {
      return c.json({ presented: false });
    }
    return c.json({
      presented: true,
      paper: {
        id: libPaper.id,
        arxiv_id: libPaper.arxiv_id,
        title: libPaper.title,
        seminar_id: libPaper.seminar_id
      }
    });
  }

  // 2. 检索 seminar_presentations 中已经填写的 arXiv 记录
  const pres = await c.env.DB.prepare(
    `SELECT sp.id, sp.seminar_id, sp.presenter_name, sp.arxiv_id
     FROM seminar_presentations sp
     WHERE sp.arxiv_id != '' AND (
       sp.arxiv_id = ? OR sp.arxiv_id = ? OR sp.arxiv_id LIKE ? OR sp.arxiv_id LIKE ?
     ) LIMIT 1`
  ).bind(cleanId, arxivId, `${cleanId}v%`, `%${cleanId}%`).first<any>();

  if (pres) {
    if (currentSeminarId && pres.seminar_id && Number(pres.seminar_id) === Number(currentSeminarId)) {
      return c.json({ presented: false });
    }
    return c.json({
      presented: true,
      paper: {
        id: pres.id,
        arxiv_id: pres.arxiv_id,
        title: `arXiv:${pres.arxiv_id}`,
        seminar_id: pres.seminar_id
      }
    });
  }

  return c.json({ presented: false });
});

app.get('/mine/upcoming', async (c) => {
  const user = c.get('user');
  const today = getTodayString();
  const userNames = new Set(
    [user.name, user.real_name, user.nickname]
      .filter(Boolean)
      .map(n => (n as string).trim().toLowerCase())
  );

  const belongs = (presenterId: number | null, presenterName: string | null) => {
    if (presenterId !== null && presenterId !== undefined) {
      return presenterId === user.id;
    }
    if (presenterName) {
      return userNames.has(presenterName.trim().toLowerCase());
    }
    return false;
  };

  const { results: seminars } = await c.env.DB.prepare(
    `SELECT * FROM seminar_schedules 
     WHERE date >= ? AND status != 'cancelled'
     ORDER BY date ASC, time ASC, id ASC`
  ).bind(today).all();

  const { results: presentations } = await c.env.DB.prepare(
    `SELECT p.*, s.date, s.time, s.topic, s.location, s.status
     FROM seminar_presentations p
     JOIN seminar_schedules s ON s.id = p.seminar_id
     WHERE s.date >= ? AND s.status != 'cancelled'
     ORDER BY s.date ASC, s.time ASC, p.position ASC, p.id ASC`
  ).bind(today).all();

  const result: { main: any; arxiv: any } = { main: null, arxiv: null };

  // 匹配下一次主讲
  for (const s of (seminars || [])) {
    if (belongs(s.presenter_id as number, s.presenter_name as string)) {
      const daysUntil = getDaysDiff(s.date as string);
      if (daysUntil >= 0) {
        result.main = {
          id: s.id,
          date: s.date,
          time: s.time || '14:30',
          topic: s.topic,
          location: s.location,
          days_until: daysUntil,
          abstract_missing: !(s.abstract && (s.abstract as string).trim())
        };
        break;
      }
    }
  }

  // 匹配下一次 arXiv 分享
  for (const p of (presentations || [])) {
    if (belongs(p.presenter_id as number, p.presenter_name as string)) {
      const daysUntil = getDaysDiff(p.date as string);
      if (daysUntil >= 0) {
        result.arxiv = {
          id: p.seminar_id,
          presentation_id: p.id,
          date: p.date,
          time: p.time || '14:30',
          topic: p.topic,
          location: p.location,
          days_until: daysUntil,
          papers: [p.arxiv_id || '']
        };
        break;
      }
    }
  }

  return c.json(result);
});

app.get('/reminders', async (c) => {
  const user = c.get('user');
  const today = getTodayString();
  const userNames = new Set(
    [user.name, user.real_name, user.nickname]
      .filter(Boolean)
      .map(n => (n as string).trim().toLowerCase())
  );

  const belongs = (presenterId: number | null, presenterName: string | null) => {
    if (presenterId !== null && presenterId !== undefined) {
      return presenterId === user.id;
    }
    if (presenterName) {
      return userNames.has(presenterName.trim().toLowerCase());
    }
    return false;
  };

  const absSetting = await c.env.DB.prepare("SELECT value FROM system_settings WHERE key = 'abstract_reminder_days'").first<{ value: string }>();
  const arxSetting = await c.env.DB.prepare("SELECT value FROM system_settings WHERE key = 'arxiv_reminder_days'").first<{ value: string }>();
  const absDays = absSetting && !isNaN(parseInt(absSetting.value, 10)) ? parseInt(absSetting.value, 10) : 7;
  const arxDays = arxSetting && !isNaN(parseInt(arxSetting.value, 10)) ? parseInt(arxSetting.value, 10) : 7;

  const remindersList: any[] = [];

  // 1. 主讲人未填摘要提醒（仅当 0 <= daysUntil <= absDays 时提醒）
  const { results: seminars } = await c.env.DB.prepare(
    `SELECT * FROM seminar_schedules 
     WHERE date >= ? AND status = 'upcoming'
     ORDER BY date ASC`
  ).bind(today).all();

  for (const s of (seminars || [])) {
    if (belongs(s.presenter_id as number, s.presenter_name as string)) {
      const daysUntil = getDaysDiff(s.date as string);
      const isMissingAbstract = !(s.abstract && (s.abstract as string).trim());
      if (daysUntil >= 0 && daysUntil <= absDays && isMissingAbstract) {
        remindersList.push({
          id: s.id,
          seminar_id: s.id,
          date: s.date,
          time: s.time || '14:30',
          type: 'abstract',
          topic: s.topic,
          presenter_name: s.presenter_name,
          message: `您在 ${s.date} 的组会主讲汇报尚未填写摘要`
        });
      }
    }
  }

  // 2. arXiv 分享人未填链接提醒（仅当 0 <= daysUntil <= arxDays 时提醒）
  const { results: pres } = await c.env.DB.prepare(
    `SELECT p.*, s.date, s.time, s.topic, s.status
     FROM seminar_presentations p
     JOIN seminar_schedules s ON s.id = p.seminar_id
     WHERE s.date >= ? AND s.status = 'upcoming'
     ORDER BY s.date ASC, p.position ASC`
  ).bind(today).all();

  for (const p of (pres || [])) {
    if (belongs(p.presenter_id as number, p.presenter_name as string)) {
      const daysUntil = getDaysDiff(p.date as string);
      const isMissingArxiv = !(p.arxiv_id && (p.arxiv_id as string).trim());
      if (daysUntil >= 0 && daysUntil <= arxDays && isMissingArxiv) {
        remindersList.push({
          id: `arxiv-${p.seminar_id}-${p.id || p.position}`,
          seminar_id: p.seminar_id,
          presentation_id: p.id,
          position: p.position,
          date: p.date,
          time: p.time || '14:30',
          type: 'arxiv',
          topic: p.topic,
          presenter_name: p.presenter_name,
          message: `您在 ${p.date} 组会的 arXiv 文献分享尚未填报论文编号`
        });
      }
    }
  }

  return c.json(remindersList);
});

app.get('/settings', async (c) => {
  const abs = await c.env.DB.prepare("SELECT value FROM system_settings WHERE key = 'abstract_reminder_days'").first<{ value: string }>();
  const arx = await c.env.DB.prepare("SELECT value FROM system_settings WHERE key = 'arxiv_reminder_days'").first<{ value: string }>();
  return c.json({
    abstract_reminder_days: abs ? parseInt(abs.value, 10) : 7,
    arxiv_reminder_days: arx ? parseInt(arx.value, 10) : 7,
  });
});

app.put('/settings', adminOnlyMiddleware, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const absDays = body.abstract_reminder_days ?? 7;
  const arxDays = body.arxiv_reminder_days ?? 7;

  await c.env.DB.prepare(
    "INSERT INTO system_settings (key, value) VALUES ('abstract_reminder_days', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).bind(String(absDays)).run();

  await c.env.DB.prepare(
    "INSERT INTO system_settings (key, value) VALUES ('arxiv_reminder_days', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).bind(String(arxDays)).run();

  return c.json({
    abstract_reminder_days: absDays,
    arxiv_reminder_days: arxDays,
  });
});

async function getAssociationStatsData(db: any) {
  const { results: users } = await db.prepare('SELECT id, name, real_name, nickname, email FROM users').all();
  const nameMap = new Map<string, { id: number; name: string; email: string }>();

  for (const u of (users || [])) {
    for (const raw of [u.real_name, u.name, u.nickname]) {
      if (raw && typeof raw === 'string' && raw.trim()) {
        const clean = raw.trim().toLowerCase();
        if (!nameMap.has(clean)) {
          nameMap.set(clean, {
            id: u.id as number,
            name: (u.real_name || u.name || '') as string,
            email: (u.email || '') as string,
          });
        }
      }
    }
  }

  const { results: schedules } = await db.prepare('SELECT * FROM seminar_schedules ORDER BY date DESC').all();
  const { results: presentations } = await db.prepare('SELECT * FROM seminar_presentations').all();

  const totalSchedules = schedules ? schedules.length : 0;
  let totalSlots = 0;
  let linkedSlots = 0;
  let unlinkedSlots = 0;
  let matchableSlots = 0;
  let unregisteredSlots = 0;

  const unregisteredNamesSet = new Set<string>();
  const unlinkedDetails: any[] = [];

  const schedMap = new Map<number, any>();
  for (const s of (schedules || [])) {
    schedMap.set(s.id as number, s);
  }

  // 1. 检查主讲人
  let totalPresenterSlots = 0;
  let associatedPresenterSlots = 0;
  let unassociatedPresenterSlots = 0;

  for (const s of (schedules || [])) {
    const pName = ((s.presenter_name as string) || '').trim();
    if (!pName) continue;
    totalSlots++;
    totalPresenterSlots++;
    if (s.presenter_id !== null && s.presenter_id !== undefined) {
      linkedSlots++;
      associatedPresenterSlots++;
    } else {
      unlinkedSlots++;
      unassociatedPresenterSlots++;
      const lowerName = pName.toLowerCase();
      let status = 'unregistered';
      let matchedUserInfo = null;

      if (nameMap.has(lowerName)) {
        matchableSlots++;
        matchedUserInfo = nameMap.get(lowerName);
        status = 'can_match';
      } else {
        unregisteredSlots++;
        unregisteredNamesSet.add(pName);
      }

      unlinkedDetails.push({
        seminar_id: s.id,
        date: s.date,
        time: s.time,
        topic: s.topic,
        role_type: 'main',
        role_label: '主讲人',
        presenter_name: pName,
        status,
        matched_user: matchedUserInfo,
      });
    }
  }

  // 2. 检查 arXiv 分享人
  let totalPresentationSlots = 0;
  let associatedPresentationSlots = 0;
  let unassociatedPresentationSlots = 0;

  for (const p of (presentations || [])) {
    const pName = ((p.presenter_name as string) || '').trim();
    if (!pName) continue;
    totalSlots++;
    totalPresentationSlots++;
    if (p.presenter_id !== null && p.presenter_id !== undefined) {
      linkedSlots++;
      associatedPresentationSlots++;
    } else {
      unlinkedSlots++;
      unassociatedPresentationSlots++;
      const lowerName = pName.toLowerCase();
      const s = schedMap.get(p.seminar_id as number);
      let status = 'unregistered';
      let matchedUserInfo = null;

      if (nameMap.has(lowerName)) {
        matchableSlots++;
        matchedUserInfo = nameMap.get(lowerName);
        status = 'can_match';
      } else {
        unregisteredSlots++;
        unregisteredNamesSet.add(pName);
      }

      unlinkedDetails.push({
        seminar_id: p.seminar_id,
        date: s ? s.date : '',
        time: s ? s.time : '',
        topic: s ? s.topic : '组会分享',
        role_type: 'arxiv',
        role_label: 'arXiv分享人',
        presenter_name: pName,
        status,
        matched_user: matchedUserInfo,
      });
    }
  }

  unlinkedDetails.sort((a, b) => ((b.date || '') as string).localeCompare((a.date || '') as string));

  const sortedUnregistered = Array.from(unregisteredNamesSet).sort();

  return {
    registered_users_count: users ? users.length : 0,
    total_schedules: totalSchedules,
    total_seminars: totalSchedules,
    total_slots: totalSlots,
    total_presenter_slots: totalPresenterSlots,
    associated_presenter_slots: associatedPresenterSlots,
    unassociated_presenter_slots: unassociatedPresenterSlots,
    total_presentation_slots: totalPresentationSlots,
    associated_presentation_slots: associatedPresentationSlots,
    unassociated_presentation_slots: unassociatedPresentationSlots,
    linked_slots: linkedSlots,
    unlinked_slots: unlinkedSlots,
    matchable_slots: matchableSlots,
    unregistered_slots: unregisteredSlots,
    unregistered_names: sortedUnregistered,
    unmatchable_names: sortedUnregistered,
    unmatchable_slots: unregisteredSlots,
    unlinked_details: unlinkedDetails,
  };
}

app.get('/admin/association-stats', adminOnlyMiddleware, async (c) => {
  const stats = await getAssociationStatsData(c.env.DB);
  return c.json(stats);
});

app.post('/admin/batch-match-presenters', adminOnlyMiddleware, async (c) => {
  const { results: users } = await c.env.DB.prepare('SELECT id, name, real_name, nickname FROM users').all();
  const nameMap = new Map<string, number>();

  for (const u of (users || [])) {
    for (const raw of [u.real_name, u.name, u.nickname]) {
      if (raw && typeof raw === 'string' && raw.trim()) {
        const clean = raw.trim().toLowerCase();
        if (!nameMap.has(clean)) {
          nameMap.set(clean, u.id as number);
        }
      }
    }
  }

  // 1. 匹配未关联的主讲人
  const { results: unlinkedSchedules } = await c.env.DB.prepare(
    'SELECT id, presenter_name FROM seminar_schedules WHERE presenter_id IS NULL'
  ).all();

  let matchedSchedules = 0;
  for (const s of (unlinkedSchedules || [])) {
    const pName = ((s.presenter_name as string) || '').trim().toLowerCase();
    if (pName && nameMap.has(pName)) {
      const uid = nameMap.get(pName)!;
      await c.env.DB.prepare('UPDATE seminar_schedules SET presenter_id = ? WHERE id = ?')
        .bind(uid, s.id)
        .run();
      matchedSchedules++;
    }
  }

  // 2. 匹配未关联的 arXiv 分享人
  const { results: unlinkedPresentations } = await c.env.DB.prepare(
    'SELECT id, presenter_name FROM seminar_presentations WHERE presenter_id IS NULL'
  ).all();

  let matchedPresentations = 0;
  for (const p of (unlinkedPresentations || [])) {
    const pName = ((p.presenter_name as string) || '').trim().toLowerCase();
    if (pName && nameMap.has(pName)) {
      const uid = nameMap.get(pName)!;
      await c.env.DB.prepare('UPDATE seminar_presentations SET presenter_id = ? WHERE id = ?')
        .bind(uid, p.id)
        .run();
      matchedPresentations++;
    }
  }

  const stats = await getAssociationStatsData(c.env.DB);

  return c.json({
    matched_schedules: matchedSchedules,
    matched_presentations: matchedPresentations,
    matched_users: matchedSchedules + matchedPresentations,
    matched_presenter_slots: matchedSchedules,
    matched_presentation_slots: matchedPresentations,
    total_matched: matchedSchedules + matchedPresentations,
    message: `已成功关联 ${matchedSchedules} 位主讲人席位与 ${matchedPresentations} 位 arXiv 分享人席位`,
    stats,
  });
});

async function ensureInterestsTable(db: any) {
  try {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS schedule_interests (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        item_type VARCHAR(20) NOT NULL,
        item_id INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, item_type, item_id)
      )
    `).run();
    await db.prepare(`CREATE INDEX IF NOT EXISTS idx_schedule_interests_item ON schedule_interests(item_type, item_id)`).run();
    await db.prepare(`CREATE INDEX IF NOT EXISTS idx_schedule_interests_user ON schedule_interests(user_id)`).run();
  } catch (e) {
    // Ignore race condition or existing table
  }
}

app.post('/interest-toggle', async (c) => {
  const user = c.get('user');
  if (!user?.id) {
    return c.json({ detail: '请先登录' }, 401);
  }
  const body = await c.req.json().catch(() => ({}));
  const itemType = (body.item_type || body.type || '').trim().toLowerCase();
  const itemId = Number(body.item_id || body.id);

  if (!['seminar', 'talk', 'conference'].includes(itemType) || !Number.isInteger(itemId) || itemId <= 0) {
    return c.json({ detail: '无效的日程参数' }, 400);
  }

  await ensureInterestsTable(c.env.DB);

  if (itemType === 'seminar') {
    const sem = await c.env.DB.prepare('SELECT id FROM seminar_schedules WHERE id = ?').bind(itemId).first();
    if (!sem) return c.json({ detail: '未找到对应组会日程' }, 404);
  } else {
    const talk = await c.env.DB.prepare('SELECT id, event_type FROM observatory_talks WHERE id = ?').bind(itemId).first();
    if (!talk) return c.json({ detail: '未找到对应学术日程' }, 404);
  }

  const interestTypes = (itemType === 'talk' || itemType === 'conference') ? ['talk', 'conference'] : [itemType];
  const existing = await c.env.DB.prepare(
    `SELECT item_type FROM schedule_interests WHERE user_id = ? AND item_id = ? AND item_type IN (${interestTypes.map(() => '?').join(',')})`
  ).bind(user.id, itemId, ...interestTypes).first<{ item_type: string }>();

  let isInterested = false;
  if (existing) {
    await c.env.DB.prepare(
      `DELETE FROM schedule_interests WHERE user_id = ? AND item_id = ? AND item_type IN (${interestTypes.map(() => '?').join(',')})`
    ).bind(user.id, itemId, ...interestTypes).run();
    isInterested = false;
  } else {
    await c.env.DB.prepare(
      'INSERT INTO schedule_interests (user_id, item_type, item_id) VALUES (?, ?, ?)'
    ).bind(user.id, itemType, itemId).run();
    isInterested = true;
  }

  const countRes = await c.env.DB.prepare(
    `SELECT COUNT(*) as count FROM schedule_interests WHERE item_id = ? AND item_type IN (${interestTypes.map(() => '?').join(',')})`
  ).bind(itemId, ...interestTypes).first<{ count: number }>();

  return c.json({
    success: true,
    item_type: itemType,
    item_id: itemId,
    is_interested: isInterested,
    interest_count: Number(countRes?.count || 0)
  });
});

app.get('', async (c) => {
  const user = c.get('user');
  await ensureInterestsTable(c.env.DB);

  // 批量并发查询：组会、分享列表、论文元数据、感兴趣统计以及注册用户（支持自动姓名关联）
  const [seminarsRes, presentationsRes, papersRes, interestsRes, usersRes] = await Promise.all([
    c.env.DB.prepare('SELECT * FROM seminar_schedules ORDER BY date ASC, time ASC').all(),
    c.env.DB.prepare('SELECT * FROM seminar_presentations ORDER BY seminar_id ASC, position ASC, id ASC').all(),
    c.env.DB.prepare('SELECT id, arxiv_id, title, authors, journal, primary_category, published_date, pdf_url, source_url FROM arxiv_papers').all(),
    c.env.DB.prepare(`
      SELECT item_id, COUNT(*) as count,
             MAX(CASE WHEN user_id = ? THEN 1 ELSE 0 END) as user_interested
      FROM schedule_interests
      WHERE item_type = 'seminar'
      GROUP BY item_id
    `).bind(user?.id || 0).all().catch(() => ({ results: [] })),
    c.env.DB.prepare('SELECT id, name, real_name, nickname FROM users').all().catch(() => ({ results: [] })),
  ]);

  const userByName = new Map<string, number>();
  for (const u of ((usersRes?.results || []) as any[])) {
    for (const raw of [u.real_name, u.name, u.nickname]) {
      if (raw && typeof raw === 'string' && raw.trim()) {
        const clean = raw.trim().toLowerCase();
        if (!userByName.has(clean)) userByName.set(clean, u.id as number);
      }
    }
  }

  const presentationsMap = new Map<number, any[]>();
  for (const p of ((presentationsRes.results || []) as any[])) {
    const sid = p.seminar_id;
    if (!presentationsMap.has(sid)) presentationsMap.set(sid, []);
    let pid = p.presenter_id;
    if (!pid && p.presenter_name) {
      const clean = p.presenter_name.trim().toLowerCase();
      if (userByName.has(clean)) pid = userByName.get(clean);
    }
    presentationsMap.get(sid)!.push({ ...p, presenter_id: pid });
  }

  const papersMap = new Map<number, any>();
  for (const p of ((papersRes.results || []) as any[])) {
    papersMap.set(p.id, p);
  }

  const interestsMap = new Map<number, { count: number; is_interested: boolean }>();
  for (const row of ((interestsRes?.results || []) as any[])) {
    interestsMap.set(Number(row.item_id), {
      count: Number(row.count || 0),
      is_interested: Boolean(row.user_interested)
    });
  }

  const list = ((seminarsRes.results || []) as any[]).map(s => {
    const interest = interestsMap.get(s.id) || { count: 0, is_interested: false };
    let pid = s.presenter_id;
    if (!pid && s.presenter_name) {
      const clean = s.presenter_name.trim().toLowerCase();
      if (userByName.has(clean)) pid = userByName.get(clean);
    }
    return {
      ...s,
      presenter_id: pid,
      paper: s.paper_id ? (papersMap.get(s.paper_id) || null) : null,
      presentations: presentationsMap.get(s.id) || [],
      interest_count: interest.count,
      is_interested: interest.is_interested,
    };
  });

  return c.json(list);
});

app.post('', seminarManagerMiddleware, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const date = (body.date || '').trim();
  const time = (body.time || '14:30').trim();
  const location = (body.location || '物理楼研讨室 / 腾讯会议').trim();
  const presenter_name = (body.presenter_name || '').trim();
  const topic = (body.topic || '').trim();
  const notes = body.notes || '';
  const slides_url = body.slides_url || '';
  const status = body.status || 'upcoming';

  if (!date || !topic || !presenter_name) {
    return c.json({ detail: '日期、主题与主讲人均为必填项' }, 400);
  }

  // Check if presenter matches any registered user
  const matchedUser = await c.env.DB.prepare(
    'SELECT id FROM users WHERE name = ? OR real_name = ?'
  ).bind(presenter_name, presenter_name).first<{ id: number }>();
  const presenter_id = body.presenter_id || matchedUser?.id || null;

  // 主讲人不再提交关联文献，组会文献仅由 arXiv 分享生成
  const paper_id = null;

  const res = await c.env.DB.prepare(
    `INSERT INTO seminar_schedules (date, time, location, presenter_id, presenter_name, topic, paper_id, slides_url, notes, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
  ).bind(date, time, location, presenter_id, presenter_name, topic, paper_id, slides_url, notes, status).run();

  const newId = res.meta.last_row_id as number;

  // Insert presentations if provided & archive valid arxiv presentations
  if (Array.isArray(body.presentations)) {
    for (let i = 0; i < body.presentations.length; i++) {
      const p = body.presentations[i];
      const pName = (p.presenter_name || '').trim();
      const pArxiv = (p.arxiv_id || '').trim();
      const pSlides = p.slides_url || '';
      const pUser = await c.env.DB.prepare('SELECT id FROM users WHERE name = ? OR real_name = ?').bind(pName, pName).first<{ id: number }>();
      const pId = p.presenter_id || pUser?.id || null;
      await c.env.DB.prepare(
        `INSERT INTO seminar_presentations (seminar_id, position, presenter_name, arxiv_id, slides_url, presenter_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
      ).bind(newId, i, pName, pArxiv, pSlides, pId).run();

      if (pArxiv) {
        await archiveSeminarPresentationArxiv(c.env.DB, pArxiv, newId, pId, pName);
      }
    }
  }

  const created = await c.env.DB.prepare('SELECT * FROM seminar_schedules WHERE id = ?').bind(newId).first<any>();
  const { results: presentations } = await c.env.DB.prepare('SELECT * FROM seminar_presentations WHERE seminar_id = ? ORDER BY position ASC').bind(newId).all();
  const paper = created?.paper_id ? await c.env.DB.prepare('SELECT id, arxiv_id, title, authors, journal, primary_category, published_date, pdf_url, source_url FROM arxiv_papers WHERE id = ?').bind(created.paper_id).first() : null;

  return c.json({ ...created, paper, presentations: presentations || [] });
});

app.put('/:id', async (c) => {
  const user = c.get('user');
  const id = parseInt(c.req.param('id'), 10);
  const body = await c.req.json().catch(() => ({}));

  const existing = await c.env.DB.prepare('SELECT * FROM seminar_schedules WHERE id = ?').bind(id).first<any>();
  if (!existing) {
    return c.json({ detail: '组会不存在' }, 404);
  }

  const isManager = user && (user.role === 'admin' || user.role === 'teacher' || Boolean(user.can_manage_seminars));
  const isPresenter = user && (
    (existing.presenter_id && existing.presenter_id === user.id) ||
    (existing.presenter_name && (
      existing.presenter_name.trim().toLowerCase() === (user.real_name || '').trim().toLowerCase() ||
      existing.presenter_name.trim().toLowerCase() === (user.name || '').trim().toLowerCase()
    ))
  );

  if (!isManager && !isPresenter) {
    return c.json({ detail: '你没有修改该组会的权限，请联系管理员或主讲人' }, 403);
  }

  const date = body.date !== undefined ? body.date.trim() : existing.date;
  const time = body.time !== undefined ? body.time.trim() : existing.time;
  const location = body.location !== undefined ? body.location.trim() : existing.location;
  const presenter_name = body.presenter_name !== undefined ? body.presenter_name.trim() : existing.presenter_name;
  const topic = body.topic !== undefined ? body.topic.trim() : existing.topic;
  const notes = body.notes !== undefined ? body.notes : existing.notes;
  const slides_url = body.slides_url !== undefined ? body.slides_url : existing.slides_url;
  const status = body.status !== undefined ? body.status : existing.status;
  const abstract = body.abstract !== undefined ? body.abstract : existing.abstract;

  let presenter_id = body.presenter_id;
  if (!presenter_id && presenter_name) {
    const matched = await c.env.DB.prepare('SELECT id FROM users WHERE name = ? OR real_name = ?').bind(presenter_name, presenter_name).first<{ id: number }>();
    presenter_id = matched?.id || existing.presenter_id || null;
  }

  // 主讲人不再修改关联文献，保留历史已关联的 paper_id（如有）
  const paper_id = existing.paper_id || null;

  await c.env.DB.prepare(
    `UPDATE seminar_schedules 
     SET date = ?, time = ?, location = ?, presenter_id = ?, presenter_name = ?, topic = ?, paper_id = ?, slides_url = ?, notes = ?, status = ?, abstract = ?
     WHERE id = ?`
  ).bind(date, time, location, presenter_id, presenter_name, topic, paper_id, slides_url, notes, status, abstract, id).run();

  if (Array.isArray(body.presentations)) {
    await c.env.DB.prepare('DELETE FROM seminar_presentations WHERE seminar_id = ?').bind(id).run();
    for (let i = 0; i < body.presentations.length; i++) {
      const p = body.presentations[i];
      const pName = (p.presenter_name || '').trim();
      const pArxiv = (p.arxiv_id || '').trim();
      const pSlides = p.slides_url || '';
      const pUser = await c.env.DB.prepare('SELECT id FROM users WHERE name = ? OR real_name = ?').bind(pName, pName).first<{ id: number }>();
      const pId = p.presenter_id || pUser?.id || null;
      await c.env.DB.prepare(
        `INSERT INTO seminar_presentations (seminar_id, position, presenter_name, arxiv_id, slides_url, presenter_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
      ).bind(id, i, pName, pArxiv, pSlides, pId).run();

      if (pArxiv) {
        await archiveSeminarPresentationArxiv(c.env.DB, pArxiv, id, pId, pName);
      }
    }
  }

  const updated = await c.env.DB.prepare('SELECT * FROM seminar_schedules WHERE id = ?').bind(id).first<any>();
  const { results: presentations } = await c.env.DB.prepare('SELECT * FROM seminar_presentations WHERE seminar_id = ? ORDER BY position ASC').bind(id).all();
  const paper = updated?.paper_id ? await c.env.DB.prepare('SELECT id, arxiv_id, title, authors, journal, primary_category, published_date, pdf_url, source_url FROM arxiv_papers WHERE id = ?').bind(updated.paper_id).first() : null;

  return c.json({ ...updated, paper, presentations: presentations || [] });
});

async function handlePresentationShare(c: any) {
  const user = c.get('user');
  const seminarId = parseInt(c.req.param('id'), 10);
  const body = await c.req.json().catch(() => ({}));

  const seminar = await c.env.DB.prepare('SELECT * FROM seminar_schedules WHERE id = ?').bind(seminarId).first<any>();
  if (!seminar) {
    return c.json({ detail: '组会不存在' }, 404);
  }
  if (seminar.status === 'cancelled') {
    return c.json({ detail: '组会已取消' }, 400);
  }

  const { results: presentations } = await c.env.DB.prepare(
    'SELECT * FROM seminar_presentations WHERE seminar_id = ? ORDER BY position ASC, id ASC'
  ).bind(seminarId).all<any>();

  const isMgr = user && (user.role === 'admin' || user.role === 'teacher' || Boolean(user.can_manage_seminars));
  const userNames = [user?.real_name, user?.name, user?.nickname].filter(Boolean).map(n => String(n).trim().toLowerCase());

  let targetPres: any = null;
  for (const p of (presentations || [])) {
    if (body.presentation_id !== undefined && body.presentation_id !== null && p.id === Number(body.presentation_id)) {
      targetPres = p;
      break;
    } else if (body.presentation_id === undefined || body.presentation_id === null) {
      const pName = (p.presenter_name || '').trim().toLowerCase();
      if ((p.presenter_id && p.presenter_id === user?.id) || (pName && userNames.includes(pName))) {
        targetPres = p;
        break;
      }
    }
  }

  if (!targetPres) {
    if (isMgr && presentations && presentations.length > 0) {
      targetPres = presentations.find((p: any) => !(p.arxiv_id || '').trim()) || presentations[0];
    } else {
      return c.json({ detail: '未在该组会中找到对应的文献分享人记录' }, 404);
    }
  }

  const targetPresName = (targetPres.presenter_name || '').trim().toLowerCase();
  const isOwner = (targetPres.presenter_id && targetPres.presenter_id === user?.id) || (targetPresName && userNames.includes(targetPresName));

  if (!isMgr && !isOwner) {
    return c.json({ detail: '只有该文献分享人本人或管理员可以修改分享内容' }, 403);
  }

  const arxivId = body.arxiv_id !== undefined ? String(body.arxiv_id).trim() : (targetPres.arxiv_id || '');
  const slidesUrl = body.slides_url !== undefined ? String(body.slides_url).trim() : (targetPres.slides_url || '');

  await c.env.DB.prepare(
    'UPDATE seminar_presentations SET arxiv_id = ?, slides_url = ?, presenter_id = COALESCE(presenter_id, ?) WHERE id = ?'
  ).bind(arxivId, slidesUrl, user?.id || null, targetPres.id).run();

  // 若填写了 arXiv 编号，自动归档至文献库 library_papers 并绑定 seminar_id
  if (arxivId) {
    const sharerId = targetPres.presenter_id || user?.id || null;
    const sharerName = targetPres.presenter_name || user?.name || null;
    await archiveSeminarPresentationArxiv(c.env.DB, arxivId, seminarId, sharerId, sharerName);
  }

  const updated = await c.env.DB.prepare('SELECT * FROM seminar_schedules WHERE id = ?').bind(seminarId).first<any>();
  const { results: updatedPres } = await c.env.DB.prepare(
    'SELECT * FROM seminar_presentations WHERE seminar_id = ? ORDER BY position ASC, id ASC'
  ).bind(seminarId).all();

  return c.json({ ...updated, presentations: updatedPres || [] });
}

app.put('/:id/presentation-share', async (c) => handlePresentationShare(c));
app.put('/:id/presentation-arxiv', async (c) => handlePresentationShare(c));

app.delete('/:id', seminarManagerMiddleware, async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  await c.env.DB.prepare('DELETE FROM seminar_presentations WHERE seminar_id = ?').bind(id).run();
  await c.env.DB.prepare('DELETE FROM seminar_schedules WHERE id = ?').bind(id).run();
  return c.json({ message: '组会已成功删除' });
});

app.put('/:id/topic', async (c) => {
  const user = c.get('user');
  const id = parseInt(c.req.param('id'), 10);
  const body = await c.req.json().catch(() => ({}));
  const topic = (body.topic || '').trim();

  if (!topic) {
    return c.json({ detail: '汇报主题不能为空' }, 400);
  }

  const existing = await c.env.DB.prepare('SELECT * FROM seminar_schedules WHERE id = ?').bind(id).first<any>();
  if (!existing) {
    return c.json({ detail: '组会不存在' }, 404);
  }

  const isManager = user && (user.role === 'admin' || user.role === 'teacher' || Boolean(user.can_manage_seminars));
  const isPresenter = user && (
    (existing.presenter_id && existing.presenter_id === user.id) ||
    (existing.presenter_name && (
      existing.presenter_name.trim().toLowerCase() === (user.real_name || '').trim().toLowerCase() ||
      existing.presenter_name.trim().toLowerCase() === (user.name || '').trim().toLowerCase()
    ))
  );

  if (!isManager && !isPresenter) {
    return c.json({ detail: '你没有修改该组会标题的权限' }, 403);
  }

  await c.env.DB.prepare('UPDATE seminar_schedules SET topic = ? WHERE id = ?').bind(topic, id).run();
  const updated = await c.env.DB.prepare('SELECT * FROM seminar_schedules WHERE id = ?').bind(id).first();
  const { results: presentations } = await c.env.DB.prepare('SELECT * FROM seminar_presentations WHERE seminar_id = ? ORDER BY position ASC').bind(id).all();
  return c.json({ ...updated, presentations: presentations || [] });
});

app.put('/:id/abstract', async (c) => {
  const user = c.get('user');
  const id = parseInt(c.req.param('id'), 10);
  const body = await c.req.json().catch(() => ({}));
  const abstract = (body.abstract || '').trim();
  const topic = body.topic !== undefined ? (body.topic || '').trim() : undefined;

  const existing = await c.env.DB.prepare('SELECT * FROM seminar_schedules WHERE id = ?').bind(id).first<any>();
  if (!existing) {
    return c.json({ detail: '组会不存在' }, 404);
  }

  const isManager = user && (user.role === 'admin' || user.role === 'teacher' || Boolean(user.can_manage_seminars));
  const isPresenter = user && (
    (existing.presenter_id && existing.presenter_id === user.id) ||
    (existing.presenter_name && (
      existing.presenter_name.trim().toLowerCase() === (user.real_name || '').trim().toLowerCase() ||
      existing.presenter_name.trim().toLowerCase() === (user.name || '').trim().toLowerCase()
    ))
  );

  if (!isManager && !isPresenter) {
    return c.json({ detail: '你没有修改该组会摘要的权限' }, 403);
  }

  if (topic !== undefined && topic) {
    await c.env.DB.prepare('UPDATE seminar_schedules SET abstract = ?, topic = ? WHERE id = ?').bind(abstract, topic, id).run();
  } else {
    await c.env.DB.prepare('UPDATE seminar_schedules SET abstract = ? WHERE id = ?').bind(abstract, id).run();
  }

  const updated = await c.env.DB.prepare('SELECT * FROM seminar_schedules WHERE id = ?').bind(id).first();
  const { results: presentations } = await c.env.DB.prepare('SELECT * FROM seminar_presentations WHERE seminar_id = ? ORDER BY position ASC').bind(id).all();
  return c.json({ ...updated, presentations: presentations || [] });
});

app.post('/batch-location', seminarManagerMiddleware, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const location = (body.location || '').trim();
  const scope = body.scope || 'upcoming';

  if (!location) {
    return c.json({ detail: '请提供有效的会议号或地点' }, 400);
  }

  let query = "UPDATE seminar_schedules SET location = ? WHERE status != 'cancelled'";
  const binds: any[] = [location];

  if (scope === 'upcoming') {
    query += " AND status = 'upcoming'";
  } else if (scope === 'unset_only') {
    query += " AND (location IS NULL OR location = '' OR location = '待定')";
  } else if (scope !== 'all') {
    return c.json({ detail: `未知的作用范围: ${scope}` }, 400);
  }

  const res = await c.env.DB.prepare(query).bind(...binds).run();
  const affected = res.meta?.changes ?? 0;

  return c.json({
    message: `已将会议号成功应用至 ${affected} 场组会`,
    updated_count: affected,
    location
  });
});

async function handlePostponeCascade(c: any, seminarIdParam?: string) {
  const body = await c.req.json().catch(() => ({}));
  const seminarId = seminarIdParam || body.seminar_id || body.id;
  const days = Number(body.days) || 7;

  const target = await c.env.DB.prepare('SELECT * FROM seminar_schedules WHERE id = ?').bind(seminarId).first<{ date: string }>();
  if (!target) return c.json({ detail: '未找到指定组会' }, 404);

  // Shift all upcoming seminars >= target.date by days
  const res = await c.env.DB.prepare(
    `UPDATE seminar_schedules 
     SET date = date(date, '+' || ? || ' days')
     WHERE date >= ? AND status = 'upcoming'`
  ).bind(days, target.date).run();

  const affected = res.meta?.changes ?? 0;
  return c.json({ message: `已成功顺延 ${affected} 场组会（顺延 ${days} 天）`, affected_count: affected });
}

app.post('/postpone-cascade', seminarManagerMiddleware, async (c) => handlePostponeCascade(c));
app.post('/:id/postpone-cascade', seminarManagerMiddleware, async (c) => handlePostponeCascade(c, c.req.param('id')));

app.post('/swap', seminarManagerMiddleware, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const id1 = body.id1;
  const id2 = body.id2;

  const s1 = await c.env.DB.prepare('SELECT * FROM seminar_schedules WHERE id = ?').bind(id1).first();
  const s2 = await c.env.DB.prepare('SELECT * FROM seminar_schedules WHERE id = ?').bind(id2).first();
  if (!s1 || !s2) return c.json({ detail: '指定的组会不存在' }, 404);

  // Swap dates and times
  await c.env.DB.prepare('UPDATE seminar_schedules SET date = ?, time = ? WHERE id = ?').bind(s2.date, s2.time, id1).run();
  await c.env.DB.prepare('UPDATE seminar_schedules SET date = ?, time = ? WHERE id = ?').bind(s1.date, s1.time, id2).run();

  return c.json({ message: '两场组会时间已成功对调' });
});

export default app;
