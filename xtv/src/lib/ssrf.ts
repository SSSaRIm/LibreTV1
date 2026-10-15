/**
 * SSRF 防护（Edge 运行时兼容版）。
 *
 * Cloudflare Edge 适配：
 * - node:dns/lookup → 通过 Cloudflare DoH（1.1.1.1）解析主机名
 * - 注：Cloudflare Workers 本身已内置禁止向私有/保留地址发起请求的能力，
 *   此处的 URL 字面量校验 + DoH 解析校验为纵深防御。
 */

/** 去掉 URL.hostname 对 IPv6 附加的方括号（"[::1]" → "::1"） */
function stripBrackets(host: string): string {
  return host.trim().replace(/^\[+|\]+$/g, '');
}

/**
 * IPv4-mapped / IPv4-compatible IPv6 还原为点分十进制，命中不到时返回 null。
 * "::ffff:192.168.1.100" 与 "::ffff:c0a8:164" 都会归一化成 "192.168.1.100"，
 * 否则这类地址会绕过下面的私网规则被当成公网放行。
 */
function toIPv4(ip: string): string | null {
  const v = ip.replace(/^0:0:0:0:0:/i, '::'); // 全写形式
  const dotted = /^::(?:ffff:)?(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(v);
  if (dotted) return dotted[1];
  const hex = /^::(?:ffff:)?([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(v);
  if (!hex) return null;
  const n = (((parseInt(hex[1], 16) << 16) | parseInt(hex[2], 16)) >>> 0);
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
}

/** 判断 IP 是否为私有/回环/链路本地/保留地址（SSRF 防护） */
export function isPrivateIP(ip: string): boolean {
  let v = stripBrackets(ip.trim());
  v = toIPv4(v) ?? v;
  if (/^(127\.|0\.0\.0\.0$|::1$|::$|fe80:|fc|fd)/i.test(v)) return true;
  if (v.startsWith('10.')) return true;
  if (v.startsWith('192.168.')) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(v)) return true;
  if (v.startsWith('169.254.')) return true; // 链路本地（含云元数据 169.254.169.254）
  if (v.startsWith('100.64.')) return true; // CGNAT
  if (v.startsWith('192.0.0.')) return true; // 协议分配块
  return false;
}

const BLOCKED_HOSTNAMES = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);

/** URL 字面量校验：协议白名单 + 主机名/字面量 IP 黑名单 */
export function isValidProxyUrl(urlString: string): boolean {
  try {
    const parsed = new URL(urlString);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    const host = stripBrackets(parsed.hostname); // "[::1]" 也要能被黑名单命中
    if (BLOCKED_HOSTNAMES.has(host)) return false;
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':')) {
      if (isPrivateIP(host)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

/** DoH 响应中的 A/AAAA 记录 */
interface DoHAnswer {
  type: number; // 1 = A, 28 = AAAA
  data: string;
}

/**
 * 通过 Cloudflare DoH（1.1.1.1）解析主机名的 A/AAAA 记录。
 * 解析失败或超时返回空数组，交由后续请求处理。
 */
async function resolveHostname(hostname: string): Promise<string[]> {
  try {
    const url = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(hostname)}&type=A`;
    const res = await fetch(url, {
      headers: { Accept: 'application/dns-json' },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { Answer?: DoHAnswer[] };
    return (data.Answer ?? []).filter((a) => a.type === 1 || a.type === 28).map((a) => a.data);
  } catch {
    return [];
  }
}

/** DNS 解析后校验目标主机名是否解析到内网/保留地址 */
export async function isBlockedByDNS(urlString: string): Promise<boolean> {
  try {
    const hostname = stripBrackets(new URL(urlString).hostname);
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) || hostname.includes(':')) {
      return isPrivateIP(hostname);
    }
    const ips = await resolveHostname(hostname);
    return ips.some((ip) => isPrivateIP(ip));
  } catch {
    return false; // 解析失败不阻断，交给后续请求处理
  }
}

export type UpstreamVerdict = { ok: true } | { ok: false; reason: string };

/**
 * 出网请求的统一校验入口：字面量校验 + DNS 解析校验。
 *
 * 任何由用户输入驱动的服务端请求（采集站搜索/详情、代理转发）都必须先过这一关，
 * 否则服务器会变成内网探测跳板（/api/search 曾直接用用户传的 source.url 发请求）。
 */
export async function checkUpstreamAllowed(urlString: string): Promise<UpstreamVerdict> {
  if (!isValidProxyUrl(urlString)) {
    return { ok: false, reason: '目标地址不在允许范围内（仅支持公网 http/https）' };
  }
  if (await isBlockedByDNS(urlString)) {
    return { ok: false, reason: '目标地址解析到私有/保留网络' };
  }
  return { ok: true };
}

/** 直播场景是否放行内网地址（自建 IPTV）；由部署者显式开启 */
export function allowLivePrivate(): boolean {
  return process.env.LIVE_ALLOW_PRIVATE === '1';
}

/**
 * 直播地址专用校验：协议必须 http(s)，默认仍拒绝内网，但部署者可用
 * LIVE_ALLOW_PRIVATE=1 显式放行（自建 IPTV 常位于内网）。
 *
 * 与点播侧 checkUpstreamAllowed 的区别只在这一处开关：
 * 订阅/播放列表若沿用点播那把尺子，会静默过滤掉内网自建源。
 */
export async function checkLiveUrlAllowed(urlString: string): Promise<UpstreamVerdict> {
  try {
    const parsed = new URL(urlString);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { ok: false, reason: '直播地址仅支持 http/https 协议' };
    }
  } catch {
    return { ok: false, reason: '无效的直播地址' };
  }
  if (allowLivePrivate()) return { ok: true };
  return checkUpstreamAllowed(urlString);
}
