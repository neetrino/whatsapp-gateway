import dns from 'node:dns/promises';
import { isIPv4, isIPv6 } from 'node:net';

export interface ValidatedPublicUrl {
  href: string;
  hostname: string;
}

export class InvalidPublicUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidPublicUrlError';
  }
}

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  'host.docker.internal',
]);

const isPrivateIpv4 = (ip: string): boolean => {
  const parts = ip.split('.').map((p) => Number.parseInt(p, 10));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
    return true;
  }
  const [a, b] = parts;
  if (a === undefined || b === undefined) return true;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
};

const isPrivateIpv6 = (ip: string): boolean => {
  const lower = ip.toLowerCase();
  if (lower === '::1') return true;
  if (lower.startsWith('fe80:')) return true;
  const first = lower.split(':')[0] ?? '';
  if (first === 'fc' || first === 'fd' || first.startsWith('fc') || first.startsWith('fd')) {
    return true;
  }
  if (lower.startsWith('::ffff:')) {
    const v4 = lower.slice(7);
    if (isIPv4(v4)) return isPrivateIpv4(v4);
  }
  return false;
};

const assertHostNotForbidden = (hostname: string): void => {
  const h = hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(h)) {
    throw new InvalidPublicUrlError('URL host is not allowed.');
  }
  if (h.endsWith('.local')) {
    throw new InvalidPublicUrlError('URL host is not allowed.');
  }
};

const checkLiteralHost = (hostname: string): void => {
  if (isIPv4(hostname)) {
    if (isPrivateIpv4(hostname)) {
      throw new InvalidPublicUrlError('URL resolves to a private network address.');
    }
    return;
  }
  if (isIPv6(hostname)) {
    const normalized =
      hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;
    if (isPrivateIpv6(normalized)) {
      throw new InvalidPublicUrlError('URL resolves to a private network address.');
    }
  }
};

const assertResolvedAddressesPublic = async (hostname: string): Promise<void> => {
  const addresses: string[] = [];
  try {
    addresses.push(...(await dns.resolve4(hostname)));
  } catch {
    /* no A */
  }
  try {
    addresses.push(...(await dns.resolve6(hostname)));
  } catch {
    /* no AAAA */
  }
  if (addresses.length === 0) {
    const lookedUp = await dns.lookup(hostname, { all: true });
    for (const entry of lookedUp) {
      addresses.push(entry.address);
    }
  }
  if (addresses.length === 0) {
    throw new InvalidPublicUrlError('Could not resolve URL host.');
  }
  for (const addr of addresses) {
    if (isIPv4(addr)) {
      if (isPrivateIpv4(addr)) {
        throw new InvalidPublicUrlError('URL host resolves to a private network address.');
      }
    } else if (isPrivateIpv6(addr)) {
      throw new InvalidPublicUrlError('URL host resolves to a private network address.');
    }
  }
};

/**
 * Validates that `url` is a safe public HTTPS URL for passing to WAHA (SSRF protection).
 * Performs DNS resolution for non-literal hostnames and rejects private/link-local targets.
 */
export const validatePublicHttpsUrl = async (raw: string): Promise<ValidatedPublicUrl> => {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    throw new InvalidPublicUrlError('Invalid media URL.');
  }
  if (parsed.protocol !== 'https:') {
    throw new InvalidPublicUrlError('mediaUrl must use HTTPS.');
  }
  if (parsed.username || parsed.password) {
    throw new InvalidPublicUrlError('URL must not contain credentials.');
  }
  const hostname = parsed.hostname;
  if (!hostname) {
    throw new InvalidPublicUrlError('Invalid media URL.');
  }
  assertHostNotForbidden(hostname);
  checkLiteralHost(hostname);
  if (!isIPv4(hostname) && !isIPv6(hostname)) {
    await assertResolvedAddressesPublic(hostname);
  }
  return { href: parsed.href, hostname };
};
