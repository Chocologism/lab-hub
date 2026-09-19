import { connect } from 'cloudflare:sockets';
import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';

export interface ImageAttachment {
  filename: string;
  contentType: string;
  data: Uint8Array;
}

export interface DocumentAttachment {
  filename: string;
  contentType: string;
  data: Uint8Array;
}

export interface ParsedEmail {
  msg_uid: string;
  subject: string;
  sender_name: string;
  sender_email: string;
  recipient: string;
  date_str: string;
  snippet: string;
  body_text: string;
  body_html: string;
  has_attachments: boolean;
  poster_url?: string;
  imageAttachment?: ImageAttachment;
  imageAttachments?: ImageAttachment[];
  documentAttachments?: DocumentAttachment[];
}

export function isConferenceEmail(email: { subject?: string; snippet?: string; body_text?: string } | null | undefined): boolean {
  if (!email) return false;
  const title = (email.subject || '').toLowerCase();
  const snippet = (email.snippet || '').toLowerCase();
  const body = (email.body_text || '').toLowerCase();
  const combined = `${title} \n ${snippet} \n ${body}`;

  if (/学术会议|研讨会|学术论坛|年会|研讨班|讲习班|研习班|暑期学校|暑假学校|冬令营|大会通知|征文通知|征稿通知|第一轮通知|第二轮通知|第三轮通知|会议通知|参会通知|注册通知|邀请函|call for papers|conference|symposium|workshop|annual meeting|summer school|winter school|congress/i.test(title)) {
    return true;
  }

  const hasConfKeywords = /会议|研讨会|论坛|年会|研讨班|讲习班|暑期学校|conference|symposium|workshop|school/i.test(combined);
  const hasActionKeywords = /征文|征稿|注册|报名|参会|摘要提交|截稿|早鸟|酒店预订|会议日程|registration|submission|deadline|early bird|call for papers/i.test(combined);
  const hasHostKeywords = /主办|承办|协办|举办地点|召开|举行|organizer|hosted by/i.test(combined);

  if (hasConfKeywords && (hasActionKeywords || hasHostKeywords)) {
    return true;
  }

  return false;
}

export function isTalkEmail(email: { subject?: string; snippet?: string; body_text?: string } | null | undefined): boolean {
  if (!email) return false;
  const title = (email.subject || '').toLowerCase();
  const snippet = (email.snippet || '').toLowerCase();
  const body = (email.body_text || '').toLowerCase();
  const combined = `${title} \n ${snippet} \n ${body}`;

  if (/报告|讲座|seminar|colloquium|talk|沙龙|组会|研讨会|学术论坛|青年论坛|前沿论坛|专题论坛|学术交流|交流会/i.test(title)) return true;
  if (/第\s*\d+\s*[期届].*?(?:论坛|报告|讲座|交流)/i.test(title)) return true;

  const hasSpeaker = /报告人|主讲人|主讲嘉宾|特邀嘉宾|speaker|presenter|邀请(?:到了|到|了)?(?:[^,，。；\n\r]*?的)?\s*[A-Za-z\u4e00-\u9fa5·]{2,6}\s*(?:博士|教授|研究员|特聘研究员|副教授|院士|老师)/i.test(combined);
  const hasTopic = /做题为|题为|报告题目|报告主题|题目为|题目是|[《“][^》”\n\r]{4,100}[》”]\s*(?:的)?(?:学术)?(?:报告|讲座)/i.test(combined);
  const hasTimeOrPlace = /时间|日期|地点|会议室|报告厅|大厦|教室|腾讯会议|zoom|venue|location|date|time/i.test(combined);
  const hasTalkContext = /报告|讲座|seminar|colloquium|talk|沙龙|组会|研讨会|论坛|交流/i.test(combined);

  if (hasSpeaker && hasTimeOrPlace) return true;
  if (hasTopic && (hasTimeOrPlace || hasSpeaker)) return true;
  if (hasTalkContext && hasTimeOrPlace && (hasSpeaker || hasTopic)) return true;

  return false;
}

