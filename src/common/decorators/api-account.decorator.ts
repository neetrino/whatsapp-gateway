import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import type { Request } from 'express';

export interface ApiAccountContext {
  apiTokenId: string;
  whatsappAccountId: string;
  sessionName: string;
}

export interface RequestWithApiAccount extends Request {
  apiAccount?: ApiAccountContext;
}

export const ApiAccount = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): ApiAccountContext | undefined => {
    const request = ctx.switchToHttp().getRequest<RequestWithApiAccount>();
    return request.apiAccount;
  },
);
