import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { ApiTokensService } from '../../api-tokens/api-tokens.service';
import { AppException } from '../errors/app.exception';
import { ERROR_CODES } from '../errors/error-codes';
import type { RequestWithApiAccount } from '../decorators/api-account.decorator';

const BEARER_PATTERN = /^Bearer\s+([A-Za-z0-9_\-.]{8,256})$/;

@Injectable()
export class ApiTokenGuard implements CanActivate {
  constructor(private readonly apiTokensService: ApiTokensService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const header = request.header('authorization');
    if (!header) {
      throw new AppException({
        code: ERROR_CODES.UNAUTHORIZED,
        message: 'Authorization token is required.',
        status: 401,
      });
    }
    const match = BEARER_PATTERN.exec(header.trim());
    if (!match) {
      throw new AppException({
        code: ERROR_CODES.INVALID_TOKEN,
        message: 'Invalid API token.',
        status: 401,
      });
    }
    const raw = match[1];
    if (!raw) {
      throw new AppException({
        code: ERROR_CODES.INVALID_TOKEN,
        message: 'Invalid API token.',
        status: 401,
      });
    }
    const found = await this.apiTokensService.findValidByRaw(raw);
    if (!found) {
      throw new AppException({
        code: ERROR_CODES.INVALID_TOKEN,
        message: 'Invalid API token.',
        status: 401,
      });
    }
    if (found.revoked) {
      throw new AppException({
        code: ERROR_CODES.TOKEN_REVOKED,
        message: 'API token has been revoked.',
        status: 403,
      });
    }
    void this.apiTokensService.touchLastUsed(found.apiTokenId);
    (request as RequestWithApiAccount).apiAccount = {
      apiTokenId: found.apiTokenId,
      whatsappAccountId: found.whatsappAccountId,
      sessionName: found.sessionName,
    };
    return true;
  }
}