export function decryptUserPassword(token: string, secretKey: string = 'labhub-secure-secret-key-2026'): string {
  if (!token) return '';
  const candidateKeys = Array.from(new Set([
    secretKey,
    'labhub-secure-secret-key-2026',
  ])).filter(Boolean);

  // 1. Try Python HMAC-SHA256 cipher with candidate keys
  for (const k of candidateKeys) {
    try {
      let b64 = token.replace(/-/g, '+').replace(/_/g, '/');
      while (b64.length % 4) b64 += '=';
      const raw = Buffer.from(b64, 'base64');
      if (raw.length >= 48) {
        const payload = raw.subarray(0, raw.length - 32);
        const expectedSig = raw.subarray(raw.length - 32);
        const key = crypto.createHash('sha256').update(k, 'utf-8').digest();
        const sig = crypto.createHmac('sha256', key).update(payload).digest();
        if (crypto.timingSafeEqual(sig, expectedSig)) {
          const salt = payload.subarray(0, 16);
          const cipher = payload.subarray(16);
          const keystream: number[] = [];
          let counter = 0;
          while (keystream.length < cipher.length) {
            const counterBuf = Buffer.alloc(4);
            counterBuf.writeUInt32BE(counter, 0);
            const block = crypto.createHmac('sha256', key).update(Buffer.concat([salt, counterBuf])).digest();
            for (let i = 0; i < block.length; i++) keystream.push(block[i]);
            counter++;
          }
          const plain = Buffer.alloc(cipher.length);
          for (let i = 0; i < cipher.length; i++) {
            plain[i] = cipher[i] ^ keystream[i];
          }
          return plain.toString('utf-8');
        }
      }
    } catch {}
  }

  // 2. Try Base64 plaintext fallback
  try {
    const plain = Buffer.from(token, 'base64').toString('utf-8');
    if (plain && !/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(plain)) {
      return plain;
    }
  } catch {}

  return token;
}

export function decodeMimeHeader(raw: string): string {
  if (!raw) return '';
  // RFC 2047: Remove linear whitespace between adjacent encoded words
  const cleanRaw = raw.replace(/\?=\s+=\?/g, '?==?');
  return cleanRaw.replace(/=\?([^?]+)\?([bBqQ])\?([^?]+)\?=/g, (_, charset, encoding, text) => {
    try {
      const cs = charset.toLowerCase();
      const enc = encoding.toUpperCase();
      if (enc === 'B') {
        const bytes = Buffer.from(text.replace(/\s/g, ''), 'base64');
        const decoder = new TextDecoder(cs === 'gb2312' || cs === 'gbk' ? 'gb18030' : cs, { fatal: false });
        return decoder.decode(bytes);
      } else if (enc === 'Q') {
        const decodedStr = text.replace(/_/g, ' ').replace(/=([0-9A-Fa-f]{2})/g, (_m: string, hex: string) => {
          return String.fromCharCode(parseInt(hex, 16));
        });
        const bytes = new Uint8Array(decodedStr.length);
        for (let i = 0; i < decodedStr.length; i++) bytes[i] = decodedStr.charCodeAt(i);
        const decoder = new TextDecoder(cs === 'gb2312' || cs === 'gbk' ? 'gb18030' : cs, { fatal: false });
        return decoder.decode(bytes);
      }
    } catch {
      return text;
    }
    return text;
  });
}

