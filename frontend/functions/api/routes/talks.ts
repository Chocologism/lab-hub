import { Hono } from 'hono';
import { Env, UserRow } from '../types';
import { authMiddleware } from '../middleware/auth';

const app = new Hono<{ Bindings: Env; Variables: { user: UserRow } }>();

app.use('*', authMiddleware);

function normalizeTitle(t: string): string {
  return (t || '')
    .replace(/^[【\[](?:学术报告|通知|讲座|报告|天体物理中心)[\]】]\s*/i, '')
    .replace(/[《》""''“”‘’\s，。、：:；;！!？?·•\-—_]/g, '')
    .toLowerCase();
}

function normalizeSpeaker(s: string): string {
  return (s || '').replace(/[\s·•（）()\[\]]/g, '').toLowerCase();
}

let columnsEnsured = false;
async function ensureTalksColumns(db: any) {
  if (columnsEnsured) return;
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
    "updated_at TEXT DEFAULT ''"
  ];
  for (const col of cols) {
    try {
      await db.prepare(`ALTER TABLE observatory_talks ADD COLUMN ${col}`).run();
    } catch {}
  }
  columnsEnsured = true;
}

app.get('', async (c) => {
  const user = c.get('user');
  await ensureTalksColumns(c.env.DB);
  const [rawTalksRes, interestsRes] = await Promise.all([
    c.env.DB.prepare('SELECT * FROM observatory_talks ORDER BY date ASC, time ASC, id ASC').all(),
    c.env.DB.prepare(`
      SELECT item_id, COUNT(*) as count,
             MAX(CASE WHEN user_id = ? THEN 1 ELSE 0 END) as user_interested
      FROM schedule_interests
      WHERE item_type IN ('talk', 'conference')
      GROUP BY item_id
    `).bind(user?.id || 0).all().catch(() => ({ results: [] })),
  ]);

  const interestsMap = new Map<number, { count: number; is_interested: boolean }>();
  for (const row of ((interestsRes?.results || []) as any[])) {
    interestsMap.set(Number(row.item_id), {
      count: Number(row.count || 0),
      is_interested: Boolean(row.user_interested)
    });
  }

  const rawTalks = ((rawTalksRes.results || []) as any[]).map(t => {
    const interest = interestsMap.get(t.id) || { count: 0, is_interested: false };
    return {
      ...t,
      interest_count: interest.count,
      is_interested: interest.is_interested,
    };
  });

  const talks = rawTalks;
  const mergedList: any[] = [];
  const idsToDelete: number[] = [];
  const itemsToUpdate: any[] = [];

  for (const item of talks) {
    const itemNormTitle = normalizeTitle(item.title as string);
    const itemNormSpeaker = normalizeSpeaker(item.speaker as string);

    // Look for duplicate in mergedList with same date
    const duplicate = mergedList.find(m => {
      if (m.date !== item.date) return false;
      if ((m.event_type || 'talk') !== (item.event_type || 'talk')) return false;
      const mNormTitle = normalizeTitle(m.title as string);
      const mNormSpeaker = normalizeSpeaker(m.speaker as string);

      if (itemNormTitle && mNormTitle && (itemNormTitle === mNormTitle || itemNormTitle.includes(mNormTitle) || mNormTitle.includes(itemNormTitle))) {
        return true;
      }
      if (itemNormSpeaker && mNormSpeaker && (itemNormSpeaker === mNormSpeaker || (itemNormSpeaker.length >= 2 && (itemNormSpeaker.includes(mNormSpeaker) || mNormSpeaker.includes(itemNormSpeaker))))) {
        return true;
      }
      return false;
    });

    if (duplicate) {
      idsToDelete.push(Number(item.id));
      if ((item.title || '').length > (duplicate.title || '').length) duplicate.title = item.title;
      if ((item.speaker || '').length > (duplicate.speaker || '').length) duplicate.speaker = item.speaker;
      if ((item.location || '').length > (duplicate.location || '').length) duplicate.location = item.location;
      if (!duplicate.poster_url && item.poster_url) duplicate.poster_url = item.poster_url;
      if (!duplicate.end_date && item.end_date) duplicate.end_date = item.end_date;
      duplicate.event_type = duplicate.event_type || item.event_type || 'talk';
      duplicate.interest_count = Math.max(duplicate.interest_count || 0, item.interest_count || 0);
      duplicate.is_interested = Boolean(duplicate.is_interested || item.is_interested);

      const itemNotes = (item.notes || '').trim();
      let dupNotes = (duplicate.notes || '').trim();
      if (itemNotes && !dupNotes.includes(itemNotes.slice(0, 30))) {
        dupNotes = dupNotes ? `${dupNotes}\n\n[补充/更新信息]\n${itemNotes}` : itemNotes;
        duplicate.notes = dupNotes;
      }
      itemsToUpdate.push(duplicate);
    } else {
      mergedList.push({ ...item });
    }
  }

  // If duplicates were found in DB, auto-heal D1
  if (idsToDelete.length > 0) {
    try {
      const stmts = [];
      for (const upd of itemsToUpdate) {
        stmts.push(
          c.env.DB.prepare(
            'UPDATE observatory_talks SET title = ?, speaker = ?, location = ?, poster_url = ?, notes = ?, end_date = ?, event_type = ? WHERE id = ?'
          ).bind(upd.title, upd.speaker, upd.location, upd.poster_url, upd.notes, upd.end_date || '', upd.event_type || 'talk', upd.id)
        );
      }
      for (const delId of idsToDelete) {
        stmts.push(c.env.DB.prepare('DELETE FROM observatory_talks WHERE id = ?').bind(delId));
      }
      c.executionCtx.waitUntil(c.env.DB.batch(stmts));
    } catch (e) {
      console.error('Error auto-healing talks duplicates in DB:', e);
    }
  }

  return c.json(mergedList);
});

