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
    const raw = this.readBearer(request.header('authorization'));
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
    if (!found.projectIsActive) {
      throw new AppException({
        code: ERROR_CODES.PROJECT_INACTIVE,
        message: 'Project is inactive.',
        status: 403,
      });
    }
    const account = this.resolveLegacyAccount(found.activeAccounts);
    void this.apiTokensService.touchLastUsed(found.apiTokenId);
    (request as RequestWithApiAccount).apiAccount = {
      apiTokenId: found.apiTokenId,
      projectId: found.projectId,
      whatsappAccountId: account.id,
      sessionName: account.sessionName,
    };
    return true;
  }

  private readBearer(header: string | undefined): string {
    if (!header) {
      throw new AppException({
        code: ERROR_CODES.UNAUTHORIZED,
        message: 'Authorization token is required.',
        status: 401,
      });
    }
    const match = BEARER_PATTERN.exec(header.trim());
    const raw = match?.[1];
    if (!raw) {
      throw new AppException({
        code: ERROR_CODES.INVALID_TOKEN,
        message: 'Invalid API token.',
        status: 401,
      });
    }
    return raw;
  }

  private resolveLegacyAccount(accounts: Array<{ id: string; sessionName: string }>): {
    id: string;
    sessionName: string;
  } {
    if (accounts.length === 0) {
      throw new AppException({
        code: ERROR_CODES.PROJECT_HAS_NO_ACTIVE_ACCOUNT,
        message: 'Project has no active WhatsApp account.',
        status: 409,
      });
    }
    if (accounts.length > 1) {
      throw new AppException({
        code: ERROR_CODES.PROJECT_ACCOUNT_AMBIGUOUS,
        message: 'Project has more than one active WhatsApp account.',
        status: 409,
      });
    }
    const account = accounts[0];
    if (!account) {
      throw new AppException({
        code: ERROR_CODES.PROJECT_HAS_NO_ACTIVE_ACCOUNT,
        message: 'Project has no active WhatsApp account.',
        status: 409,
      });
    }
    return account;
  }
}