export function decodeHeaderValue(raw: string): string {
  if (!raw) return '';
  const str = raw.trim().replace(/^["']|["']$/g, '');
  const rfc2231 = str.match(/^([^']*)'([^']*)'(.*)$/);
  if (rfc2231) {
    const charset = (rfc2231[1] || 'utf-8').toLowerCase();
    const encoded = rfc2231[3];
    try {
      return decodeURIComponent(encoded);
    } catch {
      try {
        const hex = encoded.replace(/%([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
        const buf = new Uint8Array(hex.length);
        for (let i = 0; i < hex.length; i++) buf[i] = hex.charCodeAt(i);
        const dec = new TextDecoder(charset === 'gb2312' || charset === 'gbk' ? 'gb18030' : charset, { fatal: false });
        return dec.decode(buf);
      } catch {}
    }
  }
  return decodeMimeHeader(str);
}

export function parseFromHeader(fromRaw: string): { name: string; email: string } {
  const decoded = decodeMimeHeader(fromRaw || '');
  const m = decoded.match(/(.*?)\s*<([^>]+)>/);
  if (m) {
    let name = m[1].replace(/^["']|["']$/g, '').trim();
    const email = m[2].trim();
    if (!name) name = email;
    return { name, email };
  }
  return { name: decoded.trim(), email: decoded.trim() };
}

export function extractMessageId(headerText: string, fallbackId: string): string {
  const unfolded = headerText.replace(/\r?\n[ \t]+/g, ' ');
  const m = unfolded.match(/message-id:\s*<([^>]+)>/i) || unfolded.match(/message-id:\s*([^\r\n]+)/i);
  if (m) {
    const clean = m[1].replace(/[<>]/g, '').trim();
    if (clean) return clean;
  }
  return (fallbackId || '').replace(/[<>]/g, '').trim();
}

export function extractDateHeader(headerText: string): string {
  const unfolded = headerText.replace(/\r?\n[ \t]+/g, ' ');
  const m = unfolded.match(/^date:\s*([^\r\n]+)/im);
  return m ? m[1].trim() : '';
}

export function extractSubjectHeader(headerText: string): string {
  const unfolded = headerText.replace(/\r?\n[ \t]+/g, ' ');
  const m = unfolded.match(/^subject:\s*([^\r\n]+)/im);
  return m ? decodeMimeHeader(m[1].trim()) : '';
}

export function isCompleteImageBuffer(data: Uint8Array, contentType: string): boolean {
  if (!data || data.length < 1024) return false;
  const ct = contentType.toLowerCase();
  // JPEG: starts with FF D8
  if (ct.includes('jpeg') || ct.includes('jpg')) {
    if (data.length < 4) return false;
    const startsWithSoi = data[0] === 0xff && data[1] === 0xd8;
    if (!startsWithSoi) return false;
    return true;
  }
  // PNG: starts with 89 50 4E 47
  if (ct.includes('png')) {
    if (data.length < 8) return false;
    return data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47;
  }
  // GIF: starts with GIF87a or GIF89a
  if (ct.includes('gif')) {
    return data.length >= 6 && data[0] === 0x47 && data[1] === 0x49 && data[2] === 0x46;
  }
  // WebP: RIFF ... WEBP
  if (ct.includes('webp')) {
    return data.length >= 12 && data[0] === 0x52 && data[1] === 0x49 && data[2] === 0x46 && data[3] === 0x46;
  }
  return data.length >= 1024;
}

interface MimeAccumulator {
  text: string;
  html: string;
  attachments: boolean;
  imageAttachment?: ImageAttachment;
  imageAttachments: ImageAttachment[];
  documentAttachments: DocumentAttachment[];
}

function parseMimeRecursive(headerText: string, bodyRaw: string, acc: MimeAccumulator): void {
  const headers: Record<string, string> = {};
  for (const line of headerText.replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/)) {
    const colonIdx = line.indexOf(':');
    if (colonIdx !== -1) {
      const key = line.substring(0, colonIdx).trim().toLowerCase();
      const val = line.substring(colonIdx + 1).trim();
      if (!headers[key]) headers[key] = val;
    }
  }

  const cType = (headers['content-type'] || 'text/plain').toLowerCase();
  const cDisp = (headers['content-disposition'] || '').toLowerCase();
  const cEnc = (headers['content-transfer-encoding'] || '').toLowerCase().trim();

  // 若存在图片附件，提前捕获海报数据并进行文件完整性校验
  const isImageType = cType.startsWith('image/');
  const fnMatch = (headers['content-disposition'] || headers['content-type'] || '').match(/filename\*?=["']?([^"';\r\n]+)["']?/i)
    || (headers['content-type'] || '').match(/name\*?=["']?([^"';\r\n]+)["']?/i);
  const rawFn = fnMatch ? decodeHeaderValue(fnMatch[1].trim()) : '';
  const isImageExt = /\.(png|jpe?g|webp|gif)$/i.test(rawFn);

  if ((isImageType || isImageExt) && (cEnc === 'base64' || !cEnc || cEnc === 'binary' || cEnc === '8bit')) {
    try {
      let bytes: Buffer;
      if (cEnc === 'base64') {
        const cleanB64 = bodyRaw.replace(/\s/g, '');
        bytes = Buffer.from(cleanB64, 'base64');
      } else {
        bytes = Buffer.from(bodyRaw, 'binary');
      }
      const extM = rawFn.match(/\.(png|jpe?g|webp|gif)$/i);
      const safeExt = extM ? extM[1].toLowerCase() : (cType.includes('png') ? 'png' : 'jpg');
      const safeFn = rawFn || `image_${acc.imageAttachments.length + 1}.${safeExt}`;
      const safeCt = isImageType ? cType.split(';')[0].trim() : `image/${safeExt === 'png' ? 'png' : 'jpeg'}`;

      // 仅保留完整无截断的图片（>= 2KB 过滤 1x1 像素与无意义微标，且通过 EOF 校验，单图最大 15MB）
      if (bytes.length >= 2048 && bytes.length <= 15 * 1024 * 1024 && isCompleteImageBuffer(bytes, safeCt)) {
        const item: ImageAttachment = {
          filename: safeFn,
          contentType: safeCt,
          data: new Uint8Array(bytes)
        };
        acc.imageAttachments.push(item);
        if (!acc.imageAttachment) {
          acc.imageAttachment = item;
        }
        acc.attachments = true;
      }
    } catch {}
  }

  // 识别并提取文档附件（PDF、Word doc/docx，最大 15MB）
  const isDocType = cType.includes('application/pdf') ||
    cType.includes('application/msword') ||
    cType.includes('officedocument.wordprocessingml');
  const isDocExt = /\.(pdf|docx?)$/i.test(rawFn);

  if ((isDocType || isDocExt) && (cEnc === 'base64' || !cEnc || cEnc === 'binary' || cEnc === '8bit')) {
    try {
      let bytes: Buffer;
      if (cEnc === 'base64') {
        const cleanB64 = bodyRaw.replace(/\s/g, '');
        bytes = Buffer.from(cleanB64, 'base64');
      } else {
        bytes = Buffer.from(bodyRaw, 'binary');
      }
      const extM = rawFn.match(/\.(pdf|docx?)$/i);
      const ext = extM ? extM[1].toLowerCase() : (cType.includes('pdf') ? 'pdf' : (cType.includes('officedocument') ? 'docx' : 'doc'));
      const safeFn = rawFn || `document_${acc.documentAttachments.length + 1}.${ext}`;
      let safeCt = cType.split(';')[0].trim();
      if (!safeCt || safeCt === 'application/octet-stream') {
        if (ext === 'pdf') safeCt = 'application/pdf';
        else if (ext === 'docx') safeCt = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        else if (ext === 'doc') safeCt = 'application/msword';
      }

      if (bytes.length >= 100 && bytes.length <= 15 * 1024 * 1024) {
        acc.documentAttachments.push({
          filename: safeFn,
          contentType: safeCt,
          data: new Uint8Array(bytes)
        });
        acc.attachments = true;
      }
    } catch {}
  }

  if (cDisp.includes('attachment') || (headers['content-type'] && headers['content-type'].includes('name='))) {
    acc.attachments = true;
    if (!cType.includes('text/plain') && !cType.includes('text/html')) {
      return;
    }
  }

  const boundaryMatch = headers['content-type']?.match(/boundary=["']?([^"';\r\n]+)["']?/i);
  if (cType.includes('multipart/') && boundaryMatch) {
    const boundary = boundaryMatch[1];
    const parts = bodyRaw.split(`--${boundary}`);
    for (const part of parts) {
      if (!part || part.trim() === '--') continue;
      const splitIdx = part.indexOf('\r\n\r\n') !== -1 ? part.indexOf('\r\n\r\n') : part.indexOf('\n\n');
      if (splitIdx === -1) continue;
      const pHead = part.substring(0, splitIdx);
      const pBody = part.substring(splitIdx + (part[splitIdx] === '\r' ? 4 : 2));
      parseMimeRecursive(pHead, pBody, acc);
    }
    return;
  }

  // Leaf part decoding
  let decoded = bodyRaw;
  const csMatch = headers['content-type']?.match(/charset=["']?([^"';\r\n]+)["']?/i);
  const cs = csMatch ? csMatch[1].toLowerCase() : 'utf-8';

  try {
    if (cEnc === 'base64') {
      const cleanB64 = bodyRaw.replace(/\s/g, '');
      const bytes = Buffer.from(cleanB64, 'base64');
      const decoder = new TextDecoder(cs === 'gb2312' || cs === 'gbk' ? 'gb18030' : cs, { fatal: false });
      decoded = decoder.decode(bytes);
    } else if (cEnc === 'quoted-printable') {
      const clean = bodyRaw.replace(/=[\r\n]+/g, '').replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
      const bytes = new Uint8Array(clean.length);
      for (let i = 0; i < clean.length; i++) bytes[i] = clean.charCodeAt(i);
      const decoder = new TextDecoder(cs === 'gb2312' || cs === 'gbk' ? 'gb18030' : cs, { fatal: false });
      decoded = decoder.decode(bytes);
    }
  } catch {}

  if (cType.includes('text/html') && !acc.html) {
    acc.html = decoded;
  } else if (cType.includes('text/plain') && !acc.text) {
    acc.text = decoded;
  }
}

export function parseRawEmail(raw: string, fallbackId: string): ParsedEmail {
  const splitIdx = raw.indexOf('\r\n\r\n') !== -1 ? raw.indexOf('\r\n\r\n') : raw.indexOf('\n\n');
  let headerText = '';
  let bodyTextRaw = '';
  if (splitIdx !== -1) {
    headerText = raw.substring(0, splitIdx);
    bodyTextRaw = raw.substring(splitIdx + (raw[splitIdx] === '\r' ? 4 : 2));
  } else {
    headerText = raw;
  }

  // Unfold multiline headers
  const headerLines = headerText.replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/);
  const headers: Record<string, string> = {};
  for (const line of headerLines) {
    const colonIdx = line.indexOf(':');
    if (colonIdx !== -1) {
      const key = line.substring(0, colonIdx).trim().toLowerCase();
      const val = line.substring(colonIdx + 1).trim();
      if (!headers[key]) headers[key] = val;
    }
  }

  const subject = decodeMimeHeader(headers['subject'] || '无主题');
  const fromInfo = parseFromHeader(headers['from'] || '');
  const recipient = decodeMimeHeader(headers['to'] || '');
  const dateStr = decodeMimeHeader(headers['date'] || '');
  const messageId = headers['message-id'] ? headers['message-id'].replace(/[<>]/g, '').trim() : fallbackId;

  const acc: MimeAccumulator = { text: '', html: '', attachments: false, imageAttachments: [], documentAttachments: [] };
  parseMimeRecursive(headerText, bodyTextRaw, acc);

  // If text is missing but html is present, extract clean text from html
  let bodyText = acc.text;
  let bodyHtml = acc.html;
  if (!bodyText && bodyHtml) {
    bodyText = bodyHtml
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<br\s*[\/]?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n\s+\n/g, '\n\n')
      .trim();
  }

  // Generate clean snippet
  const rawSnippet = bodyText || bodyHtml.replace(/<[^>]+>/g, ' ');
  const snippet = rawSnippet.replace(/\s+/g, ' ').trim().slice(0, 180);

  return {
    msg_uid: messageId,
    subject: subject || '无主题',
    sender_name: fromInfo.name || fromInfo.email,
    sender_email: fromInfo.email,
    recipient,
    date_str: dateStr,
    snippet,
    body_text: bodyText,
    body_html: bodyHtml,
    has_attachments: acc.attachments,
    imageAttachment: acc.imageAttachment,
    imageAttachments: acc.imageAttachments,
    documentAttachments: acc.documentAttachments,
  };
}

export class CloudflareImapClient {
  private socket: any = null;
  private reader: any = null;
  private writer: any = null;
  private buffer: Uint8Array = new Uint8Array(0);
  private decoder = new TextDecoder('utf-8', { fatal: false });
  private tagIndex = 0;

  async connect(hostname: string, port: number = 993, timeoutMs: number = 10000): Promise<string> {
    this.socket = connect({ hostname, port }, { secureTransport: 'on' });
    this.reader = this.socket.readable.getReader();
    this.writer = this.socket.writable.getWriter();

    const greeting = await this.readLine(timeoutMs);
    return greeting;
  }

  private nextTag(): string {
    this.tagIndex++;
    return `A${this.tagIndex.toString().padStart(4, '0')}`;
  }

  private appendBuffer(chunk: Uint8Array) {
    const next = new Uint8Array(this.buffer.length + chunk.length);
    next.set(this.buffer);
    next.set(chunk, this.buffer.length);
    this.buffer = next;
  }

  private async readMore(timeoutMs: number = 10000): Promise<boolean> {
    const timeoutPromise = new Promise<null>((_, reject) =>
      setTimeout(() => reject(new Error('IMAP connection timed out')), timeoutMs)
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
        throw new Error('IMAP server closed connection prematurely');
      }
    }
  }

  async sendCommand(cmd: string, timeoutMs: number = 15000): Promise<{ ok: boolean; status: string; lines: string[] }> {
    const tag = this.nextTag();
    const fullCmd = `${tag} ${cmd}\r\n`;
    await this.writer.write(new TextEncoder().encode(fullCmd));

    const lines: string[] = [];
    while (true) {
      const line = await this.readLine(timeoutMs);
      lines.push(line);
      if (line.startsWith(`${tag} `)) {
        const parts = line.split(' ');
        const status = parts[1]; // OK, NO, BAD
        return {
          ok: status === 'OK',
          status,
          lines,
        };
      }
    }
  }

  async login(username: string, pass: string): Promise<void> {
    const safeUser = username.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const safePass = pass.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const res = await this.sendCommand(`LOGIN "${safeUser}" "${safePass}"`);
    if (!res.ok) {
      const errMsg = res.lines[res.lines.length - 1] || '用户名或密码错误';
      throw new Error(`IMAP 登录失败: ${errMsg}`);
    }
  }

  async selectInbox(): Promise<{ exists: number }> {
    const res = await this.sendCommand('SELECT "INBOX"');
    if (!res.ok) {
      throw new Error(`无法打开收件箱: ${res.lines[res.lines.length - 1]}`);
    }
    let exists = 0;
    for (const line of res.lines) {
      const m = line.match(/\*\s+(\d+)\s+EXISTS/i);
      if (m) {
        exists = parseInt(m[1], 10);
      }
    }
    return { exists };
  }

  async searchAll(): Promise<number[]> {
    const res = await this.sendCommand('SEARCH ALL');
    if (!res.ok) {
      return [];
    }
    const ids: number[] = [];
    for (const line of res.lines) {
      if (line.startsWith('* SEARCH')) {
        const parts = line.substring(8).trim().split(/\s+/);
        for (const p of parts) {
          const n = parseInt(p, 10);
          if (!isNaN(n)) ids.push(n);
        }
      }
    }
    return ids;
  }

  async searchSince(daysAgo: number = 8): Promise<number[]> {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const d = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
    const dateStr = `${d.getDate()}-${months[d.getMonth()]}-${d.getFullYear()}`;
    const res = await this.sendCommand(`SEARCH SINCE ${dateStr}`);
    if (!res.ok) {
      return [];
    }
    const ids: number[] = [];
    for (const line of res.lines) {
      if (line.startsWith('* SEARCH')) {
        const parts = line.substring(8).trim().split(/\s+/);
        for (const p of parts) {
          const n = parseInt(p, 10);
          if (!isNaN(n)) ids.push(n);
        }
      }
    }
    return ids;
  }

  private async readExactBytes(targetSize: number, timeoutMs: number = 15000): Promise<Uint8Array> {
    const result = new Uint8Array(targetSize);
    let copied = 0;

    if (this.buffer.length > 0) {
      const take = Math.min(this.buffer.length, targetSize);
      result.set(this.buffer.subarray(0, take), 0);
      copied += take;
      this.buffer = this.buffer.subarray(take);
    }

    while (copied < targetSize) {
      const timeoutPromise = new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error('IMAP connection timed out')), timeoutMs)
      );
      const readPromise = this.reader.read();
      const res: any = await Promise.race([readPromise, timeoutPromise]);
      if (!res || res.done) {
        break;
      }
      const chunk: Uint8Array = res.value;
      const needed = targetSize - copied;
      if (chunk.length <= needed) {
        result.set(chunk, copied);
        copied += chunk.length;
      } else {
        result.set(chunk.subarray(0, needed), copied);
        copied += needed;
        this.appendBuffer(chunk.subarray(needed));
      }
    }

    return result.subarray(0, copied);
  }

  async fetchMessageHeader(seq: number, timeoutMs: number = 10000): Promise<{ size: number; header: string }> {
    const tag = this.nextTag();
    const fullCmd = `${tag} FETCH ${seq} (RFC822.SIZE BODY.PEEK[HEADER])\r\n`;
    await this.writer.write(new TextEncoder().encode(fullCmd));

    let literalSize: number | null = null;
    let msgSize = 0;
    while (literalSize === null) {
      const line = await this.readLine(timeoutMs);
      const mSize = line.match(/RFC822\.SIZE\s+(\d+)/i);
      if (mSize) msgSize = parseInt(mSize[1], 10);
      const m = line.match(/\{(\d+)\}\s*$/);
      if (m) {
        literalSize = parseInt(m[1], 10);
      } else if (line.startsWith(`${tag} `)) {
        return { size: msgSize, header: '' };
      }
    }

    const literalBytes = await this.readExactBytes(literalSize, timeoutMs);

    while (true) {
      const trailing = await this.readLine(timeoutMs);
      if (trailing.startsWith(`${tag} `)) break;
    }

    const header = new TextDecoder('utf-8', { fatal: false }).decode(literalBytes);
    return { size: msgSize, header };
  }

  async fetchMessageRaw(seq: number, maxBytes: number = 200000, timeoutMs: number = 20000): Promise<string> {
    const tag = this.nextTag();
    const fullCmd = maxBytes > 0
      ? `${tag} FETCH ${seq} (BODY.PEEK[]<0.${maxBytes}>)\r\n`
      : `${tag} FETCH ${seq} (BODY.PEEK[])\r\n`;
    await this.writer.write(new TextEncoder().encode(fullCmd));

    let literalSize: number | null = null;
    while (literalSize === null) {
      const line = await this.readLine(timeoutMs);
      const m = line.match(/\{(\d+)\}\s*$/);
      if (m) {
        literalSize = parseInt(m[1], 10);
      } else if (line.startsWith(`${tag} `)) {
        return '';
      }
    }

    const literalBytes = await this.readExactBytes(literalSize, timeoutMs);

    while (true) {
      const trailing = await this.readLine(timeoutMs);
      if (trailing.startsWith(`${tag} `)) break;
    }

    return new TextDecoder('utf-8', { fatal: false }).decode(literalBytes);
  }

  async logout(): Promise<void> {
    try {
      await this.sendCommand('LOGOUT', 3000);
    } catch {}
    await this.close();
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
  }
}
