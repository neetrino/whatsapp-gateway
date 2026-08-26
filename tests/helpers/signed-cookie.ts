import { createHmac } from 'node:crypto';

export const signedCookiePair = (name: string, value: string, secret: string): string => {
  const digest = createHmac('sha256', secret)
    .update(value)
    .digest('base64')
    .replace(/=+$/g, '');
  return `${name}=${encodeURIComponent(`s:${value}.${digest}`)}`;
};

export const cookiePairsFromResponse = (
  headers: { 'set-cookie'?: string | string[] },
  names: string[],
): string => {
  const header = headers['set-cookie'];
  const list = Array.isArray(header) ? header : header ? [header] : [];
  return list
    .map((entry) => entry.split(';')[0] ?? '')
    .filter((pair) => names.some((name) => pair.startsWith(`${name}=`)))
    .join('; ');
};
