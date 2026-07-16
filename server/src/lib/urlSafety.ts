import { isIP } from 'net';
import { lookup } from 'dns/promises';
import { BadRequestError } from './errors';

function isPrivateOrReservedIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return true; // malformed -> treat as unsafe
  const [a, b] = parts;
  if (a === 127) return true; // loopback
  if (a === 10) return true; // private
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 169 && b === 254) return true; // link-local, covers the 169.254.169.254 cloud metadata endpoint
  if (a === 0) return true; // "this" network
  if (a >= 224) return true; // multicast/reserved
  return false;
}

// e.g. "7f00:1" (two 16-bit hex groups) -> "127.0.0.1". Node's URL parser normalizes a bracketed
// IPv4-mapped IPv6 literal into this hex-group form rather than keeping the dotted-decimal
// suffix a caller likely typed — confirmed empirically: new URL('http://[::ffff:127.0.0.1]/x')
// .hostname is "[::ffff:7f00:1]", not "[::ffff:127.0.0.1]".
function hexGroupsToIPv4(groups: string): string | null {
  const parts = groups.split(':');
  if (parts.length !== 2) return null;
  const g1 = parseInt(parts[0] || '0', 16);
  const g2 = parseInt(parts[1] || '0', 16);
  if (![g1, g2].every((g) => Number.isInteger(g) && g >= 0 && g <= 0xffff)) return null;
  return `${(g1 >> 8) & 0xff}.${g1 & 0xff}.${(g2 >> 8) & 0xff}.${g2 & 0xff}`;
}

function isPrivateOrReservedIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized === '::1' || normalized === '::') return true;
  if (/^fe[89ab][0-9a-f]:/.test(normalized)) return true; // link-local fe80::/10
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true; // unique local fc00::/7
  if (normalized.startsWith('::ffff:')) {
    // IPv4-mapped IPv6 (::ffff:0:0/96) — the embedded IPv4 address can appear as either
    // dotted-decimal or two hex groups (see hexGroupsToIPv4 above); both must resolve to the
    // same check, or a bracketed URL literal (always normalized to hex-group form) would slip
    // straight past this and only the rarer directly-typed dotted-decimal form would be caught.
    const suffix = normalized.slice('::ffff:'.length);
    const dotted = suffix.includes('.') ? suffix : hexGroupsToIPv4(suffix);
    if (dotted) return isPrivateOrReservedIPv4(dotted);
  }
  return false;
}

function isUnsafeIp(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return isPrivateOrReservedIPv4(ip);
  if (version === 6) return isPrivateOrReservedIPv6(ip);
  return true; // not a recognizable IP literal at all -> treat as unsafe
}

// Rejects a target that resolves to loopback/private/link-local addresses (including the
// 169.254.169.254 cloud metadata endpoint) — without this, a webhook URL is a trivial SSRF
// primitive letting anyone with webhook-management access make the trusted server process issue
// requests to internal-only services. Call this both at registration time (fast feedback) and
// again immediately before every delivery (see webhook-dispatcher.ts) — a hostname's DNS record
// can change between the two (DNS rebinding), so registration-time-only validation isn't a real
// guarantee on its own.
export async function assertPublicHttpUrl(rawUrl: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new BadRequestError('Invalid URL');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new BadRequestError('URL must use http or https');
  }
  // WHATWG URL wraps an IPv6 host in brackets in .hostname (e.g. "[::1]" for http://[::1]/) —
  // net.isIP() and the IPv6-range checks below both expect the bare address, so without
  // stripping them first, every bracketed IPv6 literal (including ::1 itself) missed the fast
  // direct-IP-literal path entirely and fell through to a DNS lookup on the literal string
  // "[::1]", which doesn't resolve as an IP check at all.
  const rawHostname = parsed.hostname.toLowerCase();
  const hostname = rawHostname.startsWith('[') && rawHostname.endsWith(']') ? rawHostname.slice(1, -1) : rawHostname;
  if (hostname === 'localhost') {
    throw new BadRequestError('URL may not target a local or internal address');
  }

  const directIpVersion = isIP(hostname);
  if (directIpVersion) {
    if (isUnsafeIp(hostname)) throw new BadRequestError('URL may not target a local or internal address');
    return;
  }

  let addresses: { address: string }[];
  try {
    addresses = await lookup(hostname, { all: true });
  } catch {
    throw new BadRequestError('URL hostname could not be resolved');
  }
  if (addresses.length === 0 || addresses.some((a) => isUnsafeIp(a.address))) {
    throw new BadRequestError('URL may not target a local or internal address');
  }
}
