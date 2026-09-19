import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { Buffer } from 'node:buffer';
import { Env, UserRow } from '../types';
import { authMiddleware, adminOnlyMiddleware, verifyToken } from '../middleware/auth';
import { CloudflareImapClient, decryptUserPassword, parseRawEmail, extractMessageId, extractDateHeader, extractSubjectHeader, isTalkEmail, isConferenceEmail } from '../utils/imap';
import { CloudflareSmtpClient, parseExternalEmails } from '../utils/smtp';

async function computeSha256(data: Uint8Array | ArrayBuffer): Promise<string> {
  const hashBuf = await crypto.subtle.digest('SHA-256', data);
  const hashArr = Array.from(new Uint8Array(hashBuf));
  return hashArr.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function ensureMailboxTables(db: D1Database): Promise<void> {
  try {
    await db.prepare("ALTER TABLE user_cached_emails ADD COLUMN poster_url TEXT DEFAULT ''").run();
  } catch {}
  try {
    await db.prepare("ALTER TABLE user_cached_emails ADD COLUMN attachments TEXT DEFAULT '[]'").run();
  } catch {}
  try {
    await db.prepare("ALTER TABLE uploaded_files ADD COLUMN sha256 TEXT").run();
  } catch {}
}

function extractFileUrlsFromEmailRow(row: { poster_url?: string; attachments?: string }): string[] {
  const urls: string[] = [];
  if (row.poster_url) urls.push(row.poster_url);
  if (row.attachments) {
    try {
      const list = JSON.parse(row.attachments);
      if (Array.isArray(list)) {
        for (const item of list) {
          if (item && item.url) urls.push(item.url);
        }
      }
    } catch {}
  }
  return urls;
}

async function cleanupOrphanPosters(db: D1Database, filesBucket: any, fileUrls: string[]): Promise<void> {
  const cleanedFileIds = new Set<string>();
  for (const url of fileUrls) {
    if (!url) continue;
    const match = url.match(/\/api\/files\/([a-f0-9\-]{36})/i);
    if (match) {
      cleanedFileIds.add(match[1]);
    }
  }

  for (const fileId of cleanedFileIds) {
    const fileUrl = `/api/files/${fileId}`;
    try {
      // 1. 保护学术日程与学术会议中引用的海报、手册、说明正文等
      const talkRef = await db.prepare(
        "SELECT id FROM observatory_talks WHERE poster_url = ? OR handbook_url = ? OR notes LIKE ?"
      ).bind(fileUrl, fileUrl, `%${fileId}%`).first().catch(() => null);
      if (talkRef) continue;

      // 2. 保护周组会中引用的幻灯片课件或说明
      const semPresRef = await db.prepare(
        "SELECT id FROM seminar_presentations WHERE slides_url = ?"
      ).bind(fileUrl).first().catch(() => null);
      if (semPresRef) continue;

      const semSchedRef = await db.prepare(
        "SELECT id FROM seminar_schedules WHERE notes LIKE ?"
      ).bind(`%${fileId}%`).first().catch(() => null);
      if (semSchedRef) continue;

      // 3. 保护其他仍保存在本地缓存的邮件引用
      const emailRef = await db.prepare(
        "SELECT id FROM user_cached_emails WHERE poster_url = ? OR attachments LIKE ? OR body_html LIKE ?"
      ).bind(fileUrl, `%${fileId}%`, `%${fileId}%`).first().catch(() => null);
      if (emailRef) continue;

      await db.prepare('DELETE FROM uploaded_files WHERE id = ?').bind(fileId).run();
      if (filesBucket) {
        try {
          await filesBucket.delete(fileId);
        } catch {}
      }
    } catch (e) {
      console.warn('Error cleaning orphan poster/attachment file:', e);
    }
  }
}

// 保留 8.5 个自然日周期（完整覆盖前置 7 个自然日与当天跨时区邮件）
const RETENTION_MS = 8.5 * 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = RETENTION_MS;

export function parseEmailTimestamp(dateStr?: string, fallbackStr?: string): number {
  if (dateStr) {
    const cleanStr = dateStr.replace(/\s*\([^)]*\)\s*$/, '').trim();
    let ts = Date.parse(cleanStr);
    if (!isNaN(ts)) return ts;
    ts = Date.parse(dateStr);
    if (!isNaN(ts)) return ts;
  }
  if (fallbackStr) {
    const ts = Date.parse(fallbackStr);
    if (!isNaN(ts)) return ts;
  }
  return NaN;
}

const app = new Hono<{ Bindings: Env; Variables: { user: UserRow } }>();