app.post('', async (c) => {
  const user = c.get('user');
  await ensureTalksColumns(c.env.DB);
  const body = await c.req.json().catch(() => ({}));

  const date = (body.date || '').trim();
  const end_date = (body.end_date || '').trim();
  const event_type = (body.event_type || 'talk').trim();
  const time = (body.time || (event_type === 'conference' ? '全天' : '')).trim();
  const title = (body.title || '').trim();
  const speaker = (body.speaker || '').trim();
  const location = (body.location || '').trim();
  const poster_url = (body.poster_url || '').trim();
  const notes = (body.notes || '').trim();
  const city = (body.city || '').trim();
  const organizer = (body.organizer || '').trim();
  const sub_type = (body.sub_type || '').trim();
  const abstract_deadline = (body.abstract_deadline || '').trim();
  const early_bird_deadline = (body.early_bird_deadline || '').trim();
  const registration_deadline = (body.registration_deadline || '').trim();
  const website_url = (body.website_url || '').trim();
  const registration_url = (body.registration_url || '').trim();
  const handbook_url = (body.handbook_url || '').trim();
  const source = (body.source || '').trim();

  if (!date || !title) {
    return c.json({ detail: '日期与标题均为必填项' }, 400);
  }
  if (event_type !== 'conference' && !time) {
    return c.json({ detail: '报告时间为必填项' }, 400);
  }

  // 查重逻辑
  let matchedExisting: any = null;
  if (event_type === 'conference') {
    const { results: existingConfs } = await c.env.DB.prepare(
      "SELECT * FROM observatory_talks WHERE event_type = 'conference' AND (date = ? || title = ?)"
    ).bind(date, title).all();
    matchedExisting = (existingConfs || []).find((item: any) => {
      const itemNormTitle = normalizeTitle(item.title as string);
      const normNewTitle = normalizeTitle(title);
      return (item.date === date && (item.end_date || item.date) === (end_date || date)) || (itemNormTitle && itemNormTitle === normNewTitle);
    });
  } else {
    const { results: existingSameDate } = await c.env.DB.prepare(
      "SELECT * FROM observatory_talks WHERE date = ? AND (event_type IS NULL || event_type != 'conference')"
    ).bind(date).all();

    const normNewTitle = normalizeTitle(title);
    const normNewSpeaker = normalizeSpeaker(speaker);

    for (const item of (existingSameDate || [])) {
      const itemNormTitle = normalizeTitle(item.title as string);
      const itemNormSpeaker = normalizeSpeaker(item.speaker as string);

      // 1. 完全相同或子集包含关系（标题核心相符）
      if (normNewTitle && itemNormTitle && (normNewTitle === itemNormTitle || normNewTitle.includes(itemNormTitle) || itemNormTitle.includes(normNewTitle))) {
        matchedExisting = item;
        break;
      }
      // 2. 同一天相同主讲人且任一方包含对方
      if (normNewSpeaker && itemNormSpeaker && (normNewSpeaker === itemNormSpeaker || (normNewSpeaker.length >= 2 && (normNewSpeaker.includes(itemNormSpeaker) || itemNormSpeaker.includes(normNewSpeaker))))) {
        matchedExisting = item;
        break;
      }
    }

    if (!matchedExisting && normNewTitle && normNewTitle.length >= 6) {
      const { results: allTalks } = await c.env.DB.prepare(
        "SELECT * FROM observatory_talks WHERE (event_type IS NULL || event_type != 'conference')"
      ).all();
      for (const item of (allTalks || [])) {
        const itemNormTitle = normalizeTitle(item.title as string);
        if (itemNormTitle && (normNewTitle === itemNormTitle || normNewTitle.includes(itemNormTitle) || itemNormTitle.includes(normNewTitle))) {
          matchedExisting = item;
          break;
        }
      }
    }
  }

  if (matchedExisting) {
    const oldTitle = (matchedExisting.title as string || '').trim();
    const oldDate = (matchedExisting.date as string || '').trim();
    const oldEndDate = (matchedExisting.end_date as string || '').trim();
    const oldTime = (matchedExisting.time as string || '').trim();
    const oldSpeaker = (matchedExisting.speaker as string || '').trim();
    const oldLocation = (matchedExisting.location as string || '').trim();
    const oldNotes = (matchedExisting.notes as string || '').trim();
    const oldPoster = (matchedExisting.poster_url as string || '').trim();
    const oldEventType = (matchedExisting.event_type as string || 'talk').trim();

    const newTime = time || (event_type === 'conference' ? (oldTime || '全天') : oldTime);
    const newEndDate = end_date || (event_type === 'conference' ? (oldEndDate || date) : oldEndDate);

    const isChanged = (
      (title && title !== oldTitle) ||
      (date && date !== oldDate) ||
      (newTime && newTime !== oldTime) ||
      (speaker && speaker !== oldSpeaker) ||
      (location && location !== oldLocation) ||
      (notes && notes !== oldNotes) ||
      (poster_url && poster_url !== oldPoster) ||
      (newEndDate && newEndDate !== oldEndDate) ||
      (event_type !== oldEventType) ||
      (city && city !== (matchedExisting.city || '')) ||
      (organizer && organizer !== (matchedExisting.organizer || '')) ||
      (sub_type && sub_type !== (matchedExisting.sub_type || '')) ||
      (abstract_deadline && abstract_deadline !== (matchedExisting.abstract_deadline || '')) ||
      (early_bird_deadline && early_bird_deadline !== (matchedExisting.early_bird_deadline || '')) ||
      (registration_deadline && registration_deadline !== (matchedExisting.registration_deadline || '')) ||
      (website_url && website_url !== (matchedExisting.website_url || '')) ||
      (registration_url && registration_url !== (matchedExisting.registration_url || '')) ||
      (handbook_url && handbook_url !== (matchedExisting.handbook_url || '')) ||
      (source && source !== (matchedExisting.source || ''))
    );

    if (isChanged) {
      const mergedTime = newTime || oldTime;
      const mergedEndDate = newEndDate || oldEndDate;
      const mergedSpeaker = speaker;
      const mergedLocation = location;
      const mergedPoster = poster_url || oldPoster;
      const mergedTitle = title || oldTitle;
      const mergedNotes = notes || oldNotes;

      await c.env.DB.prepare(
        `UPDATE observatory_talks 
         SET date = ?, end_date = ?, time = ?, event_type = ?, title = ?, speaker = ?, location = ?, poster_url = ?, notes = ?,
             city = ?, organizer = ?, sub_type = ?, abstract_deadline = ?, early_bird_deadline = ?, registration_deadline = ?,
             website_url = ?, registration_url = ?, handbook_url = ?, source = ?, updated_at = datetime('now')
         WHERE id = ?`
      ).bind(
        date, mergedEndDate, mergedTime, event_type, mergedTitle, mergedSpeaker, mergedLocation, mergedPoster, mergedNotes,
        city || matchedExisting.city || '',
        organizer || matchedExisting.organizer || '',
        sub_type || matchedExisting.sub_type || '',
        abstract_deadline || matchedExisting.abstract_deadline || '',
        early_bird_deadline || matchedExisting.early_bird_deadline || '',
        registration_deadline || matchedExisting.registration_deadline || '',
        website_url || matchedExisting.website_url || '',
        registration_url || matchedExisting.registration_url || '',
        handbook_url || matchedExisting.handbook_url || '',
        source || matchedExisting.source || '',
        matchedExisting.id
      ).run();
    }

    const updated = await c.env.DB.prepare('SELECT * FROM observatory_talks WHERE id = ?').bind(matchedExisting.id).first();
    return c.json({
      ...updated,
      merged: true,
      replaced: isChanged,
      updated: isChanged,
      message: isChanged ? '检测到重复日程，已用最新推送更新替换！' : '检测到相同日程，已确认无变更'
    });
  }

  const effectiveTime = time || (event_type === 'conference' ? '全天' : '14:30');
  const effectiveEndDate = end_date || (event_type === 'conference' ? date : '');

  const res = await c.env.DB.prepare(
    `INSERT INTO observatory_talks (
      date, end_date, time, title, speaker, location, poster_url, notes, event_type,
      city, organizer, sub_type, abstract_deadline, early_bird_deadline, registration_deadline,
      website_url, registration_url, handbook_url, source, created_by_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
  ).bind(
    date, effectiveEndDate, effectiveTime, title, speaker, location, poster_url, notes, event_type,
    city, organizer, sub_type, abstract_deadline, early_bird_deadline, registration_deadline,
    website_url, registration_url, handbook_url, source, user.id
  ).run();

  const created = await c.env.DB.prepare('SELECT * FROM observatory_talks WHERE id = ?').bind(res.meta.last_row_id).first();
  return c.json(created);
});

app.put('/:id', async (c) => {
  const user = c.get('user');
  await ensureTalksColumns(c.env.DB);
  const id = parseInt(c.req.param('id'), 10);
  const body = await c.req.json().catch(() => ({}));

  const existing = await c.env.DB.prepare('SELECT * FROM observatory_talks WHERE id = ?').bind(id).first<{ created_by_id: number; date: string; end_date?: string; time: string; title: string; speaker: string; location: string; poster_url: string; notes: string; event_type?: string }>();
  if (!existing) return c.json({ detail: '日程不存在' }, 404);

  const isOwner = Number(existing.created_by_id) === Number(user.id);
  const canManage = user.role === 'admin' || user.role === 'teacher' || Boolean(user.can_manage_seminars);

  if (!isOwner && !canManage) {
    return c.json({ detail: '仅创建人、管理员或具备组会管理权限的成员可以修改' }, 403);
  }

  const date = body.date || existing.date || '';
  const end_date = body.end_date !== undefined ? (body.end_date || '') : (existing.end_date || '');
  const event_type = body.event_type !== undefined ? (body.event_type || 'talk') : (existing.event_type || 'talk');
  const time = body.time || existing.time || (event_type === 'conference' ? '全天' : '');
  const title = body.title || existing.title || '';
  const speaker = body.speaker !== undefined ? (body.speaker || '') : (existing.speaker || '');
  const location = body.location !== undefined ? (body.location || '') : (existing.location || '');
  const poster_url = body.poster_url !== undefined ? (body.poster_url || '') : (existing.poster_url || '');
  const notes = body.notes !== undefined ? (body.notes || '') : (existing.notes || '');
  const city = body.city !== undefined ? (body.city || '') : (((existing as any).city) || '');
  const organizer = body.organizer !== undefined ? (body.organizer || '') : (((existing as any).organizer) || '');
  const sub_type = body.sub_type !== undefined ? (body.sub_type || '') : (((existing as any).sub_type) || '');
  const abstract_deadline = body.abstract_deadline !== undefined ? (body.abstract_deadline || '') : (((existing as any).abstract_deadline) || '');
  const early_bird_deadline = body.early_bird_deadline !== undefined ? (body.early_bird_deadline || '') : (((existing as any).early_bird_deadline) || '');
  const registration_deadline = body.registration_deadline !== undefined ? (body.registration_deadline || '') : (((existing as any).registration_deadline) || '');
  const website_url = body.website_url !== undefined ? (body.website_url || '') : (((existing as any).website_url) || '');
  const registration_url = body.registration_url !== undefined ? (body.registration_url || '') : (((existing as any).registration_url) || '');
  const handbook_url = body.handbook_url !== undefined ? (body.handbook_url || '') : (((existing as any).handbook_url) || '');
  const source = body.source !== undefined ? (body.source || '') : (((existing as any).source) || '');

  try {
    await c.env.DB.prepare(
      `UPDATE observatory_talks 
       SET date = ?, end_date = ?, time = ?, title = ?, speaker = ?, location = ?, poster_url = ?, notes = ?, event_type = ?,
           city = ?, organizer = ?, sub_type = ?, abstract_deadline = ?, early_bird_deadline = ?, registration_deadline = ?,
           website_url = ?, registration_url = ?, handbook_url = ?, source = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).bind(
      date, end_date, time, title, speaker, location, poster_url, notes, event_type,
      city, organizer, sub_type, abstract_deadline, early_bird_deadline, registration_deadline,
      website_url, registration_url, handbook_url, source, id
    ).run();

    const updated = await c.env.DB.prepare('SELECT * FROM observatory_talks WHERE id = ?').bind(id).first();
    return c.json(updated);
  } catch (err: any) {
    console.error('Failed to update observatory talk:', err);
    return c.json({ detail: err.message || '更新日程失败' }, 500);
  }
});

