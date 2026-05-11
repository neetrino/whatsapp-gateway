import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MessageStatus, MessageType, SessionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WahaClient } from '../waha/waha.client';
import { WahaService } from '../waha/waha.service';
import { WahaApiError, WahaTransportError } from '../waha/types/waha.types';
import { AppException } from '../common/errors/app.exception';
import { ERROR_CODES } from '../common/errors/error-codes';
import { ulid } from 'ulid';
import type { EnvironmentVariables } from '../config/env.validation';
import type { ApiAccountContext } from '../common/decorators/api-account.decorator';

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
    const dbAccount = await this.loadAccountAndAssertConnected(account.whatsappAccountId);
    const requestId = `req_${ulid()}`;

    const log = await this.prisma.outboundMessageLog.create({
      data: {
        whatsappAccountId: dbAccount.id,
        requestId,
        chatId: input.chatId,
        messageType: MessageType.TEXT,
        status: MessageStatus.PENDING,
      },
    });

    try {
      const wahaSession = this.wahaService.effectiveSessionName(dbAccount);
      const wahaResult = await this.wahaClient.sendText(wahaSession, input.chatId, input.text);
      const sentAt = new Date();
      await this.prisma.outboundMessageLog.update({
        where: { id: log.id },
        data: {
          status: MessageStatus.SENT,
          wahaMessageId: wahaResult.id ?? null,
        },
      });
      return {
        requestId,
        messageId: wahaResult.id ?? log.id,
        chatId: input.chatId,
        status: 'sent',
        sentAt: sentAt.toISOString(),
      };
    } catch (error) {
      await this.recordFailure(log.id, error);
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

  private async loadAccountAndAssertConnected(
    whatsappAccountId: string,
  ): Promise<{ id: string; sessionName: string }> {
    const account = await this.prisma.whatsappAccount.findUnique({
      where: { id: whatsappAccountId },
      select: { id: true, sessionName: true, isActive: true, status: true },
    });
    if (!account || !account.isActive || account.status !== SessionStatus.CONNECTED) {
      throw new AppException({
        code: ERROR_CODES.WHATSAPP_NOT_CONNECTED,
        message: 'WhatsApp account is not connected. Please scan QR code in Gateway dashboard.',
        status: 409,
      });
    }
    return { id: account.id, sessionName: account.sessionName };
  }

  private async recordFailure(logId: string, error: unknown): Promise<void> {
    const errorCode = this.extractErrorCode(error);
    const errorMessage = error instanceof Error ? error.message.slice(0, 500) : 'unknown';
    await this.prisma.outboundMessageLog
      .update({
        where: { id: logId },
        data: { status: MessageStatus.FAILED, errorCode, errorMessage },
      })
      .catch(() => undefined);
  }

  private extractErrorCode(error: unknown): string {
    if (error instanceof WahaTransportError) return ERROR_CODES.WAHA_UNAVAILABLE;
    if (error instanceof WahaApiError) return ERROR_CODES.MESSAGE_SEND_FAILED;
    if (error instanceof AppException) return error.code;
    return ERROR_CODES.INTERNAL_ERROR;
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
