import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WhatsappAccountMode } from '@prisma/client';
import type { EnvironmentVariables } from '../config/env.validation';
import { AppException } from '../common/errors/app.exception';
import { ERROR_CODES } from '../common/errors/error-codes';
import { WahaClient } from './waha.client';
import { buildSessionConfig, type WahaSessionConfigPayload } from './session-config';

@Injectable()
export class AccountModePolicyService {
  constructor(
    private readonly client: WahaClient,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  assertMessengerMode(mode: WhatsappAccountMode): void {
    if (mode === WhatsappAccountMode.MESSENGER) return;
    throw new AppException({
      code: ERROR_CODES.ACCOUNT_MODE_NOT_SUPPORTED,
      message: 'Chats and message history require a MESSENGER account.',
      status: 409,
    });
  }

  buildSessionConfig(sessionName: string, mode: WhatsappAccountMode): WahaSessionConfigPayload {
    return buildSessionConfig(sessionName, mode, {
      inboundWebhookUrl: this.config.get('GATEWAY_INTERNAL_URL', { infer: true }),
      inboundWebhookSecret: this.config.get('WAHA_WEBHOOK_SECRET', { infer: true }),
    });
  }

  async applySessionConfig(sessionName: string, mode: WhatsappAccountMode): Promise<void> {
    await this.client.updateSession(sessionName, this.buildSessionConfig(sessionName, mode));
  }

  async isStoreEnabled(sessionName: string): Promise<boolean> {
    return this.client.isNowebStoreEnabled(sessionName);
  }

  sessionExists(sessionName: string): Promise<boolean> {
    return this.client.sessionExists(sessionName);
  }
}
