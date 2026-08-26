import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WhatsappAccountMode } from '@prisma/client';
import type { EnvironmentVariables } from '../config/env.validation';
import { AppException } from '../common/errors/app.exception';
import { ERROR_CODES } from '../common/errors/error-codes';
import { PrismaService } from '../prisma/prisma.service';
import { verifyWahaWebhookHmac } from './waha-hmac';
import { mapWahaEventToProjectPayload } from './waha-event.mapper';
import { ProjectWebhookDeliveryService } from './project-webhook-delivery.service';

const WAHA_REPLAY_WINDOW_MS = 5 * 60 * 1000;

export interface WahaInboundHeaders {
  hmac?: string;
  hmacAlgorithm?: string;
  requestId?: string;
  timestamp?: string;
}

@Injectable()
export class WahaInboundService {
  private readonly logger = new Logger(WahaInboundService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<EnvironmentVariables, true>,
    private readonly deliveryService: ProjectWebhookDeliveryService,
  ) {}

  verifyRequest(rawBody: Buffer, headers: WahaInboundHeaders): void {
    const secret = this.config.get('WAHA_WEBHOOK_SECRET', { infer: true });
    if (!verifyWahaWebhookHmac(rawBody, secret, headers.hmac, headers.hmacAlgorithm)) {
      throw new AppException({
        code: ERROR_CODES.UNAUTHORIZED,
        message: 'Invalid WAHA webhook signature.',
        status: 401,
      });
    }
    const ts = Number(headers.timestamp);
    if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > WAHA_REPLAY_WINDOW_MS) {
      throw new AppException({
        code: ERROR_CODES.UNAUTHORIZED,
        message: 'WAHA webhook timestamp is outside the allowed window.',
        status: 401,
      });
    }
  }

  async handleEvent(rawBody: Buffer, headers: WahaInboundHeaders): Promise<void> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody.toString('utf8')) as unknown;
    } catch {
      this.logger.warn({ msg: 'waha_inbound_invalid_json' });
      return;
    }
    if (!parsed || typeof parsed !== 'object') return;

    const record = parsed as Record<string, unknown>;
    const sessionName = typeof record.session === 'string' ? record.session : undefined;
    const wahaEvent = typeof record.event === 'string' ? record.event : undefined;
    if (!sessionName || !wahaEvent) {
      this.logger.warn({ msg: 'waha_inbound_missing_fields' });
      return;
    }

    const account = await this.prisma.whatsappAccount.findUnique({
      where: { sessionName },
      select: { id: true, projectId: true, mode: true, isActive: true },
    });
    if (!account) {
      this.logger.warn({ msg: 'waha_inbound_unknown_session', sessionName });
      return;
    }
    if (account.mode !== WhatsappAccountMode.MESSENGER) {
      this.logger.log({ msg: 'waha_inbound_ignored_send_only', accountId: account.id });
      return;
    }

    const maxTextLength = this.config.get('MAX_TEXT_LENGTH', { infer: true });
    const payload = mapWahaEventToProjectPayload(
      account.id,
      wahaEvent,
      record.payload,
      maxTextLength,
    );
    if (!payload) return;

    await this.deliveryService.enqueueDelivery(
      account.projectId,
      account.id,
      payload,
      headers.requestId,
    );
  }
}