app.delete('/:id', async (c) => {
  const user = c.get('user');
  const id = parseInt(c.req.param('id'), 10);

  const existing = await c.env.DB.prepare('SELECT * FROM observatory_talks WHERE id = ?').bind(id).first<{ created_by_id: number }>();
  if (!existing) return c.json({ detail: '报告不存在' }, 404);

  const isOwner = Number(existing.created_by_id) === Number(user.id);
  const canManage = user.role === 'admin' || user.role === 'teacher' || Boolean(user.can_manage_seminars);

  if (!isOwner && !canManage) {
    return c.json({ detail: '仅创建人、管理员或具备组会管理权限的成员可以删除报告' }, 403);
  }

  await c.env.DB.prepare('DELETE FROM observatory_talks WHERE id = ?').bind(id).run();
  return c.json({ message: '报告已删除' });
});

function splitTalkSegments(text: string): { header: string; segments: string[] } {
  if (!text) return { header: '', segments: [] };
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // 1. 显式报告序号分段（如：报告一 / 报告1 / 报告 1 / 【报告1】 / 讲座一 / Talk 1 / Session 1 / 第一场报告 / 上午报告）
  const explicitPattern = /(?:^|\n)[ \t]*(?:【|\[|（|\()?[ \t]*(?:第[一二三四五六七八九十1-9]场(?:报告|讲座)?|(?:报告|讲座|Talk|Session|分会场)\s*(?:[一二三四五六七八九十1-9①-⑨]|I{1,3}|IV|V)\b|(?:上午|下午)\s*报告)[ \t]*(?:】|\]|）|\)|[:：、.\s]|\b)/gi;
  const explicitMatches = [...normalized.matchAll(explicitPattern)];
  if (explicitMatches.length >= 2) {
    const segments: string[] = [];
    const header = normalized.slice(0, explicitMatches[0].index).trim();
    for (let i = 0; i < explicitMatches.length; i++) {
      const start = explicitMatches[i].index;
      const end = i + 1 < explicitMatches.length ? explicitMatches[i + 1].index : normalized.length;
      segments.push(normalized.slice(start, end).trim());
    }
    return { header, segments };
  }

  // 2. 编号条目分段（如：1. 题目 / 1、报告题目 / 1. 《...》 等）
  const numberedPattern = /(?:^|\n)[ \t]*(?:[1-9][.、]|[(（【][1-9][)）】])[ \t]*(?=(?:[^\n]{0,25}(?:报告|讲座|题目|报告人|主讲人|Title|Speaker|《)))/gi;
  const numberedMatches = [...normalized.matchAll(numberedPattern)];
  if (numberedMatches.length >= 2) {
    const segments: string[] = [];
    const header = normalized.slice(0, numberedMatches[0].index).trim();
    for (let i = 0; i < numberedMatches.length; i++) {
      const start = numberedMatches[i].index;
      const end = i + 1 < numberedMatches.length ? numberedMatches[i + 1].index : normalized.length;
      segments.push(normalized.slice(start, end).trim());
    }
    return { header, segments };
  }

  // 3. 重复“报告题目/题目/Title”锚点
  const titlePattern = /(?:^|\n)[ \t]*(?:报告(?:题目|标题|主题|名称)|题目|Title|Topic)[ \t]*[:：]/gi;
  const titleMatches = [...normalized.matchAll(titlePattern)];
  if (titleMatches.length >= 2) {
    const segments: string[] = [];
    const header = normalized.slice(0, titleMatches[0].index).trim();
    for (let i = 0; i < titleMatches.length; i++) {
      const start = titleMatches[i].index;
      const end = i + 1 < titleMatches.length ? titleMatches[i + 1].index : normalized.length;
      segments.push(normalized.slice(start, end).trim());
    }
    return { header, segments };
  }

  // 4. 重复“报告人/主讲人/Speaker”锚点
  const speakerPattern = /(?:^|\n)[ \t]*(?:报告人|主讲人|主讲嘉宾|报告嘉宾|Speaker|Presenter)[ \t]*[:：]/gi;
  const speakerMatches = [...normalized.matchAll(speakerPattern)];
  if (speakerMatches.length >= 2) {
    const segments: string[] = [];
    const header = normalized.slice(0, speakerMatches[0].index).trim();
    for (let i = 0; i < speakerMatches.length; i++) {
      const start = speakerMatches[i].index;
      const end = i + 1 < speakerMatches.length ? speakerMatches[i + 1].index : normalized.length;
      segments.push(normalized.slice(start, end).trim());
    }
    return { header, segments };
  }

  return { header: '', segments: [normalized] };
}

