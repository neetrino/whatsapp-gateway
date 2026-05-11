import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MessageStatus, MessageType, SessionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WahaService } from '../waha/waha.service';
import { WahaApiError, WahaTransportError } from '../waha/types/waha.types';
import { AppException } from '../common/errors/app.exception';
import { ERROR_CODES } from '../common/errors/error-codes';
import { ulid } from 'ulid';
import type { EnvironmentVariables } from '../config/env.validation';
import type { ApiAccountContext } from '../common/decorators/api-account.decorator';
import {
  filenameFromUrl,
  mimetypeForImagePath,
  mimetypeForVideoPath,
  validateMediaUrl,
} from './media-url-validation';

export interface SendMediaInput {
  chatId: string;
  mediaType: 'IMAGE' | 'VIDEO';
  mediaUrl: string;
  caption?: string;
}

export interface SendMediaResult {
  requestId: string;
  messageId: string;
  chatId: string;
  mediaType: 'IMAGE' | 'VIDEO';
  status: 'sent';
  sentAt: string;
}

@Injectable()
export class MessagesMediaService {
  private readonly logger = new Logger(MessagesMediaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly wahaService: WahaService,
    private readonly configService: ConfigService<EnvironmentVariables, true>,
  ) {}

  async sendMedia(account: ApiAccountContext, input: SendMediaInput): Promise<SendMediaResult> {
    const caption = this.normalizeCaption(input.caption);
    const maxMb =
      input.mediaType === 'IMAGE'
        ? this.configService.get('MAX_IMAGE_SIZE_MB', { infer: true })
        : this.configService.get('MAX_VIDEO_SIZE_MB', { infer: true });
    const maxBytes = maxMb * 1024 * 1024;
    const { href } = await validateMediaUrl(input.mediaUrl, input.mediaType, maxBytes);
    const pathname = new URL(href).pathname;
    const filename =
      input.mediaType === 'IMAGE'
        ? filenameFromUrl(href, 'image.jpg')
        : filenameFromUrl(href, 'video.mp4');
    const mimetype =
      input.mediaType === 'IMAGE' ? mimetypeForImagePath(pathname) : mimetypeForVideoPath(pathname);
    const dbAccount = await this.loadAccountAndAssertConnected(account.whatsappAccountId);
    const requestId = `req_${ulid()}`;
    const messageType = input.mediaType === 'IMAGE' ? MessageType.IMAGE : MessageType.VIDEO;

    const log = await this.prisma.outboundMessageLog.create({
      data: {
        whatsappAccountId: dbAccount.id,
        requestId,
        chatId: input.chatId,
        messageType,
        status: MessageStatus.PENDING,
      },
    });

    try {
      const wahaSession = this.wahaService.effectiveSessionName(dbAccount);
      const wahaResult =
        input.mediaType === 'IMAGE'
          ? await this.wahaService.sendImageByUrl(
              wahaSession,
              input.chatId,
              href,
              { mimetype, filename },
              caption,
            )
          : await this.wahaService.sendVideoByUrl(
              wahaSession,
              input.chatId,
              href,
              { mimetype, filename },
              caption,
            );
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
        mediaType: input.mediaType,
        status: 'sent',
        sentAt: sentAt.toISOString(),
      };
    } catch (error) {
      await this.recordFailure(log.id, error, input.mediaType);
      throw this.toAppException(error, input.mediaType);
    }
  }

  private normalizeCaption(raw: string | undefined): string | undefined {
    if (raw === undefined) return undefined;
    const max = this.configService.get('MAX_CAPTION_LENGTH', { infer: true });
    if (raw.length > max) {
      throw new AppException({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: `caption exceeds max length of ${max} characters.`,
        status: 400,
      });
    }
    const trimmed = raw.trim();
    if (trimmed.length === 0) return undefined;
    return raw;
  }

  private async loadAccountAndAssertConnected(
    whatsappAccountId: string,
  ): Promise<{ id: string; sessionName: string }> {
    const acc = await this.prisma.whatsappAccount.findUnique({
      where: { id: whatsappAccountId },
      select: { id: true, sessionName: true, isActive: true, status: true },
    });
    if (!acc || !acc.isActive || acc.status !== SessionStatus.CONNECTED) {
      throw new AppException({
        code: ERROR_CODES.WHATSAPP_NOT_CONNECTED,
        message: 'WhatsApp account is not connected. Please scan QR code in Gateway dashboard.',
        status: 409,
      });
    }
    return { id: acc.id, sessionName: acc.sessionName };
  }

  private async recordFailure(
    logId: string,
    error: unknown,
    kind: 'IMAGE' | 'VIDEO',
  ): Promise<void> {
    const errorCode = this.extractErrorCode(error, kind);
    const errorMessage = error instanceof Error ? error.message.slice(0, 500) : 'unknown';
    await this.prisma.outboundMessageLog
      .update({
        where: { id: logId },
        data: { status: MessageStatus.FAILED, errorCode, errorMessage },
      })
      .catch(() => undefined);
  }

  private extractErrorCode(error: unknown, kind: 'IMAGE' | 'VIDEO'): string {
    if (error instanceof WahaTransportError) return ERROR_CODES.WAHA_UNAVAILABLE;
    if (error instanceof WahaApiError) {
      return kind === 'IMAGE' ? ERROR_CODES.IMAGE_SEND_FAILED : ERROR_CODES.VIDEO_SEND_FAILED;
    }
    if (error instanceof AppException) return error.code;
    return ERROR_CODES.INTERNAL_ERROR;
  }

  private toAppException(error: unknown, kind: 'IMAGE' | 'VIDEO'): AppException {
    if (error instanceof AppException) return error;
    if (error instanceof WahaTransportError) {
      return new AppException({
        code: ERROR_CODES.WAHA_UNAVAILABLE,
        message: 'WAHA service is currently unavailable.',
        status: 503,
      });
    }
    if (error instanceof WahaApiError) {
      this.logger.warn({ msg: 'waha_media_api_error', status: error.status, kind });
      return new AppException({
        code: kind === 'IMAGE' ? ERROR_CODES.IMAGE_SEND_FAILED : ERROR_CODES.VIDEO_SEND_FAILED,
        message:
          kind === 'IMAGE' ? 'Failed to send WhatsApp image.' : 'Failed to send WhatsApp video.',
        status: 502,
      });
    }
    this.logger.error({
      msg: 'send_media_unexpected_error',
      kind,
      error: error instanceof Error ? error.message : 'unknown',
    });
    return new AppException({
      code: ERROR_CODES.MEDIA_SEND_FAILED,
      message: 'Failed to send WhatsApp media.',
      status: 502,
    });
  }
}
