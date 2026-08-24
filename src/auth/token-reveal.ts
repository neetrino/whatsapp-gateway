import type { CookieOptions, Request, Response } from 'express';

export const TOKEN_REVEAL_COOKIE = 'gw_token_reveal';
const REVEAL_TTL_MS = 2 * 60 * 1000;

export interface TokenRevealPayload {
  projectId: string;
  raw: string;
}

const revealCookieOptions = (production: boolean): CookieOptions => ({
  httpOnly: true,
  secure: production,
  sameSite: 'lax',
  signed: true,
  path: '/',
  maxAge: REVEAL_TTL_MS,
});

const packPayload = (payload: TokenRevealPayload): string =>
  JSON.stringify({ projectId: payload.projectId, raw: payload.raw });

const parsePayload = (packed: string): TokenRevealPayload | undefined => {
  try {
    const parsed: unknown = JSON.parse(packed);
    if (typeof parsed !== 'object' || parsed === null) return undefined;
    const record = parsed as Record<string, unknown>;
    if (typeof record.projectId !== 'string' || record.projectId.length === 0) return undefined;
    if (typeof record.raw !== 'string' || record.raw.length === 0) return undefined;
    return { projectId: record.projectId, raw: record.raw };
  } catch {
    return undefined;
  }
};

const signedCookiesOf = (req: Request): Record<string, string> => {
  const signed = (req as Request & { signedCookies?: Record<string, string> }).signedCookies;
  return signed ?? {};
};

export const setTokenRevealCookie = (
  res: Response,
  payload: TokenRevealPayload,
  production: boolean,
): void => {
  res.cookie(TOKEN_REVEAL_COOKIE, packPayload(payload), revealCookieOptions(production));
};

export const consumeTokenRevealCookie = (
  req: Request,
  res: Response,
  production: boolean,
  projectId: string,
): string | undefined => {
  const packed = signedCookiesOf(req)[TOKEN_REVEAL_COOKIE];
  if (typeof packed !== 'string' || packed.length === 0) return undefined;
  const payload = parsePayload(packed);
  if (!payload) {
    res.clearCookie(TOKEN_REVEAL_COOKIE, { path: '/', secure: production, signed: true });
    return undefined;
  }
  if (payload.projectId !== projectId) return undefined;
  res.clearCookie(TOKEN_REVEAL_COOKIE, { path: '/', secure: production, signed: true });
  return payload.raw;
};
