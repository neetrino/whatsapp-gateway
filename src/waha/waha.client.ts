import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError, AxiosInstance, AxiosRequestConfig } from 'axios';
import type { EnvironmentVariables } from '../config/env.validation';
import {
  WahaAddParticipantsInput,
  WahaApiError,
  WahaCreateGroupInput,
  WahaListGroupsQuery,
  WahaQrPayload,
  WahaSendTextResult,
  WahaSessionInfo,
  WahaTransportError,
} from './types/waha.types';

@Injectable()
export class WahaClient {
  private readonly logger = new Logger(WahaClient.name);
  private readonly http: AxiosInstance;

  constructor(configService: ConfigService<EnvironmentVariables, true>) {
    const baseURL = configService.get('WAHA_BASE_URL', { infer: true });
    const apiKey = configService.get('WAHA_API_KEY', { infer: true });
    this.http = axios.create({
      baseURL,
      timeout: 15_000,
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { 'X-Api-Key': apiKey } : {}),
      },
      validateStatus: () => true,
    });
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.http.get('/api/sessions', { timeout: 5_000 });
      return response.status >= 200 && response.status < 500;
    } catch {
      return false;
    }
  }

  async startSession(sessionName: string): Promise<void> {
    const encoded = encodeURIComponent(sessionName);
    try {
      await this.invoke('start session', {
        method: 'POST',
        url: `/api/sessions/${encoded}/start`,
      });
      return;
    } catch (error) {
      const notFound = error instanceof WahaApiError && error.status === 404;
      if (!notFound) throw error;
    }

    await this.invoke('create session', {
      method: 'POST',
      url: '/api/sessions',
      data: { name: sessionName },
    });
    await this.invoke('start session', {
      method: 'POST',
      url: `/api/sessions/${encoded}/start`,
    });
  }

  async stopSession(sessionName: string): Promise<void> {
    await this.invoke('stop session', {
      method: 'POST',
      url: '/api/sessions/stop',
      data: { name: sessionName },
    });
  }

  async restartSession(sessionName: string): Promise<void> {
    await this.invoke('restart session', {
      method: 'POST',
      url: '/api/sessions/restart',
      data: { name: sessionName },
    });
  }

  async logoutSession(sessionName: string): Promise<void> {
    const encoded = encodeURIComponent(sessionName);
    const route = `/api/sessions/${encoded}/logout`;
    this.logger.log({
      msg: 'waha_logout_session',
      action: 'logoutSession',
      wahaSession: sessionName,
      endpointPath: route,
    });
    try {
      const response = await this.http.request({
        method: 'POST',
        url: route,
        validateStatus: () => true,
      });
      this.logger.log({
        msg: 'waha_logout_session',
        action: 'logoutSession',
        wahaSession: sessionName,
        endpointPath: route,
        status: response.status,
      });
      if (response.status >= 200 && response.status < 300) {
        return;
      }
      const upstream = this.extractUpstreamMessage(response.data);
      throw new WahaApiError(
        `WAHA logout session failed (${response.status}): ${upstream ?? 'no message'}`,
        response.status,
        upstream,
      );
    } catch (error) {
      if (error instanceof WahaApiError || error instanceof WahaTransportError) throw error;
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;
        this.logger.warn({
          msg: 'waha_transport_error',
          label: 'logout session',
          code: axiosError.code,
        });
        throw new WahaTransportError(
          `WAHA logout session transport error: ${axiosError.code ?? 'unknown'}`,
        );
      }
      throw new WahaTransportError(
        `WAHA logout session unexpected error: ${error instanceof Error ? error.message : 'unknown'}`,
      );
    }
  }

  async getStatus(sessionName: string): Promise<WahaSessionInfo> {
    const response = await this.invoke<WahaSessionInfo>('get session status', {
      method: 'GET',
      url: `/api/sessions/${encodeURIComponent(sessionName)}`,
    });
    return response;
  }

  /**
   * WAHA may return raw PNG bytes (format=image) or JSON with base64 fields.
   * Tries session-scoped paths used by WAHA Core / Plus.
   */
  async getQr(sessionName: string): Promise<WahaQrPayload> {
    const encoded = encodeURIComponent(sessionName);
    const paths = [`/api/${encoded}/auth/qr`];
    let lastError: unknown;
    for (const url of paths) {
      try {
        return await this.fetchQrBinary(url);
      } catch (error) {
        lastError = error;
      }
      try {
        return await this.fetchQrJson(url);
      } catch (error) {
        lastError = error;
      }
    }
    if (lastError instanceof WahaApiError) throw lastError;
    if (lastError instanceof WahaTransportError) throw lastError;
    throw new WahaTransportError('WAHA get QR failed for all known paths');
  }

  private async fetchQrBinary(url: string): Promise<WahaQrPayload> {
    try {
      const response = await this.http.request<ArrayBuffer>({
        method: 'GET',
        url,
        params: { format: 'image' },
        responseType: 'arraybuffer',
        validateStatus: () => true,
      });
      const ctRaw = response.headers['content-type'];
      const ct = typeof ctRaw === 'string' ? ctRaw.toLowerCase() : '';
      if (response.status < 200 || response.status >= 300) {
        const raw = response.data as ArrayBuffer;
        const upstream = this.extractUpstreamMessage(Buffer.from(raw).toString('utf8'));
        throw new WahaApiError(
          `WAHA get session QR failed (${response.status}): ${upstream ?? 'no message'}`,
          response.status,
          upstream,
        );
      }
      const buf = Buffer.from(response.data as ArrayBuffer);

      if (ct.includes('application/json')) {
        return this.parseQrJsonBody(buf.toString('utf8'));
      }

      if (ct.includes('image/svg') || ct.includes('text/plain') || ct.includes('text/html')) {
        const text = buf.toString('utf8');
        return { mimeType: ct.split(';')[0]?.trim() || 'image/svg+xml', data: text };
      }

      const mime = ct.split(';')[0]?.trim() || 'image/png';
      if (buf.length === 0) {
        throw new WahaApiError('WAHA returned empty QR body', 502);
      }
      return { mimeType: mime, data: buf.toString('base64') };
    } catch (error) {
      if (error instanceof WahaApiError || error instanceof WahaTransportError) throw error;
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;
        this.logger.warn({
          msg: 'waha_transport_error',
          label: 'get session QR binary',
          code: axiosError.code,
        });
        throw new WahaTransportError(
          `WAHA get session QR transport error: ${axiosError.code ?? 'unknown'}`,
        );
      }
      throw new WahaTransportError(
        `WAHA get session QR unexpected error: ${error instanceof Error ? error.message : 'unknown'}`,
      );
    }
  }

  private async fetchQrJson(url: string): Promise<WahaQrPayload> {
    try {
      const response = await this.http.request<unknown>({
        method: 'GET',
        url,
        params: { format: 'json' },
        responseType: 'json',
        validateStatus: () => true,
      });
      if (response.status < 200 || response.status >= 300) {
        const upstream = this.extractUpstreamMessage(response.data);
        throw new WahaApiError(
          `WAHA get session QR failed (${response.status}): ${upstream ?? 'no message'}`,
          response.status,
          upstream,
        );
      }
      const text = JSON.stringify(response.data);
      return this.parseQrJsonBody(text);
    } catch (error) {
      if (error instanceof WahaApiError || error instanceof WahaTransportError) throw error;
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;
        this.logger.warn({
          msg: 'waha_transport_error',
          label: 'get session QR json',
          code: axiosError.code,
        });
        throw new WahaTransportError(
          `WAHA get session QR transport error: ${axiosError.code ?? 'unknown'}`,
        );
      }
      throw new WahaTransportError(
        `WAHA get session QR unexpected error: ${error instanceof Error ? error.message : 'unknown'}`,
      );
    }
  }

  private parseQrJsonBody(text: string): WahaQrPayload {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new WahaApiError('WAHA QR JSON parse failed', 502);
    }
    const record = parsed as Record<string, unknown>;
    const mimeType =
      (typeof record.mimetype === 'string' && record.mimetype) ||
      (typeof record.mimeType === 'string' && record.mimeType) ||
      'image/png';

    const str = (v: unknown): string | undefined =>
      typeof v === 'string' && v.length > 0 ? v : undefined;

    const pickData =
      str(record.data) ??
      str(record.qr) ??
      str(record.qrCode) ??
      str(record.image) ??
      str(record.base64);

    if (pickData) {
      if (pickData.startsWith('data:')) {
        const dataUrl = /^data:([^;]+);base64,(.+)$/i.exec(pickData);
        if (dataUrl?.[1] && dataUrl[2]) {
          return { mimeType: dataUrl[1], data: dataUrl[2] };
        }
        return { mimeType: 'image/png', data: pickData };
      }
      return { mimeType, data: pickData };
    }

    if (typeof record.value === 'string' && record.value.length > 0) {
      const value = record.value;
      const dataUrl = /^data:([^;]+);base64,(.+)$/i.exec(value);
      if (dataUrl?.[1] && dataUrl[2]) {
        return { mimeType: dataUrl[1], data: dataUrl[2] };
      }
      return { mimeType, data: value };
    }

    const urlField = str(record.url);
    if (urlField?.startsWith('data:')) {
      const dataUrl = /^data:([^;]+);base64,(.+)$/i.exec(urlField);
      if (dataUrl?.[1] && dataUrl[2]) {
        return { mimeType: dataUrl[1], data: dataUrl[2] };
      }
    }

    throw new WahaApiError('WAHA QR JSON missing image data', 502);
  }

  async sendText(sessionName: string, chatId: string, text: string): Promise<WahaSendTextResult> {
    const response = await this.invoke<{ id?: string; messageId?: string }>('send text', {
      method: 'POST',
      url: '/api/sendText',
      data: { session: sessionName, chatId, text },
    });
    return { id: response.id ?? response.messageId };
  }

  async listGroups(sessionName: string, query: WahaListGroupsQuery): Promise<unknown> {
    const session = encodeURIComponent(sessionName);
    return this.invoke<unknown>('list groups', {
      method: 'GET',
      url: `/api/${session}/groups`,
      params: {
        limit: query.limit,
        offset: query.offset,
        sortBy: query.sortBy ?? 'subject',
        sortOrder: query.sortOrder ?? 'asc',
        exclude: query.exclude ?? 'participants',
      },
    });
  }

  async createGroup(sessionName: string, input: WahaCreateGroupInput): Promise<unknown> {
    const session = encodeURIComponent(sessionName);
    return this.invoke<unknown>('create group', {
      method: 'POST',
      url: `/api/${session}/groups`,
      data: {
        name: input.name,
        participants: input.participants,
      },
    });
  }

  async getGroup(sessionName: string, groupId: string): Promise<unknown> {
    const session = encodeURIComponent(sessionName);
    const encodedGroupId = encodeURIComponent(groupId);
    return this.invoke<unknown>('get group', {
      method: 'GET',
      url: `/api/${session}/groups/${encodedGroupId}`,
    });
  }

  async refreshGroups(sessionName: string): Promise<unknown> {
    const session = encodeURIComponent(sessionName);
    return this.invoke<unknown>('refresh groups', {
      method: 'POST',
      url: `/api/${session}/groups/refresh`,
    });
  }

  /**
   * Prefer participants/v2 (normalized roles). Fall back to legacy participants on 404.
   * Official docs document both; runtime OpenAPI was not available at implement time.
   */
  async listGroupParticipants(sessionName: string, groupId: string): Promise<unknown> {
    const session = encodeURIComponent(sessionName);
    const encodedGroupId = encodeURIComponent(groupId);
    const v2Path = `/api/${session}/groups/${encodedGroupId}/participants/v2`;
    try {
      return await this.invoke<unknown>('list group participants v2', {
        method: 'GET',
        url: v2Path,
      });
    } catch (error) {
      if (!(error instanceof WahaApiError) || error.status !== 404) {
        throw error;
      }
    }
    return this.invoke<unknown>('list group participants', {
      method: 'GET',
      url: `/api/${session}/groups/${encodedGroupId}/participants`,
    });
  }

  async addGroupParticipants(
    sessionName: string,
    groupId: string,
    input: WahaAddParticipantsInput,
  ): Promise<unknown> {
    const session = encodeURIComponent(sessionName);
    const encodedGroupId = encodeURIComponent(groupId);
    return this.invoke<unknown>('add group participants', {
      method: 'POST',
      url: `/api/${session}/groups/${encodedGroupId}/participants/add`,
      data: { participants: input.participants },
    });
  }

  async getGroupInviteCode(sessionName: string, groupId: string): Promise<unknown> {
    const session = encodeURIComponent(sessionName);
    const encodedGroupId = encodeURIComponent(groupId);
    return this.invoke<unknown>('get group invite code', {
      method: 'GET',
      url: `/api/${session}/groups/${encodedGroupId}/invite-code`,
    });
  }

  /**
   * WAHA Core: POST /api/sendImage — `file.url` is fetched by WAHA (not by this Gateway).
   * @see https://waha.devlike.pro/docs/how-to/send-messages/
   */
  async sendImageByUrl(
    sessionName: string,
    chatId: string,
    imageUrl: string,
    file: { mimetype: string; filename: string },
    caption?: string,
  ): Promise<WahaSendTextResult> {
    const response = await this.invoke<{ id?: string; messageId?: string }>('send image', {
      method: 'POST',
      url: '/api/sendImage',
      data: {
        session: sessionName,
        chatId,
        file: { url: imageUrl, mimetype: file.mimetype, filename: file.filename },
        ...(caption !== undefined ? { caption } : {}),
      },
    });
    return { id: response.id ?? response.messageId };
  }

  /**
   * WAHA Core: POST /api/sendVideo — `file.url` is fetched by WAHA (not by this Gateway).
   * @see https://waha.devlike.pro/docs/how-to/send-messages/
   */
  async sendVideoByUrl(
    sessionName: string,
    chatId: string,
    videoUrl: string,
    file: { mimetype: string; filename: string },
    caption?: string,
  ): Promise<WahaSendTextResult> {
    const response = await this.invoke<{ id?: string; messageId?: string }>('send video', {
      method: 'POST',
      url: '/api/sendVideo',
      data: {
        session: sessionName,
        chatId,
        asNote: false,
        convert: false,
        file: { url: videoUrl, mimetype: file.mimetype, filename: file.filename },
        ...(caption !== undefined ? { caption } : {}),
      },
    });
    return { id: response.id ?? response.messageId };
  }

  private async invoke<T>(label: string, config: AxiosRequestConfig): Promise<T> {
    try {
      const response = await this.http.request<T>(config);
      if (response.status >= 200 && response.status < 300) {
        return response.data;
      }
      const upstream = this.extractUpstreamMessage(response.data);
      throw new WahaApiError(
        `WAHA ${label} failed (${response.status}): ${upstream ?? 'no message'}`,
        response.status,
        upstream,
      );
    } catch (error) {
      if (error instanceof WahaApiError) throw error;
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;
        this.logger.warn({
          msg: 'waha_transport_error',
          label,
          code: axiosError.code,
        });
        throw new WahaTransportError(
          `WAHA ${label} transport error: ${axiosError.code ?? 'unknown'}`,
        );
      }
      throw new WahaTransportError(
        `WAHA ${label} unexpected error: ${error instanceof Error ? error.message : 'unknown'}`,
      );
    }
  }

  private extractUpstreamMessage(data: unknown): string | undefined {
    if (typeof data === 'string') return data.slice(0, 200);
    if (data && typeof data === 'object') {
      const record = data as Record<string, unknown>;
      const candidate = record.message ?? record.error ?? record.detail;
      if (typeof candidate === 'string') return candidate.slice(0, 200);
    }
    return undefined;
  }
}
