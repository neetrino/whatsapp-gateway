import { Injectable, NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { EnvironmentVariables } from '../../config/env.validation';
import { cookieSecureFromNodeEnv } from '../utils/cookie-secure';
import { CSRF_COOKIE_NAME } from '../guards/csrf.guard';

@Injectable()
export class CsrfMiddleware implements NestMiddleware {
  constructor(private readonly configService: ConfigService<EnvironmentVariables, true>) {}

  use(req: Request, res: Response, next: NextFunction): void {
    if (req.path.startsWith('/api')) {
      next();
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      next();
      return;
    }
    const cookies = (req as Request & { cookies?: Record<string, string> }).cookies;
    const existing = cookies?.[CSRF_COOKIE_NAME];
    if (!existing) {
      const nodeEnv = this.configService.get('NODE_ENV', { infer: true });
      const secure = cookieSecureFromNodeEnv(nodeEnv);
      const token = randomBytes(24).toString('base64url');
      res.cookie(CSRF_COOKIE_NAME, token, {
        httpOnly: false,
        secure,
        sameSite: 'lax',
        path: '/',
      });
      if (cookies) {
        cookies[CSRF_COOKIE_NAME] = token;
      } else {
        (req as Request & { cookies?: Record<string, string> }).cookies = {
          [CSRF_COOKIE_NAME]: token,
        };
      }
    }
    next();
  }
}
