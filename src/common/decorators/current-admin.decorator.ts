import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import type { Request } from 'express';

export interface AuthenticatedAdmin {
  id: string;
  email: string;
}

export interface RequestWithAdmin extends Request {
  admin?: AuthenticatedAdmin;
}

export const CurrentAdmin = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedAdmin | undefined => {
    const request = ctx.switchToHttp().getRequest<RequestWithAdmin>();
    return request.admin;
  },
);