function parseSingleTalkFields(text: string, fallback: { date?: string; time?: string; location?: string; speaker?: string } = {}) {
  // 1. 报告题目提取
  let title = '';
  const titleMatch = text.match(/(?:做题为|题为|题目为|题目是|报告题目|报告主题|报告名称)\s*[：:\s]*[《“]([^》”\n\r]+)[》”]/)
    || text.match(/(?:报告(?:题目|标题|主题|名称)|题目|Title|Topic)[：:\s]+([^\n\r]+)/i)
    || text.match(/[《“]([^》”\n\r]{4,100})[》”]\s*(?:的)?(?:学术)?(?:报告|讲座|分享)/);
  if (titleMatch) {
    title = titleMatch[1].replace(/^[【\[](?:学术报告|通知|讲座)[\]】]/, '').trim();
  }
  if (!title) {
    const mHeaderInline = text.match(/^(?:【|\[|（|\()?[ \t]*(?:第\s*[一二三四五六七八九十1-9]\s*场(?:报告|讲座)?|(?:报告|讲座|Talk|Session|分会场)\s*(?:[一二三四五六七八九十1-9①-⑨]|I{1,3}|IV|V)|[1-9][.、]|[(（【][1-9][)）】])[ \t]*(?:】|\]|）|\)|[:：、.\s])[ \t]*([^\n\r]{3,80})/i);
    if (mHeaderInline && !/^(?:时间|地点|报告人|主讲人|报告地点|Location|Venue|Speaker|Date|Time)/i.test(mHeaderInline[1].trim())) {
      title = mHeaderInline[1].replace(/^[【\[](?:学术报告|通知|讲座)[\]】]/, '').trim();
    }
  }
  if (!title) {
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    for (const l of lines) {
      if (l.includes('报告') && (l.includes('【') || l.includes('《') || l.length < 60)) {
        const bracket = l.replace(/^.*?[【《](.*?)[】》].*$/, '$1').trim();
        if (bracket.length > 3 && bracket !== l) {
          title = bracket;
          break;
        }
      }
    }
    if (!title && lines.length > 0) {
      title = lines[0].replace(/^(?:Fw|Fwd|转发)[:：\s]*/i, '').slice(0, 60).trim();
    }
  }

  // 2. 报告人提取
  let speaker = fallback.speaker || '';
  const speakerMatch = text.match(/(?:报告人|主讲人|演讲人|主讲嘉宾|报告嘉宾|Speaker|Presenter|特邀嘉宾|报告学者)[：:\s]+([^\n\r,，。；;()（）]{2,25})/i);
  if (speakerMatch) {
    speaker = speakerMatch[1].trim();
  } else if (!speaker) {
    const titlesList = '特聘研究员|副研究员|助理教授|副教授|研究员|博士后|教授|博士|院士|讲师|主任|老师|同学';
    const mSpeakerDe = text.match(new RegExp(`(?:邀请(?:到了|到|了)?|由)(?:[^,，。；\\n\\r]*?的)\\s*([A-Za-z\\u4e00-\\u9fa5·]{2,4}?)\\s*(${titlesList})`));
    if (mSpeakerDe) {
      speaker = `${mSpeakerDe[1].trim()} ${mSpeakerDe[2].trim()}`;
    }
  }

  // 3. 报告日期提取
  let date = fallback.date || '';
  const fullDateMatch = text.match(/(\d{4})[-/年\.](\d{1,2})[-/月\.](\d{1,2})(?:日)?/);
  if (fullDateMatch) {
    date = `${fullDateMatch[1]}-${fullDateMatch[2].padStart(2, '0')}-${fullDateMatch[3].padStart(2, '0')}`;
  } else if (!date) {
    const shortDateMatch = text.match(/(\d{1,2})月(\d{1,2})日/);
    if (shortDateMatch) {
      const year = new Date().getFullYear();
      date = `${year}-${shortDateMatch[1].padStart(2, '0')}-${shortDateMatch[2].padStart(2, '0')}`;
    }
  }

  // 4. 报告时间提取
  let time = fallback.time || '';
  const afternoonMatch = text.match(/(?:下午|晚上)\s*(\d{1,2})(?:[:：](\d{2})|点(?:半|(\d{2})分?)?)?/);
  if (afternoonMatch) {
    let hour = parseInt(afternoonMatch[1], 10);
    if (hour < 12) hour += 12;
    let min = '00';
    if (afternoonMatch[2]) min = afternoonMatch[2];
    else if (afternoonMatch[0].includes('半')) min = '30';
    else if (afternoonMatch[3]) min = afternoonMatch[3].padStart(2, '0');
    time = `${String(hour).padStart(2, '0')}:${min}`;
  } else {
    const timeMatch = text.match(/(?<!\d)(\d{1,2})[:：](\d{2})\s*(AM|PM)?|(?<!\d)(\d{1,2})[点时](?:(\d{1,2})分?)?/i);
    if (timeMatch) {
      let hour = parseInt(timeMatch[1] || timeMatch[4], 10);
      const minute = parseInt(timeMatch[2] || timeMatch[5] || '0', 10);
      const idx = timeMatch.index || 0;
      const prefix = text.slice(Math.max(0, idx - 15), idx);
      const ampm = (timeMatch[3] || '').toUpperCase();
      if (ampm === 'PM' || /下午|晚上/.test(prefix)) {
        if (hour < 12) hour += 12;
      } else if (ampm === 'AM' && hour === 12) {
        hour = 0;
      }
      if (hour < 24 && minute < 60) {
        time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
      }
    }
  }

  // 5. 地点提取
  let location = fallback.location || '';
  const locationMatch = text.match(/(?:报告地点|地点|会议地点|Location|Venue|会议室|腾讯会议|腾讯会议号|Zoom)[：:\s]+([^\n\r]+)/i);
  if (locationMatch) {
    location = locationMatch[1].trim();
  } else if (!location) {
    const mHeld = text.match(/在\s*([^,，。；\n\r]{2,40}?)\s*(?:线上|线下)?(?:举办|举行|召开|进行)/);
    if (mHeld && /会议室|报告厅|多功能厅|大厦|楼|中心|教室|腾讯会议|Zoom|ZOOM|\d+-\d+/i.test(mHeld[1])) {
      location = mHeld[1].trim();
    }
  }

  return { title, speaker, date, time, location, notes: text.slice(0, 2000) };
}

