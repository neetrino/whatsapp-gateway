import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { PUBLIC_KEY } from '../decorators/public.decorator';
import type { RequestWithAdmin } from '../decorators/current-admin.decorator';
import { AuthService, type AdminJwtPayload } from '../../auth/auth.service';
import { AppException } from '../errors/app.exception';
import { ERROR_CODES } from '../errors/error-codes';

export const AUTH_COOKIE_NAME = 'gw_session';

export const readSessionJwtFromRequest = (request: Request): string | undefined => {
  const req = request as Request & { signedCookies?: Record<string, string> };
  return req.signedCookies?.[AUTH_COOKIE_NAME];
};

@Injectable()
export class JwtCookieGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
    private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<RequestWithAdmin>();
    const token = readSessionJwtFromRequest(request);
    if (!token) {
      throw new AppException({
        code: ERROR_CODES.UNAUTHORIZED,
        message: 'Authentication required.',
        status: 401,
      });
    }
    const payload = this.verifyPayload(token);
    request.admin = await this.authService.loadActiveAdmin(payload.sub, payload.sv);
    return true;
  }

  private verifyPayload(token: string): AdminJwtPayload {
    try {
      const payload = this.jwtService.verify<AdminJwtPayload>(token);
      if (typeof payload.sub !== 'string' || typeof payload.sv !== 'number') {
        throw new Error('invalid payload');
      }
      return payload;
    } catch {
      throw new AppException({
        code: ERROR_CODES.UNAUTHORIZED,
        message: 'Session expired or invalid.',
        status: 401,
      });
    }
  }
}
