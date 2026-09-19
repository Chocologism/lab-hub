import { connect } from 'cloudflare:sockets';
import { Buffer } from 'node:buffer';

export interface SendMailOptions {
  fromEmail: string;
  fromName?: string;
  to: string[];
  subject: string;
  text: string;
  html?: string;
}

export interface SmtpResponse {
  code: number;
  lines: string[];
  message: string;
}

export class CloudflareSmtpClient {
  private socket: any = null;
  private reader: any = null;
  private writer: any = null;
  private buffer: Uint8Array = new Uint8Array(0);
  private decoder = new TextDecoder('utf-8', { fatal: false });

  private appendBuffer(chunk: Uint8Array) {
    const next = new Uint8Array(this.buffer.length + chunk.length);
    next.set(this.buffer);
    next.set(chunk, this.buffer.length);
    this.buffer = next;
  }

  private async readMore(timeoutMs: number = 10000): Promise<boolean> {
    const timeoutPromise = new Promise<null>((_, reject) =>
      setTimeout(() => reject(new Error('SMTP 连接响应超时')), timeoutMs)
    );
    const readPromise = this.reader.read();
    const res: any = await Promise.race([readPromise, timeoutPromise]);
    if (!res || res.done) {
      return false;
    }
    this.appendBuffer(res.value);
    return true;
  }

  private async readLine(timeoutMs: number = 10000): Promise<string> {
    while (true) {
      const idx = this.buffer.indexOf(10); // \n
      if (idx !== -1) {
        const lineBytes = this.buffer.slice(0, idx + 1);
        this.buffer = this.buffer.slice(idx + 1);
        return this.decoder.decode(lineBytes).replace(/\r\n$/, '').replace(/\n$/, '');
      }
      const hasMore = await this.readMore(timeoutMs);
      if (!hasMore) {
        if (this.buffer.length > 0) {
          const remaining = this.decoder.decode(this.buffer);
          this.buffer = new Uint8Array(0);
          return remaining;
        }
        throw new Error('SMTP 服务器过早关闭了连接');
      }
    }
  }

  async readResponse(timeoutMs: number = 10000): Promise<SmtpResponse> {
    const lines: string[] = [];
    let finalCode = 0;

    while (true) {
      const line = await this.readLine(timeoutMs);
      lines.push(line);

      // RFC 5321: multi-line reply lines look like "250-something", final line "250 something" or "250"
      if (line.length >= 3 && /^\d{3}/.test(line)) {
        finalCode = parseInt(line.substring(0, 3), 10);
        const sep = line.charAt(3);
        if (sep !== '-') {
          // This is the terminating line of this reply
          break;
        }
      }
    }

    return {
      code: finalCode,
      lines,
      message: lines.join('\n')
    };
  }

  private async writeCommand(cmd: string): Promise<void> {
    const data = new TextEncoder().encode(cmd + '\r\n');
    await this.writer.write(data);
  }

  async connect(hostname: string, port: number = 465, useSsl: boolean = true, timeoutMs: number = 10000): Promise<string> {
    this.socket = connect({ hostname, port }, { secureTransport: useSsl ? 'on' : 'off' });
    this.reader = this.socket.readable.getReader();
    this.writer = this.socket.writable.getWriter();

    // 1. 读取服务器欢迎 Banner（通常以 220 开头）
    const greeting = await this.readResponse(timeoutMs);
    if (greeting.code !== 220) {
      throw new Error(`SMTP 服务器响应异常 (${greeting.code}): ${greeting.message}`);
    }

    // 2. 发送 EHLO 握手
    await this.writeCommand(`EHLO labhub.local`);
    let ehloRes = await this.readResponse(timeoutMs);
    if (ehloRes.code !== 250) {
      // 兼容某些老旧服务器 HELO
      await this.writeCommand(`HELO labhub.local`);
      ehloRes = await this.readResponse(timeoutMs);
      if (ehloRes.code !== 250) {
        throw new Error(`EHLO/HELO 握手失败 (${ehloRes.code}): ${ehloRes.message}`);
      }
    }

    // 3. 若使用非直接 SSL 连接（如端口 587 / 25），且服务器支持 STARTTLS，尝试升级 TLS
    if (!useSsl && ehloRes.lines.some(l => /STARTTLS/i.test(l))) {
      try {
        await this.writeCommand('STARTTLS');
        const starttlsRes = await this.readResponse(timeoutMs);
        if (starttlsRes.code === 220 && typeof this.socket.startTls === 'function') {
          this.reader.releaseLock();
          this.writer.releaseLock();
          this.socket = this.socket.startTls();
          this.reader = this.socket.readable.getReader();
          this.writer = this.socket.writable.getWriter();

          // TLS 握手后需要再次 EHLO
          await this.writeCommand(`EHLO labhub.local`);
          await this.readResponse(timeoutMs);
        }
      } catch (tlsErr) {
        console.warn('STARTTLS 协商失败，尝试继续明文连接:', tlsErr);
      }
    }

    return greeting.message;
  }

