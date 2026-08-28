import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ulid } from 'ulid';
import { PrismaService } from '../prisma/prisma.service';
import { WahaClient } from '../waha/waha.client';
import { WahaService } from '../waha/waha.service';
import { AppException } from '../common/errors/app.exception';
import { ERROR_CODES } from '../common/errors/error-codes';
import type { EnvironmentVariables } from '../config/env.validation';
import type { ApiProjectContext } from '../common/decorators/api-project.decorator';
import { assertAccountReady, loadOwnedAccount } from '../whatsapp-accounts/load-connected-account';
import {
  filenameFromUrl,
  mimetypeForImagePath,
  mimetypeForVideoPath,
  validateMediaUrl,
} from '../messages/media-url-validation';
import { IdempotencyScope, IdempotencyStatus } from '../common/db-enums';
import { IdempotencyStore } from '../common/idempotency/idempotency.store';
import type { V1SendMessageDto } from './dto/send-v1-message.dto';
import { hashV1SendRequest } from './request-hash';
import {
  exceptionFromStoredFailure,
  safeErrorSummary,
  sendFailureCode,
  toSendAppException,
} from './v1-send-errors';
import type { V1SendResult } from './v1-send.types';

interface PreparedMedia {
  href: string;
  mimetype: string;
  filename: string;
}

@Injectable()
export class V1MessagesService {
  private readonly logger = new Logger(V1MessagesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly wahaClient: WahaClient,
    private readonly wahaService: WahaService,
    private readonly configService: ConfigService<EnvironmentVariables, true>,
    private readonly idempotency: IdempotencyStore,
  ) {}

  async send(
    project: ApiProjectContext,
    accountId: string,
    input: V1SendMessageDto,
    idempotencyKey: string,
  ): Promise<V1SendResult> {
    const owned = await loadOwnedAccount(this.prisma, project.projectId, accountId);
    const begun = await this.idempotency.begin({
      accountId: owned.id,
      scope: IdempotencyScope.SEND,
      idempotencyKey,
      requestHash: hashV1SendRequest(input),
    });
    if (begun.kind === 'replay') return this.replaySend(begun.resultJson, begun.errorCode);
    const requestId = `req_${ulid()}`;
    try {
      this.assertPayload(input);
      const ready = assertAccountReady(owned);
      const media = input.type === 'TEXT' ? null : await this.prepareMedia(input);
      const wahaId = await this.sendToWaha(
        this.wahaService.effectiveSessionName(ready),
        input,
        media,
      );
      const result: V1SendResult = {
        requestId,
        messageId: wahaId ?? requestId,
        status: 'sent',
        sentAt: new Date().toISOString(),
      };
      await this.idempotency.succeed(begun.id, result);
      this.logger.log({
        msg: 'v1_send_succeeded',
        requestId,
        accountId: ready.id,
        messageType: input.type,
      });
      return result;
    } catch (error) {
      this.logger.warn({
        msg: 'v1_send_failed',
        accountId: owned.id,
        messageType: input.type,
        error: safeErrorSummary(error),
      });
      const mapped = toSendAppException(error, input.type);
      const status =
        mapped.code === ERROR_CODES.MESSAGE_OUTCOME_UNKNOWN
          ? IdempotencyStatus.OUTCOME_UNKNOWN
          : IdempotencyStatus.FAILED;
      await this.idempotency.fail(begun.id, sendFailureCode(error, input.type), status);
      throw mapped;
    }
  }

  private replaySend(resultJson: string | null, errorCode: string | null): V1SendResult {
    if (resultJson) return JSON.parse(resultJson) as V1SendResult;
    throw exceptionFromStoredFailure(errorCode);
  }

  private assertPayload(input: V1SendMessageDto): void {
    if (input.type !== 'TEXT') {
      this.normalizeCaption(input.caption);
      return;
    }
    if (input.text.trim().length === 0) {
      throw new AppException({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: 'text is required.',
        status: 400,
      });
    }
    const max = this.configService.get('MAX_TEXT_LENGTH', { infer: true });
    if (input.text.length > max) {
      throw new AppException({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: `text exceeds max length of ${max} characters.`,
        status: 400,
      });
    }
  }

  private async sendToWaha(
    sessionName: string,
    input: V1SendMessageDto,
    media: PreparedMedia | null,
  ): Promise<string | null> {
    if (input.type === 'TEXT') {
      const result = await this.wahaClient.sendText(sessionName, input.chatId, input.text);
      return result.id ?? null;
    }
    if (!media) {
      throw new AppException({
        code: ERROR_CODES.INVALID_MEDIA_URL,
        message: 'mediaUrl is required.',
        status: 400,
      });
    }
    const caption = this.normalizeCaption(input.caption);
    const result =
      input.type === 'IMAGE'
        ? await this.wahaService.sendImageByUrl(
            sessionName,
            input.chatId,
            media.href,
            { mimetype: media.mimetype, filename: media.filename },
            caption,
          )
        : await this.wahaService.sendVideoByUrl(
            sessionName,
            input.chatId,
            media.href,
            { mimetype: media.mimetype, filename: media.filename },
            caption,
          );
    return result.id ?? null;
  }

  private async prepareMedia(
    input: Extract<V1SendMessageDto, { type: 'IMAGE' | 'VIDEO' }>,
  ): Promise<PreparedMedia> {
    const maxMb =
      input.type === 'IMAGE'
        ? this.configService.get('MAX_IMAGE_SIZE_MB', { infer: true })
        : this.configService.get('MAX_VIDEO_SIZE_MB', { infer: true });
    const { href } = await validateMediaUrl(input.mediaUrl, input.type, maxMb * 1024 * 1024);
    const pathname = new URL(href).pathname;
    if (input.type === 'IMAGE') {
      return {
        href,
        mimetype: mimetypeForImagePath(pathname),
        filename: filenameFromUrl(href, 'image.jpg'),
      };
    }
    return {
      href,
      mimetype: mimetypeForVideoPath(pathname),
      filename: filenameFromUrl(href, 'video.mp4'),
    };
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
    return raw.trim().length === 0 ? undefined : raw.trim();
  }
}
