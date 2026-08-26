import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { ApiTokensService } from '../../api-tokens/api-tokens.service';
import { parseBearerToken } from '../utils/bearer-token';
import { assertProjectToken } from '../auth/assert-project-token';
import type { RequestWithApiProject } from '../decorators/api-project.decorator';

@Injectable()
export class ProjectApiTokenGuard implements CanActivate {
  constructor(private readonly apiTokensService: ApiTokensService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const raw = parseBearerToken(request.header('authorization'));
    const found = await this.apiTokensService.findProjectByRaw(raw);
    const project = assertProjectToken(found);
    void this.apiTokensService.touchLastUsed(project.apiTokenId);
    (request as RequestWithApiProject).apiProject = project;
    return true;
  }
}
