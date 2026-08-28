import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { WahaService } from '../waha/waha.service';
import { WahaApiError, WahaTransportError } from '../waha/types/waha.types';
import { AppException } from '../common/errors/app.exception';
import { ERROR_CODES } from '../common/errors/error-codes';
import { ulid } from 'ulid';
import type { EnvironmentVariables } from '../config/env.validation';
import type { ApiAccountContext } from '../common/decorators/api-account.decorator';
import { loadConnectedAccount } from '../whatsapp-accounts/load-connected-account';
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
    const { href } = await validateMediaUrl(input.mediaUrl, input.mediaType, maxMb * 1024 * 1024);
    const pathname = new URL(href).pathname;
    const filename =
      input.mediaType === 'IMAGE'
        ? filenameFromUrl(href, 'image.jpg')
        : filenameFromUrl(href, 'video.mp4');
    const mimetype =
      input.mediaType === 'IMAGE' ? mimetypeForImagePath(pathname) : mimetypeForVideoPath(pathname);
    const dbAccount = await loadConnectedAccount(
      this.prisma,
      account.projectId,
      account.whatsappAccountId,
    );
    const requestId = `req_${ulid()}`;
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
      return {
        requestId,
        messageId: wahaResult.id ?? requestId,
        chatId: input.chatId,
        mediaType: input.mediaType,
        status: 'sent',
        sentAt: new Date().toISOString(),
      };
    } catch (error) {
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