// SSE 同步接口：通过真实 IMAP 协议直连用户配置的邮件服务器进行增量同步
app.get('/sync-stream', async (c) => {
  let token = c.req.query('token');
  if (!token) {
    const authHeader = c.req.header('Authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7).trim();
    }
  }

  if (!token) {
    return c.json({ detail: '未提供身份认证凭据' }, 401);
  }

  const payload = await verifyToken(token, c.env.JWT_SECRET);
  if (!payload || !payload.sub) {
    return c.json({ detail: '身份认证失败或凭据已过期' }, 401);
  }

  const userId = parseInt(payload.sub, 10);
  const user = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first<UserRow>();
  if (!user) {
    return c.json({ detail: '未找到对应用户' }, 401);
  }

  await ensureMailboxTables(c.env.DB);

  const config = await c.env.DB.prepare('SELECT * FROM user_mail_configs WHERE user_id = ?').bind(userId).first<any>();
  if (!config) {
    return c.json({ detail: '当前用户尚未配置邮箱' }, 400);
  }

  const password = decryptUserPassword(config.encrypted_password, c.env.JWT_SECRET);
  if (!password) {
    return c.json({ detail: '解密用户邮箱密码失败，请在设置中重新输入并保存密码' }, 400);
  }

  return streamSSE(c, async (stream) => {
    const client = new CloudflareImapClient();
    try {
      // 阶段 1: 建立连接
      const port = config.server_port || 993;
      await stream.writeSSE({
        data: JSON.stringify({
          type: 'progress',
          percent: 15,
          message: `正在连接 IMAP 服务器 ${config.server_host}:${port}…`,
          detail: `${config.server_host}:${port}`
        })
      });

      await client.connect(config.server_host, port, 10000);

      // 阶段 2: 验证身份
      await stream.writeSSE({
        data: JSON.stringify({
          type: 'progress',
          percent: 30,
          message: '正在验证 IMAP 账号与密码…',
          detail: `用户: ${config.username}`
        })
      });

      await client.login(config.username, password);

      // 阶段 3: 检索收件箱
      await stream.writeSSE({
        data: JSON.stringify({
          type: 'progress',
          percent: 45,
          message: 'IMAP 登录成功，正在检索收件箱最近 7 天邮件…',
          detail: 'INBOX'
        })
      });

      await client.selectInbox();

      // 优先通过 SEARCH SINCE 筛选最近 7~8 天内的候选邮件
      let targetIds = await client.searchSince(8);
      let totalMsgs = targetIds.length;

      if (targetIds.length === 0) {
        // 若 SEARCH SINCE 未匹配或特定服务器不支持，回退到倒序取最近邮件
        const allIds = await client.searchAll();
        totalMsgs = allIds.length;
        const limit = 30;
        targetIds = allIds.slice(-limit).reverse();
      } else {
        targetIds = targetIds.reverse();
      }
      const totalTarget = targetIds.length;

      await stream.writeSSE({
        data: JSON.stringify({
          type: 'progress',
          percent: 55,
          message: `发现 ${totalTarget} 封近期候选邮件，开始同步最近 7 天内容…`,
          count: totalTarget
        })
      });

      // 预先查询当前用户已缓存的所有邮件（建立内存 UID 与 语义元数据 Map，将判定耗时由每次网络/DB查询降至 0ms）
      const cachedList = await c.env.DB.prepare(
        `SELECT id, msg_uid, subject, sender_name, sender_email, date_str, has_attachments, body_text, body_html, snippet, poster_url, attachments 
         FROM user_cached_emails WHERE user_id = ?`
      ).bind(userId).all<any>();

      const cachedByUid = new Map<string, any>();
      const cachedByMeta = new Map<string, any>();
      for (const row of cachedList.results || []) {
        if (row.msg_uid) {
          const clean = row.msg_uid.replace(/[<>]/g, '').trim();
          cachedByUid.set(clean, row);
        }
        if (row.subject && row.date_str) {
          const cleanSubj = row.subject.replace(/\s+/g, '').toLowerCase();
          cachedByMeta.set(`${cleanSubj}__${row.date_str.trim()}`, row);
        }
      }

      let newlyFetched = 0;
      for (let i = 0; i < targetIds.length; i++) {
        const seq = targetIds[i];
        const pct = 55 + Math.round(((i + 1) / totalTarget) * 40);

        try {
          // 1. 先抓取轻量邮件头（仅数百字节），快速获取 Date 与 Message-ID
          const { size, header } = await client.fetchMessageHeader(seq, 6000);
          const rawMsgUid = extractMessageId(header, `imap_${seq}`);
          const msgUid = rawMsgUid.replace(/[<>]/g, '').trim();

          const headerDate = extractDateHeader(header);
          const headerTs = parseEmailTimestamp(headerDate);

          // 若邮件本身明确早于保留期（8.5 天），跳过正文下载与入库，并上报进度保持计数透明连续
          if (!isNaN(headerTs) && (Date.now() - headerTs) > RETENTION_MS) {
            await stream.writeSSE({
              data: JSON.stringify({
                type: 'progress',
                percent: pct,
                message: `已同步 (${i + 1}/${totalTarget})，跳过早于 7 天的旧邮件`,
                detail: `UID: ${msgUid.slice(0, 25)}`,
                count: newlyFetched
              })
            });
            continue;
          }

          const rawHeaderSubj = extractSubjectHeader(header);
          const headerSubj = rawHeaderSubj.replace(/\s+/g, '').toLowerCase();
          const metaKey = headerSubj && headerDate ? `${headerSubj}__${headerDate.trim()}` : '';

          let existing = cachedByUid.get(msgUid) || (metaKey ? cachedByMeta.get(metaKey) : null);

          // 综合邮件头与库中已有缓存的主题、正文、摘要，全面判定是否属于学术会议或学术报告
          const candidateSubj = `${existing?.subject || ''} ${rawHeaderSubj}`.trim();
          const isConfCandidate = isConferenceEmail({ subject: candidateSubj, snippet: existing?.snippet, body_text: existing?.body_text });
          const isTalkCandidate = isTalkEmail({ subject: candidateSubj, snippet: existing?.snippet, body_text: existing?.body_text });
          const isAcademic = isConfCandidate || isTalkCandidate || /报告|讲座|论坛|研讨会|会议|seminar|colloquium/i.test(candidateSubj);

          // 缓存完整性与自愈判定：
          // 针对学术会议或学术报告：若库中此前标记有附件但既无海报也无有效附件列表，说明此前抓取截断，重新拉取完整报文补全海报与通知文件！
          const hasNoAttachments = !existing?.attachments || existing.attachments === '[]';
          const lacksPoster = !existing?.poster_url;
          const isPossiblyIncomplete = existing && isAcademic && Boolean(existing.has_attachments) && hasNoAttachments && lacksPoster;

          if (existing && (existing.body_text || existing.body_html) && !isPossiblyIncomplete) {
            // 已存在于数据库缓存且完备，直接跳过正文下载，极速进行下一封
            await stream.writeSSE({
              data: JSON.stringify({
                type: 'progress',
                percent: pct,
                message: `已同步 (${i + 1}/${totalTarget})，跳过已缓存邮件`,
                detail: `UID: ${msgUid.slice(0, 25)}`,
                count: newlyFetched
              })
            });
            continue;
          }

          // 2. 抓取邮件报文：
          // 若属于学术会议或报告，完整下载海报图片与通知文件（上限 8MB，单封通常 300KB~1.5MB，耗时仅数百毫秒）；
          // 对于普通大邮件，快速拉取 200KB 文本包。
          let raw = '';
          const fetchLimit = isAcademic
            ? (size <= 8 * 1024 * 1024 ? 0 : 8388608)
            : 200000;
          try {
            raw = await client.fetchMessageRaw(seq, fetchLimit, isAcademic ? 20000 : 8000);
          } catch (peekErr) {
            console.warn(`Fetch raw failed for message ${seq}:`, peekErr);
            continue;
          }

          if (raw) {
            let parsed = parseRawEmail(raw, msgUid);
            const finalUid = (parsed.msg_uid || msgUid).replace(/[<>]/g, '').trim();

            const parsedTs = parseEmailTimestamp(parsed.date_str);
            if (!isNaN(parsedTs) && (Date.now() - parsedTs) > RETENTION_MS) {
              await stream.writeSSE({
                data: JSON.stringify({
                  type: 'progress',
                  percent: pct,
                  message: `已同步 (${i + 1}/${totalTarget})，跳过早于 7 天的旧邮件`,
                  detail: `UID: ${finalUid.slice(0, 25)}`,
                  count: newlyFetched
                })
              });
              continue;
            }

            const isConf = isConferenceEmail(parsed);
            const isTalk = isTalkEmail(parsed);

            // 提取并保存有效附件（图片附件，以及仅对学术会议/报告保存的 PDF、Word 文档附件）
            const imageItems = parsed.imageAttachments && parsed.imageAttachments.length > 0
              ? parsed.imageAttachments
              : (parsed.imageAttachment ? [parsed.imageAttachment] : []);
            const docItems = (parsed.documentAttachments && parsed.documentAttachments.length > 0)
              ? parsed.documentAttachments
              : [];

            const itemsToSave: Array<{ filename: string; contentType: string; data: Uint8Array; isImage: boolean }> = [
              ...imageItems.map(img => ({ filename: img.filename, contentType: img.contentType, data: img.data, isImage: true })),
              ...((isConf || isTalk) ? docItems.map(doc => ({ filename: doc.filename, contentType: doc.contentType, data: doc.data, isImage: false })) : [])
            ];

            const savedAttachments: Array<{ id: string; filename: string; content_type: string; size: number; url: string }> = [];

            for (const item of itemsToSave) {
              try {
                const buffer = item.data;
                const hash = await computeSha256(buffer);

                // 查重：若库中已有完全相同哈希和大小的文件，直接复用其 ID 与 URL，绝不保存多份重复文件
                const dup = await c.env.DB.prepare(
                  'SELECT id, filename FROM uploaded_files WHERE sha256 = ? AND size = ? LIMIT 1'
                ).bind(hash, buffer.length).first<{ id: string; filename: string }>().catch(() => null);

                if (dup) {
                  savedAttachments.push({
                    id: dup.id,
                    filename: dup.filename || item.filename,
                    content_type: item.contentType,
                    size: buffer.length,
                    url: `/api/files/${dup.id}`
                  });
                  parsed.has_attachments = true;
                  continue;
                }

                const fileId = crypto.randomUUID();
                let savedToR2 = false;
                if (c.env.FILES_BUCKET) {
                  try {
                    await c.env.FILES_BUCKET.put(fileId, buffer, {
                      httpMetadata: {
                        contentType: item.contentType,
                        contentDisposition: `inline; filename="${encodeURIComponent(item.filename)}"`
                      }
                    });
                    savedToR2 = true;
                  } catch {}
                }

                if (savedToR2) {
                  try {
                    await c.env.DB.prepare(
                      `INSERT INTO uploaded_files (id, filename, content_type, size, sha256, created_at)
                       VALUES (?, ?, ?, ?, ?, datetime('now'))`
                    ).bind(fileId, item.filename, item.contentType, buffer.length, hash).run();
                  } catch {
                    await c.env.DB.prepare(
                      `INSERT INTO uploaded_files (id, filename, content_type, size, created_at)
                       VALUES (?, ?, ?, ?, datetime('now'))`
                    ).bind(fileId, item.filename, item.contentType, buffer.length).run();
                  }
                } else {
                  try {
                    await c.env.DB.prepare(
                      `INSERT INTO uploaded_files (id, filename, content_type, size, content, sha256, created_at)
                       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
                    ).bind(fileId, item.filename, item.contentType, buffer.length, buffer, hash).run();
                  } catch {
                    await c.env.DB.prepare(
                      `INSERT INTO uploaded_files (id, filename, content_type, size, content, created_at)
                       VALUES (?, ?, ?, ?, ?, datetime('now'))`
                    ).bind(fileId, item.filename, item.contentType, buffer.length, buffer).run();
                  }
                }
                const fileUrl = `/api/files/${fileId}`;
                savedAttachments.push({
                  id: fileId,
                  filename: item.filename,
                  content_type: item.contentType,
                  size: buffer.length,
                  url: fileUrl
                });
                parsed.has_attachments = true;
              } catch (fileErr) {
                console.warn('Failed to save email attachment:', fileErr);
              }
            }

            const attachmentsJson = JSON.stringify(savedAttachments);
            const firstImage = savedAttachments.find(a => a.content_type?.startsWith('image/'));
            const posterUrl = firstImage ? firstImage.url : '';

            let existingRecord = existing || cachedByUid.get(finalUid);
            if (!existingRecord && parsed.date_str && parsed.subject) {
              const cleanSubj = parsed.subject.replace(/\s+/g, '').toLowerCase();
              existingRecord = cachedByMeta.get(`${cleanSubj}__${parsed.date_str.trim()}`);
            }

            if (existingRecord) {
              // 自动自愈已有邮件，更新干净 UID 并补全正文、海报与图片附件
              const updateBodyText = parsed.body_text || existingRecord.body_text || '';
              const updateBodyHtml = parsed.body_html || existingRecord.body_html || '';
              const updateSnippet = parsed.snippet || existingRecord.snippet || '';
              const updatePoster = posterUrl || existingRecord.poster_url || '';
              const updateAttachments = (attachmentsJson && attachmentsJson !== '[]') 
                ? attachmentsJson 
                : (existingRecord.attachments && existingRecord.attachments !== '[]' ? existingRecord.attachments : '[]');
              const updateHasAtt = (savedAttachments.length > 0 || Boolean(updatePoster) || (updateAttachments !== '[]' && updateAttachments !== '')) ? 1 : 0;

              await c.env.DB.prepare(
                `UPDATE user_cached_emails
                 SET msg_uid = ?,
                     body_text = ?,
                     body_html = ?,
                     snippet = ?,
                     has_attachments = ?,
                     poster_url = ?,
                     attachments = ?
                 WHERE id = ?`
              ).bind(
                finalUid,
                updateBodyText.replace(/\0/g, ''),
                updateBodyHtml.replace(/\0/g, ''),
                updateSnippet.replace(/\0/g, ''),
                updateHasAtt,
                updatePoster,
                updateAttachments,
                existingRecord.id
              ).run();
              existingRecord.poster_url = updatePoster;
              existingRecord.attachments = updateAttachments;
              existingRecord.has_attachments = updateHasAtt;
            } else {
              const insertRes = await c.env.DB.prepare(
                `INSERT OR IGNORE INTO user_cached_emails 
                 (user_id, msg_uid, subject, sender_name, sender_email, recipient, date_str, snippet, body_text, body_html, has_attachments, poster_url, attachments, is_read, fetched_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'))`
              ).bind(
                userId,
                finalUid.slice(0, 150),
                (parsed.subject || '无主题').replace(/\0/g, ''),
                (parsed.sender_name || '').replace(/\0/g, '').slice(0, 150),
                (parsed.sender_email || '').replace(/\0/g, '').slice(0, 150),
                (parsed.recipient || '').replace(/\0/g, ''),
                (parsed.date_str || '').replace(/\0/g, '').slice(0, 100),
                (parsed.snippet || '').replace(/\0/g, ''),
                (parsed.body_text || '').replace(/\0/g, ''),
                (parsed.body_html || '').replace(/\0/g, ''),
                parsed.has_attachments ? 1 : 0,
                posterUrl,
                attachmentsJson
              ).run();
              newlyFetched++;

              const newRow = {
                id: insertRes.meta?.last_row_id,
                msg_uid: finalUid,
                subject: parsed.subject,
                date_str: parsed.date_str,
                has_attachments: parsed.has_attachments ? 1 : 0,
                body_text: parsed.body_text,
                body_html: parsed.body_html,
                poster_url: posterUrl,
                attachments: attachmentsJson
              };
              cachedByUid.set(finalUid, newRow);
              if (parsed.subject && parsed.date_str) {
                cachedByMeta.set(`${parsed.subject.replace(/\s+/g, '').toLowerCase()}__${parsed.date_str.trim()}`, newRow);
              }
            }

            await stream.writeSSE({
              data: JSON.stringify({
                type: 'progress',
                percent: pct,
                message: `已同步 (${i + 1}/${totalTarget}): ${(parsed.subject || '无主题').slice(0, 30)}`,
                detail: parsed.sender_name,
                count: newlyFetched
              })
            });
          }
        } catch (msgErr: any) {
          console.error(`Error fetching message ${seq}:`, msgErr);
          if (msgErr?.message?.includes('closed') || msgErr?.message?.includes('timed out')) {
            try {
              // 尝试重连一次以继续处理队列中的后续邮件，避免单封网络波动中断整个同步
              await client.close();
              await client.connect(config.server_host, port, 8000);
              await client.login(config.username, password);
              await client.selectInbox();
              continue;
            } catch (reconnErr) {
              console.error('Failed to reconnect IMAP client, stopping batch:', reconnErr);
              break;
            }
          }
        }
      }

      await client.logout();

      // 自动清理超过 7 天的历史旧邮件，释放 D1 存储空间与内存
      const sevenDaysAgoTs = Date.now() - SEVEN_DAYS_MS;
      const cachedRows = await c.env.DB.prepare(
        'SELECT id, date_str, fetched_at FROM user_cached_emails WHERE user_id = ?'
      ).bind(userId).all<{ id: number; date_str: string; fetched_at: string }>();

      const expiredIds: number[] = [];
      for (const row of cachedRows.results || []) {
        const ts = parseEmailTimestamp(row.date_str, row.fetched_at);
        if (!isNaN(ts) && ts < sevenDaysAgoTs) {
          expiredIds.push(row.id);
        }
      }

      if (expiredIds.length > 0) {
        for (let idx = 0; idx < expiredIds.length; idx += 50) {
          const chunk = expiredIds.slice(idx, idx + 50);
          const stmts = chunk.map(id =>
            c.env.DB.prepare('DELETE FROM user_cached_emails WHERE id = ? AND user_id = ?').bind(id, userId)
          );
          await c.env.DB.batch(stmts);
        }
      }

      // 统计最终已有缓存数量
      const finalCountRow = await c.env.DB.prepare(
        'SELECT count(*) as cnt FROM user_cached_emails WHERE user_id = ?'
      ).bind(userId).first<{ cnt: number }>();
      const finalCount = finalCountRow?.cnt || 0;

      await stream.writeSSE({
        data: JSON.stringify({
          type: 'done',
          percent: 100,
          message: `同步完成，新增 ${newlyFetched} 封新邮件，当前保留最近 7 天共 ${finalCount} 封`,
          count: finalCount
        })
      });
    } catch (err: any) {
      await client.close();
      await stream.writeSSE({
        data: JSON.stringify({
          type: 'error',
          percent: 100,
          message: `IMAP 直连同步失败: ${err.message || String(err)}`
        })
      });
    }
  });
});

// 其余路由统一使用标准 authMiddleware 校验
app.use('*', authMiddleware);

// 获取邮箱配置
app.get('/config', async (c) => {
  try {
    const user = c.get('user');
    const config = await c.env.DB.prepare(
      'SELECT * FROM user_mail_configs WHERE user_id = ?'
    ).bind(user.id).first<any>();

    if (!config) {
      return c.json({ has_config: false });
    }

    return c.json({
      has_config: true,
      email_address: config.email_address,
      protocol: config.protocol || 'imap',
      server_host: config.server_host,
      server_port: config.server_port,
      use_ssl: Boolean(config.use_ssl),
      username: config.username,
      has_password: Boolean(config.encrypted_password),
      updated_at: config.updated_at || ''
    });
  } catch (err: any) {
    console.error('Error in GET /config:', err);
    return c.json({ has_config: false, detail: err.message || '获取配置失败' });
  }
});

// 保存或更新邮箱配置
app.post('/config', async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json().catch(() => ({}));

    const emailAddress = (body.email_address || '').trim();
    const protocol = (body.protocol || 'imap').trim().toLowerCase();
    const serverHost = (body.server_host || '').trim();
    const serverPort = parseInt(body.server_port, 10) || (protocol === 'pop3' ? 995 : 993);
    const useSsl = body.use_ssl ? 1 : 0;
    const username = (body.username || '').trim();
    const password = (body.password || '').trim();

    if (!emailAddress || !serverHost || !username) {
      return c.json({ detail: '邮箱地址、服务器地址与用户名均不能为空' }, 400);
    }

    const existing = await c.env.DB.prepare(
      'SELECT * FROM user_mail_configs WHERE user_id = ?'
    ).bind(user.id).first<any>();

    if (!existing) {
      if (!password) {
        return c.json({ detail: '首次配置邮箱必须提供登录密码或客户端授权码' }, 422);
      }
      // 安全存储（Base64 编码保存，支持任意 UTF-8 字符）
      const encPass = Buffer.from(password, 'utf-8').toString('base64');
      await c.env.DB.prepare(
        `INSERT INTO user_mail_configs (user_id, email_address, protocol, server_host, server_port, use_ssl, username, encrypted_password, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
      ).bind(user.id, emailAddress, protocol, serverHost, serverPort, useSsl, username, encPass).run();
    } else {
      let encPass = existing.encrypted_password;
      if (password) {
        encPass = Buffer.from(password, 'utf-8').toString('base64');
      }
      await c.env.DB.prepare(
        `UPDATE user_mail_configs
         SET email_address = ?, protocol = ?, server_host = ?, server_port = ?, use_ssl = ?, username = ?, encrypted_password = ?, updated_at = datetime('now')
         WHERE user_id = ?`
      ).bind(emailAddress, protocol, serverHost, serverPort, useSsl, username, encPass, user.id).run();
    }

    const updated = await c.env.DB.prepare(
      'SELECT * FROM user_mail_configs WHERE user_id = ?'
    ).bind(user.id).first<any>();

    return c.json({
      has_config: true,
      email_address: updated.email_address,
      protocol: updated.protocol,
      server_host: updated.server_host,
      server_port: updated.server_port,
      use_ssl: Boolean(updated.use_ssl),
      username: updated.username,
      has_password: Boolean(updated.encrypted_password),
      updated_at: updated.updated_at || ''
    });
  } catch (err: any) {
    console.error('Error in POST /config:', err);
    return c.json({ detail: `保存邮箱配置失败: ${err.message || String(err)}` }, 500);
  }
});

// 测试连接
app.post('/test', async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json().catch(() => ({}));
    const serverHost = (body.server_host || '').trim();
    const serverPort = parseInt(body.server_port, 10) || 993;
    const username = (body.username || '').trim();
    let password = (body.password || '').trim();

    if (!serverHost || !username) {
      return c.json({ success: false, detail: '请填写完整的服务器地址与用户名', message: '请填写完整的服务器地址与用户名' }, 400);
    }

    if (!password) {
      const existing = await c.env.DB.prepare(
        'SELECT encrypted_password FROM user_mail_configs WHERE user_id = ?'
      ).bind(user.id).first<any>();
      if (existing && existing.encrypted_password) {
        password = decryptUserPassword(existing.encrypted_password, c.env.JWT_SECRET);
        if (!password) {
          return c.json({ success: false, detail: '本地保存的密码解密失败，请重新输入密码', message: '本地保存的密码解密失败，请重新输入密码' }, 400);
        }
      } else {
        return c.json({ success: false, detail: '请输入邮箱密码或客户端授权码以进行连接测试', message: '请输入邮箱密码或客户端授权码以进行连接测试' }, 422);
      }
    }

    const client = new CloudflareImapClient();
    try {
      await client.connect(serverHost, serverPort, 8000);
      await client.login(username, password);
      const { exists } = await client.selectInbox();
      await client.logout();

      return c.json({
        success: true,
        protocol: 'IMAP',
        message: `IMAP 登录成功！收件箱共有 ${exists} 封邮件。`,
        count: exists,
      });
    } catch (err: any) {
      await client.close();
      const errMsg = err.message || String(err);
      return c.json({
        success: false,
        detail: `IMAP 连接失败: ${errMsg}`,
        message: `IMAP 连接失败: ${errMsg}`,
      }, 400);
    }
  } catch (err: any) {
    console.error('Error in POST /test:', err);
    const errMsg = err.message || String(err);
    return c.json({
      success: false,
      detail: `连接测试异常: ${errMsg}`,
      message: `连接测试异常: ${errMsg}`,
    }, 500);
  }
});

// 解除绑定并清空本地缓存
app.delete('/config', async (c) => {
  try {
    const user = c.get('user');
    const emails = await c.env.DB.prepare(
      'SELECT poster_url, attachments FROM user_cached_emails WHERE user_id = ?'
    ).bind(user.id).all<{ poster_url: string; attachments: string }>();
    const fileUrls: string[] = [];
    for (const em of emails.results || []) {
      fileUrls.push(...extractFileUrlsFromEmailRow(em));
    }

    await c.env.DB.prepare('DELETE FROM user_mail_configs WHERE user_id = ?').bind(user.id).run();
    await c.env.DB.prepare('DELETE FROM user_cached_emails WHERE user_id = ?').bind(user.id).run();

    if (fileUrls.length > 0) {
      c.executionCtx.waitUntil(cleanupOrphanPosters(c.env.DB, c.env.FILES_BUCKET, fileUrls));
    }

    return c.json({ message: '邮箱配置已成功解除绑定并清空本地缓存' });
  } catch (err: any) {
    console.error('Error in DELETE /config:', err);
    return c.json({ detail: `解除绑定失败: ${err.message || String(err)}` }, 500);
  }
});

// 获取邮件列表
app.get('/emails', async (c) => {
  try {
    await ensureMailboxTables(c.env.DB);
    const user = c.get('user');
    const q = (c.req.query('q') || '').trim().toLowerCase();

    const config = await c.env.DB.prepare(
      'SELECT id FROM user_mail_configs WHERE user_id = ?'
    ).bind(user.id).first();

    if (!config) {
      return c.json([]);
    }

    let query = `SELECT id, user_id, msg_uid, msg_uid as message_id, subject, sender_name, sender_email, recipient, date_str, snippet, body_text, has_attachments, poster_url, attachments, is_read, fetched_at as created_at FROM user_cached_emails WHERE user_id = ?`;
    const params: any[] = [user.id];

    if (q) {
      query += ' AND (LOWER(subject) LIKE ? OR LOWER(sender_name) LIKE ? OR LOWER(sender_email) LIKE ? OR LOWER(snippet) LIKE ?)';
      const pattern = `%${q}%`;
      params.push(pattern, pattern, pattern, pattern);
    }

    query += ' ORDER BY id DESC LIMIT 150';

    const nowTs = Date.now();
    const sevenDaysAgoTs = nowTs - SEVEN_DAYS_MS;

    const { results: rawEmails } = await c.env.DB.prepare(query).bind(...params).all();
    const emails = (rawEmails || []) as any[];

    // 自愈去重 & 7天保留期自愈清理
    const cleanList: any[] = [];
    const seenUids = new Set<string>();
    const seenMeta = new Set<string>();
    const idsToDelete: number[] = [];

    for (const item of emails) {
      // 检查邮件是否超过 7 天
      const ts = parseEmailTimestamp(item.date_str, item.created_at);
      if (!isNaN(ts) && ts < sevenDaysAgoTs) {
        idsToDelete.push(Number(item.id));
        continue;
      }

      const cleanUid = ((item.msg_uid || item.message_id || '') as string).replace(/[<>]/g, '').trim();
      const cleanSubj = ((item.subject || '') as string).replace(/\s+/g, '').toLowerCase();
      const dateKey = ((item.date_str || '') as string).trim();

      const metaKey = cleanSubj && dateKey ? `${cleanSubj}__${dateKey}` : '';

      const isDup = (cleanUid && seenUids.has(cleanUid)) || (metaKey && seenMeta.has(metaKey));

      if (isDup) {
        idsToDelete.push(Number(item.id));
      } else {
        if (cleanUid) seenUids.add(cleanUid);
        if (metaKey) seenMeta.add(metaKey);

        let attList: any[] = [];
        try {
          attList = item.attachments ? JSON.parse(item.attachments) : [];
        } catch {}
        if ((!attList || attList.length === 0) && item.poster_url) {
          attList = [{
            id: '',
            filename: '邮件图片',
            content_type: 'image/jpeg',
            size: 0,
            url: item.poster_url
          }];
        }
        item.attachments = attList;
        cleanList.push(item);
      }
    }

    if (idsToDelete.length > 0) {
      try {
        for (let idx = 0; idx < idsToDelete.length; idx += 50) {
          const chunk = idsToDelete.slice(idx, idx + 50);
          const stmts = chunk.map(id =>
            c.env.DB.prepare('DELETE FROM user_cached_emails WHERE id = ? AND user_id = ?').bind(id, user.id)
          );
          c.executionCtx.waitUntil(c.env.DB.batch(stmts));
        }
      } catch (e) {
        console.error('Error auto-healing expired/duplicate emails in DB:', e);
      }
    }

    return c.json(cleanList);
  } catch (err: any) {
    console.error('Error in GET /emails:', err);
    return c.json([]);
  }
});

// 获取单封邮件详情（含 HTML/正文/图片附件）
app.get('/emails/:id', async (c) => {
  try {
    const user = c.get('user');
    const id = parseInt(c.req.param('id'), 10);

    const email = await c.env.DB.prepare(
      'SELECT *, msg_uid as message_id, fetched_at as created_at FROM user_cached_emails WHERE id = ? AND user_id = ?'
    ).bind(id, user.id).first<any>();

    if (!email) {
      return c.json({ detail: '未找到该邮件' }, 404);
    }

    const ts = parseEmailTimestamp(email.date_str, email.created_at);
    if (!isNaN(ts) && (Date.now() - ts) > SEVEN_DAYS_MS) {
      c.executionCtx.waitUntil(
        c.env.DB.prepare('DELETE FROM user_cached_emails WHERE id = ? AND user_id = ?').bind(id, user.id).run()
      );
      return c.json({ detail: '该邮件已超过 7 天保留期，已从本地缓存清理' }, 404);
    }

    let attList: any[] = [];
    try {
      attList = email.attachments ? JSON.parse(email.attachments) : [];
    } catch {}
    if ((!attList || attList.length === 0) && email.poster_url) {
      attList = [{
        id: '',
        filename: '邮件图片',
        content_type: 'image/jpeg',
        size: 0,
        url: email.poster_url
      }];
    }
    email.attachments = attList;

    return c.json(email);
  } catch (err: any) {
    console.error('Error in GET /emails/:id:', err);
    return c.json({ detail: '获取邮件详情失败' }, 500);
  }
});

// 清空当前用户所有本地邮件缓存
app.delete('/emails', async (c) => {
  try {
    const user = c.get('user');
    const emails = await c.env.DB.prepare(
      'SELECT poster_url, attachments FROM user_cached_emails WHERE user_id = ?'
    ).bind(user.id).all<{ poster_url: string; attachments: string }>();
    const fileUrls: string[] = [];
    for (const em of emails.results || []) {
      fileUrls.push(...extractFileUrlsFromEmailRow(em));
    }

    const res = await c.env.DB.prepare(
      'DELETE FROM user_cached_emails WHERE user_id = ?'
    ).bind(user.id).run();

    if (fileUrls.length > 0) {
      c.executionCtx.waitUntil(cleanupOrphanPosters(c.env.DB, c.env.FILES_BUCKET, fileUrls));
    }

    return c.json({
      message: '已成功清空本地邮件缓存',
      deleted_count: res.meta?.changes || 0
    });
  } catch (err: any) {
    console.error('Error in DELETE /emails:', err);
    return c.json({ detail: `清空邮件失败: ${err.message || String(err)}` }, 500);
  }
});

// 删除单封邮件缓存
app.delete('/emails/:id', async (c) => {
  try {
    const user = c.get('user');
    const id = parseInt(c.req.param('id'), 10);

    const email = await c.env.DB.prepare(
      'SELECT id, poster_url, attachments FROM user_cached_emails WHERE id = ? AND user_id = ?'
    ).bind(id, user.id).first<{ id: number; poster_url: string; attachments: string }>();

    if (!email) {
      return c.json({ detail: '未找到该邮件' }, 404);
    }

    await c.env.DB.prepare(
      'DELETE FROM user_cached_emails WHERE id = ? AND user_id = ?'
    ).bind(id, user.id).run();

    const fileUrls = extractFileUrlsFromEmailRow(email);
    if (fileUrls.length > 0) {
      c.executionCtx.waitUntil(cleanupOrphanPosters(c.env.DB, c.env.FILES_BUCKET, fileUrls));
    }

    return c.json({ message: '邮件已成功删除', id });
  } catch (err: any) {
    console.error('Error in DELETE /emails/:id:', err);
  }
});

async function ensureSmtpTables(db: D1Database): Promise<void> {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS system_smtp_configs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      host VARCHAR(150) NOT NULL,
      port INTEGER NOT NULL DEFAULT 465,
      use_ssl BOOLEAN NOT NULL DEFAULT 1,
      username VARCHAR(150) NOT NULL,
      encrypted_password TEXT NOT NULL,
      from_email VARCHAR(150) NOT NULL,
      from_name VARCHAR(100) DEFAULT '',
      use_imap_password BOOLEAN DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS sent_emails (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      subject TEXT NOT NULL,
      sender_name VARCHAR(150) NOT NULL,
      sender_email VARCHAR(150) NOT NULL,
      recipients TEXT NOT NULL,
      body_text TEXT NOT NULL,
      body_html TEXT DEFAULT '',
      status VARCHAR(20) DEFAULT 'sent',
      error_message TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_sent_emails_user ON sent_emails(user_id)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_sent_emails_created ON sent_emails(created_at)`)
  ]).catch(err => {
    console.warn('Error ensuring smtp tables:', err);
  });

  try {
    await db.prepare('ALTER TABLE system_smtp_configs ADD COLUMN use_imap_password BOOLEAN DEFAULT 0').run();
  } catch {}
}

// 获取 SMTP 发信配置 (仅管理员)
app.get('/smtp-config', adminOnlyMiddleware, async (c) => {
  try {
    await ensureSmtpTables(c.env.DB);
    const user = c.get('user');
    const config = await c.env.DB.prepare(
      'SELECT * FROM system_smtp_configs ORDER BY id DESC LIMIT 1'
    ).first<any>();

    const userImap = await c.env.DB.prepare(
      'SELECT email_address, encrypted_password FROM user_mail_configs WHERE user_id = ?'
    ).bind(user.id).first<any>();

    const hasImapPassword = Boolean(userImap?.encrypted_password);
    const imapEmail = userImap?.email_address || '';

    if (!config) {
      return c.json({
        has_config: false,
        has_imap_password: hasImapPassword,
        imap_email: imapEmail
      });
    }

    return c.json({
      has_config: true,
      host: config.host,
      port: config.port,
      use_ssl: Boolean(config.use_ssl),
      username: config.username,
      from_email: config.from_email,
      from_name: config.from_name || '',
      has_password: Boolean(config.encrypted_password),
      use_imap_password: Boolean(config.use_imap_password),
      has_imap_password: hasImapPassword,
      imap_email: imapEmail,
      updated_at: config.updated_at || ''
    });
  } catch (err: any) {
    console.error('Error in GET /smtp-config:', err);
    return c.json({ has_config: false, detail: err.message || '获取 SMTP 配置失败' }, 500);
  }
});

// 保存或更新 SMTP 发信配置 (仅管理员)
app.post('/smtp-config', adminOnlyMiddleware, async (c) => {
  try {
    await ensureSmtpTables(c.env.DB);
    const user = c.get('user');
    const body = await c.req.json().catch(() => ({}));

    const host = (body.host || body.server_host || '').trim();
    const port = parseInt(body.port || body.server_port, 10) || 465;
    const useSsl = body.use_ssl !== false ? 1 : 0;
    const username = (body.username || '').trim();
    const password = (body.password || '').trim();
    const fromEmail = (body.from_email || username || '').trim();
    const fromName = (body.from_name || user.real_name || user.name || '').trim();
    const useImapPassword = Boolean(body.use_imap_password);

    if (!host || !username || !fromEmail) {
      return c.json({ detail: 'SMTP 服务器、用户名与发件人邮箱均不能为空' }, 400);
    }

    const existing = await c.env.DB.prepare(
      'SELECT * FROM system_smtp_configs ORDER BY id DESC LIMIT 1'
    ).first<any>();

    let encPass = existing?.encrypted_password || '';

    if (useImapPassword) {
      const userImap = await c.env.DB.prepare(
        'SELECT encrypted_password FROM user_mail_configs WHERE user_id = ?'
      ).bind(user.id).first<any>();
      if (!userImap?.encrypted_password) {
        return c.json({ detail: '未找到接收服务 (IMAP) 的客户端授权码，请先在接收服务中保存' }, 400);
      }
      encPass = userImap.encrypted_password;
    } else if (password) {
      encPass = Buffer.from(password, 'utf-8').toString('base64');
    }

    if (!encPass) {
      return c.json({ detail: '请提供发信客户端授权码，或勾选复用接收服务 (IMAP) 授权码' }, 422);
    }

    if (!existing) {
      await c.env.DB.prepare(
        `INSERT INTO system_smtp_configs (user_id, host, port, use_ssl, username, encrypted_password, from_email, from_name, use_imap_password, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
      ).bind(user.id, host, port, useSsl, username, encPass, fromEmail, fromName, useImapPassword ? 1 : 0).run();
    } else {
      await c.env.DB.prepare(
        `UPDATE system_smtp_configs
         SET user_id = ?, host = ?, port = ?, use_ssl = ?, username = ?, encrypted_password = ?, from_email = ?, from_name = ?, use_imap_password = ?, updated_at = datetime('now')
         WHERE id = ?`
      ).bind(user.id, host, port, useSsl, username, encPass, fromEmail, fromName, useImapPassword ? 1 : 0, existing.id).run();
    }

    const updated = await c.env.DB.prepare(
      'SELECT * FROM system_smtp_configs ORDER BY id DESC LIMIT 1'
    ).first<any>();

    const userImap = await c.env.DB.prepare(
      'SELECT email_address, encrypted_password FROM user_mail_configs WHERE user_id = ?'
    ).bind(user.id).first<any>();

    return c.json({
      has_config: true,
      host: updated.host,
      port: updated.port,
      use_ssl: Boolean(updated.use_ssl),
      username: updated.username,
      from_email: updated.from_email,
      from_name: updated.from_name || '',
      has_password: Boolean(updated.encrypted_password),
      use_imap_password: Boolean(updated.use_imap_password),
      has_imap_password: Boolean(userImap?.encrypted_password),
      imap_email: userImap?.email_address || '',
      updated_at: updated.updated_at || ''
    });
  } catch (err: any) {
    console.error('Error in POST /smtp-config:', err);
    return c.json({ detail: `保存 SMTP 配置失败: ${err.message || String(err)}` }, 500);
  }
});

// 测试 SMTP 连接 (仅管理员)
app.post('/test-smtp', adminOnlyMiddleware, async (c) => {
  try {
    await ensureSmtpTables(c.env.DB);
    const user = c.get('user');
    const body = await c.req.json().catch(() => ({}));
    const host = (body.host || body.server_host || '').trim();
    const port = parseInt(body.port || body.server_port, 10) || 465;
    const useSsl = body.use_ssl !== false;
    const username = (body.username || '').trim();
    let password = (body.password || '').trim();
    const useImapPassword = Boolean(body.use_imap_password);

    if (!host || !username) {
      return c.json({ success: false, message: '请填写完整的 SMTP 服务器地址与用户名' }, 400);
    }

    if (useImapPassword) {
      const userImap = await c.env.DB.prepare(
        'SELECT encrypted_password FROM user_mail_configs WHERE user_id = ?'
      ).bind(user.id).first<any>();
      if (userImap && userImap.encrypted_password) {
        password = decryptUserPassword(userImap.encrypted_password, c.env.JWT_SECRET);
      }
      if (!password) {
        return c.json({ success: false, message: '未找到接收服务 (IMAP) 的客户端授权码，请先在接收服务中配置' }, 400);
      }
    } else if (!password) {
      const existing = await c.env.DB.prepare(
        'SELECT encrypted_password, use_imap_password FROM system_smtp_configs ORDER BY id DESC LIMIT 1'
      ).first<any>();
      if (existing && existing.use_imap_password) {
        const userImap = await c.env.DB.prepare(
          'SELECT encrypted_password FROM user_mail_configs WHERE user_id = ?'
        ).bind(user.id).first<any>();
        if (userImap && userImap.encrypted_password) {
          password = decryptUserPassword(userImap.encrypted_password, c.env.JWT_SECRET);
        }
      }
      if (!password && existing && existing.encrypted_password) {
        password = decryptUserPassword(existing.encrypted_password, c.env.JWT_SECRET);
      }
      if (!password) {
        return c.json({ success: false, message: '请输入发信客户端授权码以进行连接测试' }, 422);
      }
    }

    const client = new CloudflareSmtpClient();
    try {
      await client.connect(host, port, useSsl, 10000);
      await client.login(username, password, 10000);
      await client.close();
      return c.json({
        success: true,
        message: `SMTP 服务器连接与授权码认证成功！(${host}:${port})`
      });
    } catch (connErr: any) {
      await client.close();
      return c.json({
        success: false,
        message: `SMTP 连接或授权码认证失败: ${connErr.message || String(connErr)}`
      }, 400);
    }
  } catch (err: any) {
    console.error('Error in POST /test-smtp:', err);
    return c.json({
      success: false,
      message: `测试异常: ${err.message || String(err)}`
    }, 500);
  }
});

// 发送组会邮件通知 (仅管理员)
app.post('/send-seminar-notice', adminOnlyMiddleware, async (c) => {
  try {
    await ensureSmtpTables(c.env.DB);
    const user = c.get('user');
    const body = await c.req.json().catch(() => ({}));

    const subject = (body.subject || '').trim();
    const emailBody = (body.body || body.body_text || body.text || '').trim();
    const memberIds: number[] = Array.isArray(body.member_ids) ? body.member_ids : [];
    const externalEmailsRaw = body.external_emails;
    const directRecipients = Array.isArray(body.recipients) ? body.recipients : (typeof body.recipients === 'string' ? [body.recipients] : []);

    if (!subject) {
      return c.json({ detail: '邮件主题不能为空' }, 400);
    }
    if (!emailBody) {
      return c.json({ detail: '邮件正文不能为空' }, 400);
    }

    // 1. 获取选中的注册组员邮箱
    const memberEmails: string[] = [];
    if (memberIds.length > 0) {
      const placeholders = memberIds.map(() => '?').join(',');
      const { results: members } = await c.env.DB.prepare(
        `SELECT email FROM users WHERE id IN (${placeholders}) AND email IS NOT NULL AND email != ''`
      ).bind(...memberIds).all<{ email: string }>();

      for (const m of (members || [])) {
        if (m.email && m.email.trim()) {
          memberEmails.push(m.email.trim().toLowerCase());
        }
      }
    }

    // 2. 解析外部输入的邮箱
    let parsedExternals: string[] = [];
    if (Array.isArray(externalEmailsRaw)) {
      parsedExternals = parseExternalEmails(externalEmailsRaw.join(','));
    } else if (typeof externalEmailsRaw === 'string') {
      parsedExternals = parseExternalEmails(externalEmailsRaw);
    }

    // 3. 解析直接传入的收件人列表 (支持 recipients: ['a@b.com', ...])
    let parsedDirect: string[] = [];
    if (directRecipients.length > 0) {
      parsedDirect = parseExternalEmails(directRecipients.join(','));
    }

    // 4. 汇总去重
    const allRecipients = Array.from(new Set([...memberEmails, ...parsedExternals, ...parsedDirect]));
    if (allRecipients.length === 0) {
      return c.json({ detail: '请至少勾选一位已注册组员或输入一个合法的外部邮箱' }, 400);
    }

    // 4. 读取 SMTP 配置
    const smtpConfig = await c.env.DB.prepare(
      'SELECT * FROM system_smtp_configs ORDER BY id DESC LIMIT 1'
    ).first<any>();

    if (!smtpConfig) {
      return c.json({ detail: '系统尚未配置发件服务 (SMTP)，请管理员先在「邮箱设置」中配置发信服务器' }, 400);
    }

    let password = '';
    if (smtpConfig.use_imap_password && smtpConfig.user_id) {
      const userImap = await c.env.DB.prepare(
        'SELECT encrypted_password FROM user_mail_configs WHERE user_id = ?'
      ).bind(smtpConfig.user_id).first<any>();
      if (userImap && userImap.encrypted_password) {
        password = decryptUserPassword(userImap.encrypted_password, c.env.JWT_SECRET);
      }
    }
    if (!password) {
      password = decryptUserPassword(smtpConfig.encrypted_password, c.env.JWT_SECRET);
    }
    if (!password) {
      return c.json({ detail: '解密客户端授权码失败，请在设置中重新保存发信客户端授权码' }, 400);
    }

    const fromEmail = smtpConfig.from_email || smtpConfig.username;
    const fromName = smtpConfig.from_name || user.real_name || user.name || '研讨会管理员';

    // 5. 执行发信
    const client = new CloudflareSmtpClient();
    try {
      await client.connect(smtpConfig.host, smtpConfig.port, Boolean(smtpConfig.use_ssl), 15000);
      await client.login(smtpConfig.username, password, 15000);

      const sendResult = await client.sendMail({
        fromEmail,
        fromName,
        to: allRecipients,
        subject,
        text: emailBody
      }, 35000);

      // 6. 发信成功记录入库
      await c.env.DB.prepare(
        `INSERT INTO sent_emails (user_id, subject, sender_name, sender_email, recipients, body_text, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'sent', datetime('now'))`
      ).bind(
        user.id,
        subject,
        fromName,
        fromEmail,
        JSON.stringify(sendResult.accepted),
        emailBody
      ).run();

      return c.json({
        success: true,
        message: `组会通知已成功发送给 ${sendResult.accepted.length} 位收件人`,
        sent_count: sendResult.accepted.length,
        recipients: sendResult.accepted,
        rejected_count: sendResult.rejected.length,
        rejected: sendResult.rejected
      });
    } catch (sendErr: any) {
      await client.close();

      // 发信失败记录留痕
      await c.env.DB.prepare(
        `INSERT INTO sent_emails (user_id, subject, sender_name, sender_email, recipients, body_text, status, error_message, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'failed', ?, datetime('now'))`
      ).bind(
        user.id,
        subject,
        fromName,
        fromEmail,
        JSON.stringify(allRecipients),
        emailBody,
        sendErr.message || String(sendErr)
      ).run().catch(() => {});

      console.error('Error sending seminar notice:', sendErr);
      return c.json({
        detail: `发送组会通知邮件失败: ${sendErr.message || String(sendErr)}`
      }, 500);
    }
  } catch (err: any) {
    console.error('Error in POST /send-seminar-notice:', err);
    return c.json({ detail: `发信接口处理异常: ${err.message || String(err)}` }, 500);
  }
});

// 获取已发送的通知邮件列表
app.get('/sent-emails', async (c) => {
  try {
    await ensureSmtpTables(c.env.DB);
    const user = c.get('user');
    if (!user) {
      return c.json({ detail: '未授权访问' }, 401);
    }

    const { results } = await c.env.DB.prepare(
      `SELECT id, user_id, subject, sender_name, sender_email, recipients, body_text, status, error_message, created_at
       FROM sent_emails
       WHERE user_id = ?
       ORDER BY id DESC LIMIT 100`
    ).bind(user.id).all();

    const list = (results || []).map((item: any) => {
      let recList: string[] = [];
      try {
        recList = JSON.parse(item.recipients);
      } catch {
        recList = (item.recipients || '').split(',').map((s: string) => s.trim()).filter(Boolean);
      }
      return {
        ...item,
        recipients: recList,
        snippet: (item.body_text || '').replace(/\s+/g, ' ').trim().slice(0, 180)
      };
    });

    return c.json(list);
  } catch (err: any) {
    console.error('Error in GET /sent-emails:', err);
    return c.json([]);
  }
});

// 获取已发送邮件详情（仅发件人本人可查看）
app.get('/sent-emails/:id', async (c) => {
  try {
    await ensureSmtpTables(c.env.DB);
    const user = c.get('user');
    if (!user) {
      return c.json({ detail: '未授权访问' }, 401);
    }

    const id = parseInt(c.req.param('id'), 10);
    const item = await c.env.DB.prepare(
      `SELECT * FROM sent_emails WHERE id = ? AND user_id = ?`
    ).bind(id, user.id).first<any>();

    if (!item) {
      return c.json({ detail: '未找到该发信记录或无权查看' }, 404);
    }

    let recList: string[] = [];
    try {
      recList = JSON.parse(item.recipients);
    } catch {
      recList = (item.recipients || '').split(',').map((s: string) => s.trim()).filter(Boolean);
    }

    return c.json({
      ...item,
      recipients: recList,
      snippet: (item.body_text || '').replace(/\s+/g, ' ').trim().slice(0, 180)
    });
  } catch (err: any) {
    console.error('Error in GET /sent-emails/:id:', err);
    return c.json({ detail: '获取发件详情失败' }, 500);
  }
});

export default app;

