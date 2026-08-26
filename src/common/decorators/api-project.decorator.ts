import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import type { Request } from 'express';
import type { ProjectAuthContext } from '../auth/assert-project-token';

export type ApiProjectContext = ProjectAuthContext;

export interface RequestWithApiProject extends Request {
  apiProject?: ApiProjectContext;
}

export const ApiProject = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): ApiProjectContext | undefined => {
    const request = ctx.switchToHttp().getRequest<RequestWithApiProject>();
    return request.apiProject;
  },
);
