import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { WahaClient } from '../waha/waha.client';
import { WahaService } from '../waha/waha.service';
import { WahaApiError, WahaTransportError } from '../waha/types/waha.types';
import { AppException } from '../common/errors/app.exception';
import { ERROR_CODES } from '../common/errors/error-codes';
import { ulid } from 'ulid';
import type { EnvironmentVariables } from '../config/env.validation';
import type { ApiAccountContext } from '../common/decorators/api-account.decorator';
import { loadConnectedAccount } from '../whatsapp-accounts/load-connected-account';

export interface SendInput {
  chatId: string;
  text: string;
}

export interface SendResult {
  requestId: string;
  messageId: string;
  chatId: string;
  status: 'sent';
  sentAt: string;
}

@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly wahaClient: WahaClient,
    private readonly wahaService: WahaService,
    private readonly configService: ConfigService<EnvironmentVariables, true>,
  ) {}

  async send(account: ApiAccountContext, input: SendInput): Promise<SendResult> {
    this.assertText(input.text);
    const dbAccount = await loadConnectedAccount(
      this.prisma,
      account.projectId,
      account.whatsappAccountId,
    );
    const requestId = `req_${ulid()}`;
    try {
      const wahaSession = this.wahaService.effectiveSessionName(dbAccount);
      const wahaResult = await this.wahaClient.sendText(wahaSession, input.chatId, input.text);
      return {
        requestId,
        messageId: wahaResult.id ?? requestId,
        chatId: input.chatId,
        status: 'sent',
        sentAt: new Date().toISOString(),
      };
    } catch (error) {
      throw this.toAppException(error);
    }
  }

  private assertText(rawText: string): void {
    const trimmed = rawText.trim();
    if (trimmed.length === 0) {
      throw new AppException({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: 'text is required.',
        status: 400,
      });
    }
    const max = this.configService.get('MAX_TEXT_LENGTH', { infer: true });
    if (rawText.length > max) {
      throw new AppException({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: `text exceeds max length of ${max} characters.`,
        status: 400,
      });
    }
  }

  private toAppException(error: unknown): AppException {
    if (error instanceof AppException) return error;
    if (error instanceof WahaTransportError) {
      return new AppException({
        code: ERROR_CODES.WAHA_UNAVAILABLE,
        message: 'WAHA service is currently unavailable.',
        status: 503,
      });
    }
    if (error instanceof WahaApiError) {
      this.logger.warn({ msg: 'waha_api_error', status: error.status });
      return new AppException({
        code: ERROR_CODES.MESSAGE_SEND_FAILED,
        message: 'Failed to send WhatsApp message.',
        status: 502,
      });
    }
    this.logger.error({
      msg: 'send_unexpected_error',
      error: error instanceof Error ? error.message : 'unknown',
    });
    return new AppException({
      code: ERROR_CODES.MESSAGE_SEND_FAILED,
      message: 'Failed to send WhatsApp message.',
      status: 502,
    });
  }
}
