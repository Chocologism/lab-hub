import { Hono } from 'hono';
import { handle } from 'hono/cloudflare-pages';
import { Env } from './types';

import auth from './routes/auth';
import account from './routes/account';
import files from './routes/files';
import seminars from './routes/seminars';
import arxiv from './routes/arxiv';
import library from './routes/library';
import resources from './routes/resources';
import talks from './routes/talks';
import feedback from './routes/feedback';
import favorites from './routes/favorites';
import mailbox from './routes/mailbox';
import notices from './routes/notices';
import system from './routes/system';
import scheduleImports from './routes/scheduleImports';

const app = new Hono<{ Bindings: Env }>().basePath('/api');

// 兼容不同的 D1 数据库 Binding 名称（DB, lab_hub_db）
app.use('*', async (c, next) => {
  if (!c.env.DB) {
    c.env.DB = (c.env as any).lab_hub_db;
  }
  await next();
});

// 健康检查端点
app.get('/health', (c) => {
  return c.json({
    status: 'healthy',
    service: 'LabOrbit Serverless API (Cloudflare Pages Functions + D1 + R2)',
    timestamp: new Date().toISOString()
  });
});

// 挂载所有模块子路由
app.route('/auth', auth);
app.route('/account', account);
app.route('/files', files);
app.route('/seminars', seminars);
app.route('/seminar', seminars); // 兼容单复数形式
app.route('/arxiv', arxiv);
app.route('/library', library);
app.route('/resources', resources);
app.route('/talks', talks);
app.route('/feedback', feedback);
app.route('/favorites', favorites);
app.route('/mailbox', mailbox);
app.route('/notices', notices);
app.route('/system', system);
app.route('/schedule-imports', scheduleImports);


export const onRequest = handle(app);