app.post('/parse-email', async (c) => {
  let text = '';
  const cType = c.req.header('content-type') || '';
  if (cType.includes('application/json')) {
    const jsonBody = await c.req.json().catch(() => ({}));
    text = (jsonBody.text || jsonBody.content || '').trim();
  } else {
    const formBody = await c.req.parseBody().catch(() => ({} as Record<string, any>));
    if (formBody.file instanceof File) {
      text = await formBody.file.text();
    } else {
      text = String(formBody.text || formBody.content || '').trim();
    }
  }

  if (!text) {
    return c.json({
      title: '',
      speaker: '',
      date: '',
      time: '',
      location: '',
      notes: '',
      warnings: ['未提取到任何文字内容，请上传有效邮件或直接粘贴邮件正文'],
      poster_candidates: [],
      talks: []
    });
  }

  // 基础兜底解析
  const commonMeta = parseSingleTalkFields(text);
  const commonDate = commonMeta.date || new Date().toISOString().slice(0, 10);
  const commonTime = commonMeta.time || '14:30';
  const commonLoc = commonMeta.location || '';

  const { header, segments } = splitTalkSegments(text);
  let allTalks: any[] = [];

  if (segments.length >= 2) {
    const headerMeta = header ? parseSingleTalkFields(header) : commonMeta;
    const fallback = {
      date: headerMeta.date || commonDate,
      time: headerMeta.time || commonTime,
      location: headerMeta.location || commonLoc
    };

    const parsedTalks = segments.map(seg => {
      const item = parseSingleTalkFields(seg, fallback);
      return {
        title: item.title || '学术报告',
        speaker: item.speaker || '',
        date: item.date || fallback.date,
        time: item.time || fallback.time,
        location: item.location || fallback.location,
        notes: seg.length > 30 ? seg.slice(0, 2000) : text.slice(0, 2000),
        poster_url: ''
      };
    }).filter(t => t.title && (t.title !== '学术报告' || t.speaker));

    if (parsedTalks.length >= 2) {
      const isUnique = parsedTalks.some((t, i) => i > 0 && (t.title !== parsedTalks[0].title || t.speaker !== parsedTalks[0].speaker));
      if (isUnique) {
        allTalks = parsedTalks;
      }
    }
  }

  if (allTalks.length === 0) {
    allTalks = [{
      title: commonMeta.title || '学术报告',
      speaker: commonMeta.speaker || '',
      date: commonDate,
      time: commonTime,
      location: commonLoc,
      notes: text.slice(0, 2000),
      poster_url: ''
    }];
  }

  const firstTalk = allTalks[0];
  const warnings: string[] = [];
  if (!firstTalk.date) warnings.push('未能自动识别报告日期，已默认填入今天，请核对');
  if (!firstTalk.time) warnings.push('未能自动识别具体时间，已默认填入下午 14:30');
  if (!firstTalk.speaker) warnings.push('未能自动识别报告人姓名，请手动补充');

  return c.json({
    title: firstTalk.title || '学术报告',
    speaker: firstTalk.speaker,
    date: firstTalk.date || new Date().toISOString().slice(0, 10),
    time: firstTalk.time || '14:30',
    location: firstTalk.location,
    notes: firstTalk.notes,
    warnings,
    poster_candidates: [],
    talks: allTalks
  });
});

export default app;
