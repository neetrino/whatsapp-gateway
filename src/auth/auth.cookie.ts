import type { CookieOptions, Response } from 'express';
import { AUTH_COOKIE_NAME } from '../common/guards/jwt-cookie.guard';
import { CSRF_COOKIE_NAME } from '../common/guards/csrf.guard';
import { randomBytes } from 'node:crypto';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const sessionCookieOptions = (production: boolean): CookieOptions => ({
  httpOnly: true,
  secure: production,
  sameSite: 'lax',
  signed: true,
  path: '/',
  maxAge: ONE_DAY_MS,
});

const csrfCookieOptions = (production: boolean): CookieOptions => ({
  httpOnly: false,
  secure: production,
  sameSite: 'lax',
  path: '/',
  maxAge: ONE_DAY_MS,
});

export const issueAuthCookies = (
  res: Response,
  jwtToken: string,
  production: boolean,
): { csrfToken: string } => {
  const csrfToken = randomBytes(24).toString('base64url');
  res.cookie(AUTH_COOKIE_NAME, jwtToken, sessionCookieOptions(production));
  res.cookie(CSRF_COOKIE_NAME, csrfToken, csrfCookieOptions(production));
  return { csrfToken };
};

export const clearAuthCookies = (res: Response, secure: boolean): void => {
  res.clearCookie(AUTH_COOKIE_NAME, { path: '/', secure, signed: true });
  res.clearCookie(CSRF_COOKIE_NAME, { path: '/', secure });
};
