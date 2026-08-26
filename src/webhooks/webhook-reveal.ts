import type { CookieOptions, Request, Response } from 'express';

export const WEBHOOK_REVEAL_COOKIE = 'gw_webhook_reveal';
const REVEAL_TTL_MS = 2 * 60 * 1000;

export interface WebhookRevealPayload {
  projectId: string;
  signingKey: string;
}

const revealCookieOptions = (production: boolean): CookieOptions => ({
  httpOnly: true,
  secure: production,
  sameSite: 'lax',
  signed: true,
  path: '/',
  maxAge: REVEAL_TTL_MS,
});

const packPayload = (payload: WebhookRevealPayload): string =>
  JSON.stringify({ projectId: payload.projectId, signingKey: payload.signingKey });

const parsePayload = (packed: string): WebhookRevealPayload | undefined => {
  try {
    const parsed: unknown = JSON.parse(packed);
    if (typeof parsed !== 'object' || parsed === null) return undefined;
    const record = parsed as Record<string, unknown>;
    if (typeof record.projectId !== 'string' || record.projectId.length === 0) return undefined;
    if (typeof record.signingKey !== 'string' || record.signingKey.length === 0) return undefined;
    return { projectId: record.projectId, signingKey: record.signingKey };
  } catch {
    return undefined;
  }
};

const signedCookiesOf = (req: Request): Record<string, string> => {
  const signed = (req as Request & { signedCookies?: Record<string, string> }).signedCookies;
  return signed ?? {};
};

export const setWebhookRevealCookie = (
  res: Response,
  payload: WebhookRevealPayload,
  production: boolean,
): void => {
  res.cookie(WEBHOOK_REVEAL_COOKIE, packPayload(payload), revealCookieOptions(production));
};

export const consumeWebhookRevealCookie = (
  req: Request,
  res: Response,
  production: boolean,
  projectId: string,
): string | undefined => {
  const packed = signedCookiesOf(req)[WEBHOOK_REVEAL_COOKIE];
  if (typeof packed !== 'string' || packed.length === 0) return undefined;
  const payload = parsePayload(packed);
  if (!payload) {
    res.clearCookie(WEBHOOK_REVEAL_COOKIE, { path: '/', secure: production, signed: true });
    return undefined;
  }
  if (payload.projectId !== projectId) return undefined;
  res.clearCookie(WEBHOOK_REVEAL_COOKIE, { path: '/', secure: production, signed: true });
  return payload.signingKey;
};
