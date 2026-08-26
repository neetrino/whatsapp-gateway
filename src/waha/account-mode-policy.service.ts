import { Injectable } from '@nestjs/common';
import { WhatsappAccountMode } from '@prisma/client';
import { AppException } from '../common/errors/app.exception';
import { ERROR_CODES } from '../common/errors/error-codes';
import { WahaClient } from './waha.client';
import { buildSessionConfig } from './session-config';

@Injectable()
export class AccountModePolicyService {
  constructor(private readonly client: WahaClient) {}

  assertMessengerMode(mode: WhatsappAccountMode): void {
    if (mode === WhatsappAccountMode.MESSENGER) return;
    throw new AppException({
      code: ERROR_CODES.ACCOUNT_MODE_NOT_SUPPORTED,
      message: 'Chats and message history require a MESSENGER account.',
      status: 409,
    });
  }

  async applySessionConfig(sessionName: string, mode: WhatsappAccountMode): Promise<void> {
    await this.client.updateSession(sessionName, buildSessionConfig(sessionName, mode));
  }

  async isStoreEnabled(sessionName: string): Promise<boolean> {
    return this.client.isNowebStoreEnabled(sessionName);
  }

  sessionExists(sessionName: string): Promise<boolean> {
    return this.client.sessionExists(sessionName);
  }
}
