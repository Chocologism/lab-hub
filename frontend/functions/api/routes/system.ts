import { Hono } from 'hono';
import bcrypt from 'bcryptjs';
import { Env, UserRow } from '../types';
import { createToken, authMiddleware, adminOnlyMiddleware } from '../middleware/auth';

const app = new Hono<{ Bindings: Env; Variables: { user: UserRow } }>();

async function ensureSystemSettingsSchema(db: D1Database) {
  try {
    await db.prepare(`CREATE TABLE IF NOT EXISTS system_settings (
      key VARCHAR(50) PRIMARY KEY,
      value TEXT NOT NULL
    )`).run();
  } catch (err) {
    console.warn('ensureSystemSettingsSchema error:', err);
  }
}

async function getSetting(db: D1Database, key: string, defaultVal: string = ''): Promise<string> {
  try {
    const row = await db.prepare('SELECT value FROM system_settings WHERE key = ?').bind(key).first<{ value: string }>();
    return row?.value || defaultVal;
  } catch {
    return defaultVal;
  }
}

async function setSetting(db: D1Database, key: string, value: string) {
  await db.prepare(
    'INSERT INTO system_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).bind(key, value).run();
}

app.get('/status', async (c) => {
  await ensureSystemSettingsSchema(c.env.DB);
  let userCount = 0;
  try {
    const res = await c.env.DB.prepare('SELECT COUNT(*) as count FROM users').first<{ count: number }>();
    userCount = res?.count || 0;
  } catch {
    userCount = 0;
  }

  const isInitVal = await getSetting(c.env.DB, 'is_initialized', '');
  const initialized = userCount > 0 && (isInitVal === 'true' || userCount > 0);

  const labName = await getSetting(c.env.DB, 'lab_name', '科研协作平台');
  const labShortName = await getSetting(c.env.DB, 'lab_short_name', 'LabHub');
  const siteSlogan = await getSetting(c.env.DB, 'site_slogan', '课题组科研协作与知识管理平台');
  const siteTitle = await getSetting(c.env.DB, 'site_title', 'Lab-Hub');
  const institution = await getSetting(c.env.DB, 'institution', '');
  const defaultLocation = await getSetting(c.env.DB, 'default_location', '研讨室 / 腾讯会议');

  return c.json({
    initialized,
    user_count: userCount,
    lab_name: labName,
    lab_short_name: labShortName,
    site_slogan: siteSlogan,
    site_title: siteTitle,
    institution,
    default_location: defaultLocation,
  });
});

app.post('/setup', async (c) => {
  await ensureSystemSettingsSchema(c.env.DB);
  const body = await c.req.json().catch(() => ({}));

  let userCount = 0;
  try {
    const res = await c.env.DB.prepare('SELECT COUNT(*) as count FROM users').first<{ count: number }>();
    userCount = res?.count || 0;
  } catch {
    userCount = 0;
  }

  if (userCount > 0) {
    return c.json({ detail: '系统已完成初始化，禁止重复设置！' }, 400);
  }

  const adminName = (body.admin_name || '').trim();
  const adminRealName = (body.admin_real_name || body.admin_name || '').trim();
  const adminEmail = (body.admin_email || '').trim().toLowerCase();
  const adminPassword = body.admin_password || '';
  const labName = (body.lab_name || '').trim();
  const labShortName = (body.lab_short_name || '').trim();
  const inviteCode = (body.invite_code || '').trim().toUpperCase();
  const siteSlogan = (body.site_slogan || '课题组科研协作与知识管理平台').trim();
  const siteTitle = (body.site_title || 'Lab-Hub').trim();
  const institution = (body.institution || '').trim();
  const defaultLocation = (body.default_location || '研讨室 / 腾讯会议').trim();

  if (!adminName || !adminEmail || !adminPassword) {
    return c.json({ detail: '管理员姓名、邮箱和密码为必填项' }, 400);
  }
  if (adminPassword.length < 6) {
    return c.json({ detail: '管理员密码长度不得少于 6 位' }, 400);
  }
  if (!labName || !labShortName) {
    return c.json({ detail: '课题组全称与缩写标识为必填项' }, 400);
  }
  if (!inviteCode) {
    return c.json({ detail: '初始成员注册邀请码不能为空' }, 400);
  }

  // 1. 创建超级管理员
  const hashedPassword = await bcrypt.hash(adminPassword, 6);
  const insertUser = await c.env.DB.prepare(
    `INSERT INTO users (name, real_name, nickname, email, hashed_password, role, identity, can_manage_seminars, tutorial_completed, created_at)
     VALUES (?, ?, ?, ?, ?, 'admin', 'teacher', 1, 0, datetime('now'))`
  ).bind(adminName, adminRealName, adminName, adminEmail, hashedPassword).run();

  const adminId = insertUser.meta.last_row_id;

  // 2. 插入初始邀请码
  try {
    await c.env.DB.prepare(`CREATE TABLE IF NOT EXISTS invite_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      note TEXT NOT NULL DEFAULT '',
      registration_role TEXT NOT NULL DEFAULT 'student',
      registration_identity TEXT NOT NULL DEFAULT 'student',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_by_id INTEGER,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`).run();
    await c.env.DB.prepare(
      `INSERT INTO invite_codes (code, note, registration_role, registration_identity, is_active, created_by_id)
       VALUES (?, '首次部署初始化默认邀请码', 'student', 'student', 1, ?)`
    ).bind(inviteCode, adminId).run();
  } catch (err) {
    console.warn('create initial invite error:', err);
  }

  // 3. 写入系统全局配置
  await setSetting(c.env.DB, 'is_initialized', 'true');
  await setSetting(c.env.DB, 'lab_name', labName);
  await setSetting(c.env.DB, 'lab_short_name', labShortName);
  await setSetting(c.env.DB, 'site_slogan', siteSlogan);
  await setSetting(c.env.DB, 'site_title', siteTitle);
  await setSetting(c.env.DB, 'institution', institution);
  await setSetting(c.env.DB, 'default_location', defaultLocation);

  const adminUser = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(adminId).first<UserRow>();
  if (!adminUser) {
    return c.json({ detail: '创建管理员失败' }, 500);
  }

  const secret = c.env.JWT_SECRET || 'labhub-default-secret-key-change-me-in-prod';
  const token = await createToken(adminUser, secret);
  const { hashed_password: _, ...safeUser } = adminUser;

  return c.json({
    access_token: token,
    token_type: 'bearer',
    user: { ...safeUser, tutorial_completed: 0 },
  });
});

app.get('/settings', authMiddleware, adminOnlyMiddleware, async (c) => {
  await ensureSystemSettingsSchema(c.env.DB);
  return c.json({
    lab_name: await getSetting(c.env.DB, 'lab_name', '科研协作平台'),
    lab_short_name: await getSetting(c.env.DB, 'lab_short_name', 'LabHub'),
    site_slogan: await getSetting(c.env.DB, 'site_slogan', '课题组科研协作与知识管理平台'),
    site_title: await getSetting(c.env.DB, 'site_title', 'Lab-Hub'),
    institution: await getSetting(c.env.DB, 'institution', ''),
    default_location: await getSetting(c.env.DB, 'default_location', '研讨室 / 腾讯会议'),
    ai_system_prompt: await getSetting(c.env.DB, 'ai_system_prompt', ''),
  });
});

app.put('/settings', authMiddleware, adminOnlyMiddleware, async (c) => {
  await ensureSystemSettingsSchema(c.env.DB);
  const body = await c.req.json().catch(() => ({}));
  if (typeof body.lab_name === 'string') await setSetting(c.env.DB, 'lab_name', body.lab_name.trim());
  if (typeof body.lab_short_name === 'string') await setSetting(c.env.DB, 'lab_short_name', body.lab_short_name.trim());
  if (typeof body.site_slogan === 'string') await setSetting(c.env.DB, 'site_slogan', body.site_slogan.trim());
  if (typeof body.site_title === 'string') await setSetting(c.env.DB, 'site_title', body.site_title.trim());
  if (typeof body.institution === 'string') await setSetting(c.env.DB, 'institution', body.institution.trim());
  if (typeof body.default_location === 'string') await setSetting(c.env.DB, 'default_location', body.default_location.trim());
  if (typeof body.ai_system_prompt === 'string') await setSetting(c.env.DB, 'ai_system_prompt', body.ai_system_prompt.trim());

  return c.json({ message: '系统设置已更新' });
});

export default app;
