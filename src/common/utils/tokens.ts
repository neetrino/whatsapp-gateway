import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export interface GeneratedApiToken {
  raw: string;
  tokenPrefix: string;
  last4: string;
}

export const generateApiToken = (prefix: string): GeneratedApiToken => {
  const random = randomBytes(24).toString('base64url');
  const raw = `${prefix}_${random}`;
  return {
    raw,
    tokenPrefix: prefix,
    last4: random.slice(-4),
  };
};

export const hashApiToken = (raw: string, pepper: string): string =>
  createHmac('sha256', pepper).update(raw).digest('hex');

export const safeEqualHex = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
};
