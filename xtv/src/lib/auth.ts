/**
 * 会话鉴权：httpOnly cookie + HMAC 签名（Edge 运行时兼容版，使用 Web Crypto API）。
 *
 * 相比旧版的改进：
 * - 页面源码不再下发 sha256(password)，前端拿不到任何可重放的凭证；
 * - 兼容模式「哈希即凭证」被彻底移除；
 * - 登录接口只接受 POST body，不再把明文密码放 query。
 *
 * Cloudflare Edge 适配：
 * - node:crypto → crypto.subtle（Web Crypto API）
 * - crypto.timingSafeEqual → 手写恒定时间字节比较
 * - 因 Web Crypto 为异步，相关函数（signSession/verifySession/checkPassword 等）均改为 async
 */

export const SESSION_COOKIE = 'ltv_session';
const SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 天

const encoder = new TextEncoder();

/** 将 ArrayBuffer 转为十六进制字符串 */
function bufToHex(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

/** 恒定时间比较两个字符串（转成 Uint8Array 逐字节比较，避免短路优化） */
function timingSafeEqualStr(a: string, b: string): boolean {
  const ab = encoder.encode(a);
  const bb = encoder.encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

/** 计算 SHA-256 十六进制摘要 */
async function sha256Hex(data: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(data));
  return bufToHex(digest);
}

/** 计算 HMAC-SHA256 十六进制摘要 */
async function hmacSha256Hex(key: string, data: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(data));
  return bufToHex(sig);
}

export function getPassword(): string {
  return process.env.PASSWORD || '';
}

export function isPasswordConfigured(): boolean {
  return getPassword().length > 0;
}

/** 派生签名密钥：优先用 PROXY_SECRET，否则由密码 + 盐派生 */
async function getSecret(): Promise<string> {
  if (process.env.PROXY_SECRET) return process.env.PROXY_SECRET;
  return sha256Hex(getPassword() + ':libretv::session-salt');
}

async function hmac(payload: string): Promise<string> {
  return hmacSha256Hex(await getSecret(), payload);
}

/** 生成签名会话 token：`<expiresAtMs>.<hmac>` */
export async function signSession(): Promise<{ token: string; expiresAt: number }> {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const payload = String(expiresAt);
  return { token: `${payload}.${await hmac(payload)}`, expiresAt };
}

/** 校验会话 token 的签名与有效期 */
export async function verifySession(token: string | undefined | null): Promise<boolean> {
  if (!token) return false;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return false;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = await hmac(payload);
  if (!timingSafeEqualStr(sig, expected)) return false;
  const expiresAt = parseInt(payload, 10);
  if (!Number.isFinite(expiresAt)) return false;
  return Date.now() < expiresAt;
}

/** 恒定时间比较密码（比较 sha256 摘要避免长度泄漏） */
export async function checkPassword(input: string): Promise<boolean> {
  const password = getPassword();
  if (!password) return false;
  const a = await sha256Hex(input);
  const b = await sha256Hex(password);
  return timingSafeEqualStr(a, b);
}

/** 从请求 Cookie 中解析会话 */
export async function sessionFromCookieHeader(cookieHeader: string | null): Promise<boolean> {
  if (!cookieHeader) return false;
  const cookies = cookieHeader.split(';');
  for (const c of cookies) {
    const eq = c.indexOf('=');
    if (eq === -1) continue;
    const name = c.slice(0, eq).trim();
    if (name === SESSION_COOKIE) {
      return verifySession(decodeURIComponent(c.slice(eq + 1).trim()));
    }
  }
  return false;
}

// —— 登录速率限制（内存实现，单实例部署足够；多实例可换 Redis） ——

const attemptMap = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 10 * 60 * 1000;

export function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = attemptMap.get(ip);
  if (!entry || now > entry.resetAt) {
    attemptMap.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (entry.count >= MAX_ATTEMPTS) return false;
  entry.count += 1;
  return true;
}

export function clearRateLimit(ip: string): void {
  attemptMap.delete(ip);
}

// 定期清理过期限流记录，避免长期运行下 Map 膨胀
if (typeof setInterval === 'function') {
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of attemptMap) {
      if (now > entry.resetAt) attemptMap.delete(ip);
    }
  }, 60 * 1000);
  // Edge 运行时不支持 unref，忽略
  if (typeof (timer as { unref?: () => void }).unref === 'function') {
    (timer as { unref: () => void }).unref();
  }
}
