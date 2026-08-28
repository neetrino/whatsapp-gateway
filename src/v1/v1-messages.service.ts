import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MessageStatus, MessageType, OutboundIdempotencyStatus } from '@prisma/client';
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
import type { V1SendMessageDto } from './dto/send-v1-message.dto';
import { hashV1SendRequest } from './request-hash';
import {
  beginIdempotency,
  markIdempotencyFailed,
  persistSentAndSucceeded,
  type IdempotencyBegin,
  type V1SendResult,
} from './message-idempotency';
import {
  outcomeForSendFailure,
  safeErrorSummary,
  sendFailureCode,
  toSendAppException,
} from './v1-send-errors';

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
  ) {}

  async send(
    project: ApiProjectContext,
    accountId: string,
    input: V1SendMessageDto,
    idempotencyKey: string,
  ): Promise<V1SendResult> {
    const owned = await loadOwnedAccount(this.prisma, project.projectId, accountId);
    const requestHash = hashV1SendRequest(input);
    const begun = await beginIdempotency(this.prisma, {
      accountId: owned.id,
      idempotencyKey,
      requestHash,
      staleMs: this.configService.get('IDEMPOTENCY_PROCESSING_TIMEOUT_MS', { infer: true }),
      requestId: `req_${ulid()}`,
      chatId: input.chatId,
      messageType: MessageType[input.type],
    });
    if (begun.kind === 'replay') return begun.result;
    try {
      this.assertPayload(input);
      const ready = assertAccountReady(owned);
      const media = input.type === 'TEXT' ? null : await this.prepareMedia(input);
      return await this.dispatch(this.wahaService.effectiveSessionName(ready), begun, input, media);
    } catch (error) {
      if (error instanceof AppException && error.code === ERROR_CODES.MESSAGE_OUTCOME_UNKNOWN) {
        throw error;
      }
      await this.failSend(begun.log.id, begun.row.id, error, input.type, false);
      throw toSendAppException(error, input.type);
    }
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

  private async dispatch(
    sessionName: string,
    begun: Extract<IdempotencyBegin, { kind: 'fresh' }>,
    input: V1SendMessageDto,
    media: PreparedMedia | null,
  ): Promise<V1SendResult> {
    let dispatched = false;
    try {
      const wahaId = await this.sendToWaha(sessionName, input, media);
      dispatched = true;
      const result: V1SendResult = {
        requestId: begun.log.requestId,
        messageId: wahaId ?? begun.log.id,
        status: 'sent',
        sentAt: new Date().toISOString(),
      };
      await this.persistSuccess(begun, result, wahaId);
      this.logger.log({
        msg: 'v1_send_succeeded',
        requestId: result.requestId,
        accountId: begun.row.whatsappAccountId,
        messageType: input.type,
        status: 'sent',
      });
      return result;
    } catch (error) {
      this.logger.warn({
        msg: dispatched ? 'v1_send_persist_or_waha_unknown' : 'v1_send_failed',
        accountId: begun.row.whatsappAccountId,
        messageType: input.type,
        error: safeErrorSummary(error),
      });
      await this.failSend(begun.log.id, begun.row.id, error, input.type, dispatched);
      throw toSendAppException(error, input.type);
    }
  }

  private async persistSuccess(
    begun: Extract<IdempotencyBegin, { kind: 'fresh' }>,
    result: V1SendResult,
    wahaId: string | null,
  ): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        await persistSentAndSucceeded(tx, {
          logId: begun.log.id,
          idempotencyId: begun.row.id,
          result,
          wahaMessageId: wahaId,
        });
      });
    } catch (error) {
      this.logger.error({
        msg: 'v1_send_persist_after_waha_failed',
        requestId: result.requestId,
        error: safeErrorSummary(error),
      });
      await markIdempotencyFailed(
        this.prisma,
        begun.row.id,
        ERROR_CODES.MESSAGE_OUTCOME_UNKNOWN,
        OutboundIdempotencyStatus.OUTCOME_UNKNOWN,
      ).catch(() => undefined);
      throw new AppException({
        code: ERROR_CODES.MESSAGE_OUTCOME_UNKNOWN,
        message:
          'Send may have been delivered but persistence failed. Do not retry with a new key.',
        status: 503,
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

  private async failSend(
    logId: string,
    idempotencyId: string,
    error: unknown,
    kind: V1SendMessageDto['type'],
    dispatched: boolean,
  ): Promise<void> {
    const errorCode = sendFailureCode(error, kind);
    const outcome = outcomeForSendFailure(error, dispatched);
    if (!dispatched && outcome === OutboundIdempotencyStatus.FAILED) {
      await this.prisma.outboundMessageLog
        .updateMany({
          where: { id: logId, status: MessageStatus.PENDING },
          data: { status: MessageStatus.FAILED, errorCode, errorMessage: safeErrorSummary(error) },
        })
        .catch(() => undefined);
    }
    await markIdempotencyFailed(this.prisma, idempotencyId, errorCode, outcome);
  }
}