  async login(username: string, pass: string, timeoutMs: number = 10000): Promise<void> {
    // 发起 AUTH LOGIN 交互式登录
    await this.writeCommand('AUTH LOGIN');
    const authStart = await this.readResponse(timeoutMs);
    if (authStart.code !== 334) {
      throw new Error(`AUTH LOGIN 失败 (${authStart.code}): ${authStart.message}`);
    }

    // 发送 Base64 编码的用户名
    const b64User = Buffer.from(username, 'utf-8').toString('base64');
    await this.writeCommand(b64User);
    const userRes = await this.readResponse(timeoutMs);
    if (userRes.code !== 334) {
      throw new Error(`SMTP 用户名验证未通过 (${userRes.code}): ${userRes.message}`);
    }

    // 发送 Base64 编码的密码 / 授权码
    const b64Pass = Buffer.from(pass, 'utf-8').toString('base64');
    await this.writeCommand(b64Pass);
    const passRes = await this.readResponse(timeoutMs);
    if (passRes.code !== 235) {
      throw new Error(`SMTP 登录认证失败，请检查账号或授权码 (${passRes.code}): ${passRes.message}`);
    }
  }

  async sendMail(
    options: SendMailOptions,
    timeoutMs: number = 25000
  ): Promise<{ accepted: string[]; rejected: string[] }> {
    const { fromEmail, fromName, to, subject, text, html } = options;
    if (!to || to.length === 0) {
      throw new Error('收件人列表不能为空');
    }

    // 1. MAIL FROM
    await this.writeCommand(`MAIL FROM:<${fromEmail}>`);
    const fromRes = await this.readResponse(timeoutMs);
    if (fromRes.code !== 250) {
      throw new Error(`发件人地址被拒绝 (${fromRes.code}): ${fromRes.message}`);
    }

    // 2. RCPT TO（批量验证收件人）
    const accepted: string[] = [];
    const rejected: string[] = [];

    for (const rcpt of to) {
      const cleanRcpt = rcpt.trim();
      if (!cleanRcpt) continue;
      await this.writeCommand(`RCPT TO:<${cleanRcpt}>`);
      const rcptRes = await this.readResponse(timeoutMs);
      if (rcptRes.code === 250 || rcptRes.code === 251) {
        accepted.push(cleanRcpt);
      } else {
        rejected.push(cleanRcpt);
      }
    }

    if (accepted.length === 0) {
      throw new Error(`所有收件人地址均被 SMTP 服务器拒绝: ${rejected.join(', ')}`);
    }

    // 3. DATA 准备发送正文
    await this.writeCommand('DATA');
    const dataRes = await this.readResponse(timeoutMs);
    if (dataRes.code !== 354) {
      throw new Error(`无法开启 DATA 传输 (${dataRes.code}): ${dataRes.message}`);
    }

    // 4. 组装 RFC 2822 / MIME 规范报文
    const encodedSubject = `=?UTF-8?B?${Buffer.from(subject, 'utf-8').toString('base64')}?=`;
    const fromDisplay = fromName ? `=?UTF-8?B?${Buffer.from(fromName, 'utf-8').toString('base64')}?= <${fromEmail}>` : `<${fromEmail}>`;
    const toDisplay = accepted.join(', ');
    const dateHeader = new Date().toUTCString();
    const domain = fromEmail.split('@')[1] || 'labhub.local';
    const messageId = `<${Date.now()}.${Math.random().toString(36).substring(2, 10)}@${domain}>`;

    let emailHeaders = [
      `From: ${fromDisplay}`,
      `To: ${toDisplay}`,
      `Subject: ${encodedSubject}`,
      `Date: ${dateHeader}`,
      `Message-ID: ${messageId}`,
      `MIME-Version: 1.0`
    ];

    let emailPayload = '';

    if (html) {
      const boundary = `====_LABHUB_MULTIPART_${Date.now()}_====`;
      emailHeaders.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);

      const textBase64 = Buffer.from(text, 'utf-8').toString('base64').match(/.{1,76}/g)?.join('\r\n') || '';
      const htmlBase64 = Buffer.from(html, 'utf-8').toString('base64').match(/.{1,76}/g)?.join('\r\n') || '';

      emailPayload = [
        emailHeaders.join('\r\n'),
        '',
        `--${boundary}`,
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: base64',
        '',
        textBase64,
        '',
        `--${boundary}`,
        'Content-Type: text/html; charset=UTF-8',
        'Content-Transfer-Encoding: base64',
        '',
        htmlBase64,
        '',
        `--${boundary}--`,
        ''
      ].join('\r\n');
    } else {
      emailHeaders.push('Content-Type: text/plain; charset=UTF-8');
      emailHeaders.push('Content-Transfer-Encoding: base64');
      const textBase64 = Buffer.from(text, 'utf-8').toString('base64').match(/.{1,76}/g)?.join('\r\n') || '';

      emailPayload = [
        emailHeaders.join('\r\n'),
        '',
        textBase64,
        ''
      ].join('\r\n');
    }

