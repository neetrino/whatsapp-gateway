import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { AppException } from '../errors/app.exception';
import { ERROR_CODES } from '../errors/error-codes';

export const CSRF_COOKIE_NAME = 'gw_csrf';
export const CSRF_HEADER_NAME = 'x-csrf-token';
export const CSRF_FORM_FIELD = '_csrf';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (request.path.startsWith('/api')) return true;
    if (SAFE_METHODS.has(request.method)) return true;

    const cookies = (request as Request & { cookies?: Record<string, string> }).cookies;
    const cookieToken = cookies?.[CSRF_COOKIE_NAME];
    const headerToken = request.header(CSRF_HEADER_NAME);
    const body = (request.body ?? {}) as Record<string, unknown>;
    const raw = body[CSRF_FORM_FIELD];
    const formToken =
      typeof raw === 'string'
        ? raw
        : Array.isArray(raw) && typeof raw[0] === 'string'
          ? raw[0]
          : undefined;
    const submitted =
      (typeof headerToken === 'string' ? headerToken.trim() : undefined) || formToken?.trim();

    if (!cookieToken || !submitted || cookieToken !== submitted) {
      throw new AppException({
        code: ERROR_CODES.CSRF_INVALID,
        message: 'Invalid CSRF token. Please reload and try again.',
        status: 403,
      });
    }
    return true;
  }
}
