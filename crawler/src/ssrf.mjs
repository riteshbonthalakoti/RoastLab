import dns from 'node:dns/promises';
import net from 'node:net';

function ipv4ToInt(ip) {
  return ip.split('.').reduce((acc, p) => (acc << 8) + Number(p), 0) >>> 0;
}

const V4_BLOCKED = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
  ['224.0.0.0', 4], ['240.0.0.0', 4],
].map(([base, bits]) => ({ base: ipv4ToInt(base), mask: bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0 }));

export function isPrivateIp(ip) {
  const family = net.isIP(ip);
  if (family === 4) {
    const n = ipv4ToInt(ip);
    return V4_BLOCKED.some(({ base, mask }) => (n & mask) >>> 0 === (base & mask) >>> 0);
  }
  if (family === 6) {
    const lower = ip.toLowerCase();
    if (lower === '::' || lower === '::1') return true;
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIp(mapped[1]);
    return /^(fc|fd|fe[89ab])/.test(lower) || lower.startsWith('ff');
  }
  return true;
}

const hostCache = new Map();

/** Resolves a hostname and rejects if ANY address is non-public. Cached per hostname. */
export async function assertPublicHost(hostname) {
  const cached = hostCache.get(hostname);
  if (cached) {
    if (cached.ok) return;
    throw new Error(cached.reason);
  }
  let reason = null;
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.internal') || hostname.endsWith('.local')) {
    reason = `blocked host: ${hostname}`;
  } else if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) reason = `blocked address: ${hostname}`;
  } else {
    try {
      const addrs = await dns.lookup(hostname, { all: true });
      if (addrs.length === 0 || addrs.some((a) => isPrivateIp(a.address))) reason = `blocked: ${hostname} resolves to a non-public address`;
    } catch {
      reason = `cannot resolve ${hostname}`;
    }
  }
  hostCache.set(hostname, reason ? { ok: false, reason } : { ok: true });
  if (hostCache.size > 5000) hostCache.clear();
  if (reason) throw new Error(reason);
}

export async function assertPublicUrl(raw) {
  let u;
  try {
    u = new URL(raw);
  } catch {
    throw new Error('invalid url');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('only http(s) urls are allowed');
  if (u.username || u.password) throw new Error('credentials in url are not allowed');
  await assertPublicHost(u.hostname.replace(/^\[|\]$/g, ''));
  return u;
}