    // 5. 写入报文，并以 \r\n.\r\n 结尾
    await this.writer.write(new TextEncoder().encode(emailPayload + '\r\n.\r\n'));
    const finishRes = await this.readResponse(timeoutMs);
    if (finishRes.code !== 250) {
      throw new Error(`邮件发送未能成功排队 (${finishRes.code}): ${finishRes.message}`);
    }

    // 6. 优雅 QUIT 退出
    try {
      await this.writeCommand('QUIT');
      await this.readResponse(3000);
    } catch {}

    await this.close();
    return { accepted, rejected };
  }

  async close(): Promise<void> {
    try {
      if (this.reader) this.reader.releaseLock();
    } catch {}
    try {
      if (this.writer) this.writer.releaseLock();
    } catch {}
    try {
      if (this.socket) await this.socket.close();
    } catch {}
    this.buffer = new Uint8Array(0);
  }
}

/**
 * 将外部邮箱输入（逗号、分号、换行分隔）解析并校验提取为合法邮箱列表
 */
export function parseExternalEmails(raw: string): string[] {
  if (!raw) return [];
  const tokens = raw.split(/[\s,;，；\n\r]+/).map(s => s.trim()).filter(Boolean);
  const validEmails: string[] = [];
  const seen = new Set<string>();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  for (const t of tokens) {
    const clean = t.toLowerCase();
    if (emailRegex.test(clean) && !seen.has(clean)) {
      seen.add(clean);
      validEmails.push(clean);
    }
  }
  return validEmails;
}

/**
 * 格式化组会日期与时间为自然语言（如：9月16日（周三）上午10点）
 */
export function formatSeminarDateTime(dateStr: string, timeStr: string): string {
  if (!dateStr) return '';
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const parts = dateStr.split('-');
  if (parts.length < 3) return `${dateStr} ${timeStr || ''}`.trim();

  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);
  const d = new Date(`${dateStr}T00:00:00`);
  const w = isNaN(d.getDay()) ? '' : weekdays[d.getDay()];

  let formattedTime = (timeStr || '').trim();
  if (formattedTime) {
    const [hStr, mStr] = formattedTime.split(':');
    const h = parseInt(hStr, 10);
    const m = parseInt(mStr || '0', 10);
    if (!isNaN(h)) {
      const period = h < 12 ? '上午' : (h === 12 ? '中午' : '下午');
      const hourDisplay = h > 12 ? (h - 12) : h;
      if (m === 0) {
        formattedTime = `${period}${hourDisplay}点`;
      } else {
        formattedTime = `${period}${hourDisplay}点${m}分`;
      }
    }
  }

  const datePart = `${month}月${day}日${w ? `（${w}）` : ''}`;
  return `${datePart}${formattedTime ? ' ' + formattedTime : ''}`.trim();
}

/**
 * 组会通知固定模板生成器
 */
export function buildSeminarNoticeBody(params: {
  dateStr: string;
  timeStr: string;
  location: string;
  presenterName: string;
  presentationsText?: string;
  topic: string;
  adminName: string;
}): string {
  const formattedTime = formatSeminarDateTime(params.dateStr, params.timeStr);
  const loc = (params.location || '').trim();

  // 区分线下地点与线上腾讯会议
  let offlineLoc = loc;
  let onlineMeeting = '';

  const onlineMatch = loc.match(/(腾讯会议|Zoom|会议号|Voov)[:：\s]*([0-9\s\-]+)/i);
  if (onlineMatch) {
    onlineMeeting = onlineMatch[0].trim();
    offlineLoc = loc.replace(onlineMatch[0], '').replace(/[\/|,，]/g, '').trim();
  }

  if (!offlineLoc && !onlineMeeting) {
    offlineLoc = '物理楼研讨室 / 腾讯会议（详见群内通知）';
  }

  let lines: string[] = [
    '大家好，',
    '',
    '下次组会安排如下：',
    '',
    `时间：${formattedTime || '待定'}`,
    ''
  ];

  if (offlineLoc) {
    lines.push(`地点：${offlineLoc}`);
    lines.push('');
  }

  if (onlineMeeting) {
    lines.push(`线上：${onlineMeeting}`);
    lines.push('');
  } else if (!offlineLoc) {
    lines.push('线上：腾讯会议（待定）');
    lines.push('');
  }

  lines.push(`主讲人：${params.presenterName || '待定'}`);
  lines.push('');

  if (params.presentationsText && params.presentationsText.trim()) {
    lines.push(`arXiv分享人：${params.presentationsText.trim()}`);
    lines.push('');
  }

  lines.push(`本次组会将围绕 ${params.topic || '近期科研进展'} 进行分享和讨论。`);
  lines.push('');
  lines.push('另外，后续组会安排有个别调整，具体请参见附件。');
  lines.push('');
  lines.push('请大家准时参加，谢谢！');
  lines.push('');
  lines.push('祝好，');
  lines.push('');
  lines.push(params.adminName || '管理员');

  return lines.join('\n');
}
