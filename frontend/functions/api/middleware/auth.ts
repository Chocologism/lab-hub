import { Context, Next } from 'hono';
import { Env, UserRow, JWTPayload } from '../types';

const DEFAULT_SECRET = 'labhub-secure-secret-key-2026';

function base64UrlEncode(str: string | Uint8Array): string {
  let binary = '';
  if (typeof str === 'string') {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(str);
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
  } else {
    for (let i = 0; i < str.length; i++) {
      binary += String.fromCharCode(str[i]);
    }
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

async function getHmacKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  return crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

export async function createToken(user: UserRow, secret: string = DEFAULT_SECRET): Promise<string> {
  const key = await getHmacKey(secret);
  const header = { alg: 'HS256', typ: 'JWT' };
  const exp = Math.floor(Date.now() / 1000) + 30 * 24 * 3600; // 30 days
  const payload: JWTPayload = {
    sub: String(user.id),
    email: user.email,
    role: user.role,
    name: user.name,
    token_version: user.token_version,
    exp,
  };

  const headerEncoded = base64UrlEncode(JSON.stringify(header));
  const payloadEncoded = base64UrlEncode(JSON.stringify(payload));
  const dataToSign = new TextEncoder().encode(`${headerEncoded}.${payloadEncoded}`);
  const signature = await crypto.subtle.sign('HMAC', key, dataToSign);
  const signatureEncoded = base64UrlEncode(new Uint8Array(signature));

  return `${headerEncoded}.${payloadEncoded}.${signatureEncoded}`;
}

export async function verifyToken(token: string, secret: string = DEFAULT_SECRET): Promise<JWTPayload | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, sigB64] = parts;
    const key = await getHmacKey(secret);
    const dataToVerify = new TextEncoder().encode(`${headerB64}.${payloadB64}`);

    // Decode signature
    let sigBase64 = sigB64.replace(/-/g, '+').replace(/_/g, '/');
    while (sigBase64.length % 4) sigBase64 += '=';
    const sigBin = atob(sigBase64);
    const sigBytes = new Uint8Array(sigBin.length);
    for (let i = 0; i < sigBin.length; i++) sigBytes[i] = sigBin.charCodeAt(i);

    const valid = await crypto.subtle.verify('HMAC', key, sigBytes, dataToVerify);
    if (!valid) return null;

    const payload: JWTPayload = JSON.parse(base64UrlDecode(payloadB64));
    if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) {
      return null; // Expired
    }
    return payload;
  } catch (err) {
    return null;
  }
}

export async function authMiddleware(c: Context<{ Bindings: Env; Variables: { user: UserRow } }>, next: Next) {
  const authHeader = c.req.header('Authorization');
  let token = '';
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  } else {
    token = c.req.query('token') || '';
  }

  if (!token) {
    return c.json({ detail: '未提供身份认证 Token，请先登录' }, 401);
  }

  const secret = c.env.JWT_SECRET || DEFAULT_SECRET;
  const payload = await verifyToken(token, secret);
  if (!payload || !payload.sub) {
    return c.json({ detail: '身份认证失败或凭据已过期' }, 401);
  }

  const userId = parseInt(payload.sub, 10);
  const user = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first<UserRow>();
  if (!user) {
    return c.json({ detail: '未找到对应用户' }, 401);
  }

  if (payload.token_version !== undefined && user.token_version !== payload.token_version) {
    return c.json({ detail: '登录已失效，请重新登录' }, 401);
  }

  c.set('user', user);
  await next();
}

export async function adminOnlyMiddleware(c: Context<{ Bindings: Env; Variables: { user: UserRow } }>, next: Next) {
  const user = c.get('user');
  if (!user || user.role !== 'admin') {
    return c.json({ detail: '该功能仅管理员可用' }, 403);
  }
  await next();
}

export async function seminarManagerMiddleware(c: Context<{ Bindings: Env; Variables: { user: UserRow } }>, next: Next) {
  const user = c.get('user');
  if (!user || (user.role !== 'admin' && user.role !== 'teacher' && !user.can_manage_seminars)) {
    return c.json({ detail: '你没有新增或修改组会的权限，请联系管理员授权' }, 403);
  }
  await next();
}
