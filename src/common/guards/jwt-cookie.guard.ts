import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { PUBLIC_KEY } from '../decorators/public.decorator';
import type { RequestWithUser } from '../decorators/current-user.decorator';
import { Role } from '@prisma/client';

export const AUTH_COOKIE_NAME = 'gw_session';

export const readSessionJwtFromRequest = (request: Request): string | undefined => {
  const req = request as Request & {
    cookies?: Record<string, string>;
    signedCookies?: Record<string, string>;
  };
  return req.signedCookies?.[AUTH_COOKIE_NAME] ?? req.cookies?.[AUTH_COOKIE_NAME];
};

interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
  name: string;
}

@Injectable()
export class JwtCookieGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const token = readSessionJwtFromRequest(request);
    if (!token) {
      throw new UnauthorizedException('Authentication required.');
    }
    try {
      const payload = this.jwtService.verify<JwtPayload>(token);
      request.user = {
        id: payload.sub,
        email: payload.email,
        role: payload.role,
        name: payload.name,
      };
      return true;
    } catch {
      throw new UnauthorizedException('Session expired or invalid.');
    }
  }
}
