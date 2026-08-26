import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { ApiTokensService } from '../../api-tokens/api-tokens.service';
import { AppException } from '../errors/app.exception';
import { ERROR_CODES } from '../errors/error-codes';
import type { RequestWithApiAccount } from '../decorators/api-account.decorator';
import { parseBearerToken } from '../utils/bearer-token';
import { assertProjectToken } from '../auth/assert-project-token';

@Injectable()
export class ApiTokenGuard implements CanActivate {
  constructor(private readonly apiTokensService: ApiTokensService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const raw = parseBearerToken(request.header('authorization'));
    const found = await this.apiTokensService.findValidByRaw(raw);
    const project = assertProjectToken(found);
    const account = this.resolveLegacyAccount(found?.activeAccounts ?? []);
    void this.apiTokensService.touchLastUsed(project.apiTokenId);
    (request as RequestWithApiAccount).apiAccount = {
      apiTokenId: project.apiTokenId,
      projectId: project.projectId,
      whatsappAccountId: account.id,
      sessionName: account.sessionName,
    };
    return true;
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

export { ApiTokenGuard as LegacyApiTokenGuard };
