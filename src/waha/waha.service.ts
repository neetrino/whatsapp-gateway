import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SessionStatus, WhatsappAccount } from '@prisma/client';
import type { EnvironmentVariables } from '../config/env.validation';
import { PrismaService } from '../prisma/prisma.service';
import { WahaClient } from './waha.client';
import {
  QrViewModel,
  WahaApiError,
  WahaQrPayload,
  WahaSendTextResult,
  WahaSessionStatusRaw,
  WahaTransportError,
} from './types/waha.types';

const STATUS_MAP: Record<string, SessionStatus> = {
  STARTING: SessionStatus.CONNECTING,
  SCAN_QR_CODE: SessionStatus.QR_REQUIRED,
  WORKING: SessionStatus.CONNECTED,
  FAILED: SessionStatus.ERROR,
  STOPPED: SessionStatus.DISCONNECTED,
  STOPPING: SessionStatus.DISCONNECTED,
};

export const mapWahaStatus = (raw: WahaSessionStatusRaw): SessionStatus =>
  STATUS_MAP[raw] ?? SessionStatus.ERROR;

@Injectable()
export class WahaService {
  private readonly logger = new Logger(WahaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly client: WahaClient,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  /** Session name sent to WAHA (Core: usually `default`; Plus: per-account DB name unless overridden). */
  effectiveSessionName(account: Pick<WhatsappAccount, 'sessionName'>): string {
    const override = this.config.get('WAHA_SESSION_NAME', { infer: true })?.trim();
    return override && override.length > 0 ? override : account.sessionName;
  }

  async startSession(account: WhatsappAccount): Promise<void> {
    try {
      await this.client.startSession(this.effectiveSessionName(account));
    } catch (error) {
      this.logSafeError('start_session_failed', error);
    }
  }

  async stopSession(account: WhatsappAccount): Promise<void> {
    try {
      await this.client.stopSession(this.effectiveSessionName(account));
      await this.prisma.whatsappAccount.update({
        where: { id: account.id },
        data: { status: SessionStatus.DISCONNECTED, lastDisconnectedAt: new Date() },
      });
    } catch (error) {
      this.logSafeError('stop_session_failed', error);
    }
  }

  async restartSession(account: WhatsappAccount): Promise<void> {
    try {
      await this.client.restartSession(this.effectiveSessionName(account));
    } catch (error) {
      this.logSafeError('restart_session_failed', error);
      throw error;
    }
  }

  async refreshStatus(account: WhatsappAccount): Promise<WhatsappAccount> {
    const wahaSession = this.effectiveSessionName(account);
    try {
      const info = await this.client.getStatus(wahaSession);
      const status = mapWahaStatus(info.status);
      this.logger.log({
        msg: 'waha_refresh_status',
        accountId: account.id,
        wahaSession,
        wahaRawStatus: info.status,
        mappedStatus: status,
      });
      const phoneNumber = this.extractPhoneNumber(info.me?.id) ?? account.phoneNumber;
      const now = new Date();
      const lastConnectedAt =
        status === SessionStatus.CONNECTED && account.status !== SessionStatus.CONNECTED
          ? now
          : account.lastConnectedAt;
      const lastDisconnectedAt =
        status !== SessionStatus.CONNECTED && account.status === SessionStatus.CONNECTED
          ? now
          : account.lastDisconnectedAt;
      return await this.prisma.whatsappAccount.update({
        where: { id: account.id },
        data: { status, phoneNumber, lastConnectedAt, lastDisconnectedAt },
      });
    } catch (error) {
      if (error instanceof WahaApiError && error.status === 404) {
        return this.prisma.whatsappAccount.update({
          where: { id: account.id },
          data: { status: SessionStatus.DISCONNECTED },
        });
      }
      this.logSafeError('refresh_status_failed', error);
      return account;
    }
  }

  async getQrForDashboard(
    account: WhatsappAccount,
    ctx: { requestId: string; accountId: string },
  ): Promise<QrViewModel> {
    const wahaSession = this.effectiveSessionName(account);
    this.logger.log({
      msg: 'waha_qr_flow',
      requestId: ctx.requestId,
      accountId: ctx.accountId,
      wahaSession,
      action: 'getQr',
    });
    try {
      const payload = await this.client.getQr(wahaSession);
      const dataUrl = this.normalizeQrToDataUrl(payload);
      this.logger.log({
        msg: 'waha_qr_flow',
        requestId: ctx.requestId,
        accountId: ctx.accountId,
        wahaSession,
        action: 'getQr',
        normalizedQr: true,
        errorCode: null,
      });
      return { dataUrl, errorCode: null, errorSummary: null };
    } catch (error) {
      const { code, summary } = this.mapQrError(error);
      const wahaHttpStatus = error instanceof WahaApiError ? error.status : undefined;
      this.logger.warn({
        msg: 'waha_qr_flow',
        requestId: ctx.requestId,
        accountId: ctx.accountId,
        wahaSession,
        action: 'getQr',
        normalizedQr: false,
        errorCode: code,
        wahaHttpStatus,
      });
      return { dataUrl: null, errorCode: code, errorSummary: summary };
    }
  }

  sendImageByUrl(
    sessionName: string,
    chatId: string,
    imageUrl: string,
    file: { mimetype: string; filename: string },
    caption?: string,
  ): Promise<WahaSendTextResult> {
    return this.client.sendImageByUrl(sessionName, chatId, imageUrl, file, caption);
  }

  sendVideoByUrl(
    sessionName: string,
    chatId: string,
    videoUrl: string,
    file: { mimetype: string; filename: string },
    caption?: string,
  ): Promise<WahaSendTextResult> {
    return this.client.sendVideoByUrl(sessionName, chatId, videoUrl, file, caption);
  }

  private normalizeQrToDataUrl(payload: WahaQrPayload): string {
    const raw = payload.data.trim();
    if (raw.startsWith('data:')) {
      return raw;
    }
    const mime = (payload.mimeType || 'image/png').split(';')[0]?.trim() || 'image/png';
    const isTextQr =
      mime.includes('svg') || mime.includes('xml') || mime.includes('html') || raw.startsWith('<');
    if (isTextQr) {
      return `data:${mime};charset=utf-8,${encodeURIComponent(raw)}`;
    }
    return `data:${mime};base64,${raw}`;
  }

  private mapQrError(error: unknown): { code: string; summary: string } {
    if (error instanceof WahaApiError) {
      const msg = error.message;
      if (error.status === 401) {
        return {
          code: 'WAHA_HTTP_401',
          summary: 'WAHA returned 401 (unauthorized). Check WAHA_API_KEY.',
        };
      }
      if (error.status === 404) {
        return {
          code: 'WAHA_HTTP_404',
          summary:
            'WAHA returned 404 (QR route or session not found). Confirm session is started and WAHA_SESSION_NAME matches this WAHA edition.',
        };
      }
      if (error.status === 409) {
        return {
          code: 'WAHA_HTTP_409',
          summary: 'WAHA returned 409 (session conflict). Try “Restart session”.',
        };
      }
      if (error.status === 422) {
        const coreOnlyDefault =
          /only ['"]default['"] session/i.test(msg) || /OnlyDefaultSession/i.test(msg);
        if (coreOnlyDefault) {
          return {
            code: 'WAHA_CORE_DEFAULT_SESSION_ONLY',
            summary:
              'WAHA Core accepts only the session name `default`. Set WAHA_SESSION_NAME=default on the Gateway (see docker-compose / .env.example) or use WAHA Plus for multiple named sessions.',
          };
        }
        return {
          code: 'WAHA_HTTP_422',
          summary: `WAHA returned 422: ${msg.slice(0, 240)}`,
        };
      }
      return {
        code: `WAHA_HTTP_${error.status}`,
        summary: `WAHA error (${error.status}): ${msg.slice(0, 240)}`,
      };
    }
    if (error instanceof WahaTransportError) {
      return { code: 'WAHA_TRANSPORT', summary: error.message.slice(0, 240) };
    }
    return {
      code: 'WAHA_UNKNOWN',
      summary: error instanceof Error ? error.message.slice(0, 240) : 'Unknown WAHA error.',
    };
  }

  private extractPhoneNumber(id: string | undefined): string | undefined {
    if (!id) return undefined;
    const match = /^(\d+)@/.exec(id);
    return match ? match[1] : undefined;
  }

  private logSafeError(msg: string, error: unknown): void {
    if (error instanceof WahaTransportError || error instanceof WahaApiError) {
      this.logger.warn({ msg, error: error.message });
      return;
    }
    this.logger.warn({ msg, error: error instanceof Error ? error.message : 'unknown' });
  }
}
