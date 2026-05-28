import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTokenGuard } from '../common/guards/api-token.guard';
import { PhoneRejectionGuard } from '../common/guards/phone-rejection.guard';
import { Public } from '../common/decorators/public.decorator';
import { ApiAccount, ApiAccountContext } from '../common/decorators/api-account.decorator';
import { CHAT_ID_REGEX, SendMessageDto } from './dto/send-message.dto';
import { SendByUrlDto } from './dto/send-by-url.dto';
import { SendMediaDto } from './dto/send-media.dto';
import { MessagesService, SendResult } from './messages.service';
import { MessagesMediaService, SendMediaResult } from './messages-media.service';
import { AppException } from '../common/errors/app.exception';
import { ERROR_CODES } from '../common/errors/error-codes';
import { ApiTokensService } from '../api-tokens/api-tokens.service';

const QUERY_TOKEN_PATTERN = /^[A-Za-z0-9_\-.]{8,256}$/;
const SEND_BY_URL_ROUTE = '/api/messages/send-by-url';
type SendByUrlParamsSource = 'query' | 'body';

@Controller('api/messages')
export class MessagesController {
  private readonly logger = new Logger(MessagesController.name);

  constructor(
    private readonly messagesService: MessagesService,
    private readonly messagesMediaService: MessagesMediaService,
    private readonly apiTokensService: ApiTokensService,
  ) {}

  @Public()
  @UseGuards(ApiTokenGuard, PhoneRejectionGuard)
  @Post('send')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  async send(
    @Body() dto: SendMessageDto,
    @ApiAccount() account: ApiAccountContext | undefined,
  ): Promise<{ success: true; data: SendResult }> {
    if (!account) {
      throw new AppException({
        code: ERROR_CODES.UNAUTHORIZED,
        message: 'Authorization token is required.',
        status: 401,
      });
    }
    const data = await this.messagesService.send(account, {
      chatId: dto.chatId,
      text: dto.text,
    });
    return { success: true, data };
  }

  @Public()
  @Get('send-by-url')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  async sendByUrl(@Query() query: SendByUrlDto): Promise<{ success: true; data: SendResult }> {
    const params = this.normalizeSendByUrlParams(query, 'query');
    return this.sendByUrlWithToken(params, 'GET', 'query');
  }

  @Public()
  @Post('send-by-url')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  async sendByUrlPost(
    @Query() query: Record<string, unknown>,
    @Body() body: Record<string, unknown> | undefined,
  ): Promise<{ success: true; data: SendResult }> {
    const { params, source } = this.resolveSendByUrlParams(query, body);
    return this.sendByUrlWithToken(params, 'POST', source);
  }

  @Public()
  @UseGuards(ApiTokenGuard, PhoneRejectionGuard)
  @Post('send-media')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  async sendMedia(
    @Body() dto: SendMediaDto,
    @ApiAccount() account: ApiAccountContext | undefined,
  ): Promise<{ success: true; data: SendMediaResult }> {
    if (!account) {
      throw new AppException({
        code: ERROR_CODES.UNAUTHORIZED,
        message: 'Authorization token is required.',
        status: 401,
      });
    }
    const data = await this.messagesMediaService.sendMedia(account, {
      chatId: dto.chatId,
      mediaType: dto.mediaType,
      mediaUrl: dto.mediaUrl,
      caption: dto.caption,
    });
    return { success: true, data };
  }

  private async sendByUrlWithToken(
    params: SendByUrlDto,
    method: 'GET' | 'POST',
    source: SendByUrlParamsSource,
  ): Promise<{ success: true; data: SendResult }> {
    this.logSendByUrlRequest(method, source, params.chatId);
    const rawToken = params.token;
    if (!QUERY_TOKEN_PATTERN.test(rawToken)) {
      throw new AppException({
        code: ERROR_CODES.INVALID_TOKEN,
        message: 'Invalid API token.',
        status: 401,
      });
    }

    const found = await this.apiTokensService.findValidByRaw(rawToken);
    if (!found) {
      throw new AppException({
        code: ERROR_CODES.INVALID_TOKEN,
        message: 'Invalid API token.',
        status: 401,
      });
    }
    if (found.revoked) {
      throw new AppException({
        code: ERROR_CODES.TOKEN_REVOKED,
        message: 'API token has been revoked.',
        status: 403,
      });
    }

    void this.apiTokensService.touchLastUsed(found.apiTokenId);
    const data = await this.messagesService.send(
      {
        apiTokenId: found.apiTokenId,
        whatsappAccountId: found.whatsappAccountId,
        sessionName: found.sessionName,
      },
      { chatId: params.chatId, text: params.text },
    );
    return { success: true, data };
  }

  private resolveSendByUrlParams(
    query: Record<string, unknown>,
    body: Record<string, unknown> | undefined,
  ): { params: SendByUrlDto; source: SendByUrlParamsSource } {
    const fromQuery = {
      token: this.hasOwn(query, 'token'),
      chatId: this.hasOwn(query, 'chatId'),
      text: this.hasOwn(query, 'text'),
    };
    const source: SendByUrlParamsSource =
      fromQuery.token && fromQuery.chatId && fromQuery.text ? 'query' : 'body';
    const params = this.normalizeSendByUrlParams(
      {
        token: this.pickParamValue('token', query, body),
        chatId: this.pickParamValue('chatId', query, body),
        text: this.pickParamValue('text', query, body),
      },
      source,
    );
    return { params, source };
  }

  private normalizeSendByUrlParams(
    input: { token?: unknown; chatId?: unknown; text?: unknown },
    source: SendByUrlParamsSource,
  ): SendByUrlDto {
    const token = this.normalizeToken(input.token);
    const chatId = this.normalizeChatId(input.chatId);
    const text = this.normalizeText(input.text);

    if (!token) {
      this.throwSendByUrlValidationError('token is required.', source, chatId);
    }
    if (!chatId) {
      this.throwSendByUrlValidationError('chatId is required.', source, chatId);
    }
    if (!CHAT_ID_REGEX.test(chatId)) {
      this.throwSendByUrlValidationError(
        'Invalid chatId format. Expected WhatsApp chatId ending with @c.us or @g.us.',
        source,
        chatId,
        ERROR_CODES.INVALID_CHAT_ID,
      );
    }
    if (!text) {
      this.throwSendByUrlValidationError('text is required.', source, chatId);
    }
    return { token, chatId, text };
  }

  private throwSendByUrlValidationError(
    message: string,
    source: SendByUrlParamsSource,
    chatId?: string,
    code:
      | typeof ERROR_CODES.VALIDATION_ERROR
      | typeof ERROR_CODES.INVALID_CHAT_ID = ERROR_CODES.VALIDATION_ERROR,
  ): never {
    this.logger.warn({
      msg: 'send_by_url_validation_failed',
      route: SEND_BY_URL_ROUTE,
      paramsSource: source,
      chatId: chatId ?? '',
      reason: message,
    });
    throw new AppException({
      code,
      message,
      status: 400,
    });
  }

  private logSendByUrlRequest(
    method: 'GET' | 'POST',
    source: SendByUrlParamsSource,
    chatId: string,
  ): void {
    this.logger.log({
      msg: 'send_by_url_request',
      method,
      route: SEND_BY_URL_ROUTE,
      paramsSource: source,
      chatId,
    });
  }

  private pickParamValue(
    key: keyof SendByUrlDto,
    query: Record<string, unknown>,
    body: Record<string, unknown> | undefined,
  ): unknown {
    if (this.hasOwn(query, key)) return query[key];
    if (body && this.hasOwn(body, key)) return body[key];
    return undefined;
  }

  private hasOwn(target: Record<string, unknown> | undefined, key: string): boolean {
    return Boolean(target && Object.prototype.hasOwnProperty.call(target, key));
  }

  private normalizeToken(value: unknown): string {
    const raw = this.toStringValue(value);
    return raw.trim();
  }

  private normalizeChatId(value: unknown): string {
    const raw = this.toStringValue(value);
    return this.safeDecode(raw).trim();
  }

  private normalizeText(value: unknown): string {
    const raw = this.toStringValue(value);
    return this.safeDecode(raw).trim();
  }

  private toStringValue(value: unknown): string {
    if (typeof value === 'string') return value;
    if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
    return '';
  }

  private safeDecode(value: string): string {
    if (!value.includes('%')) return value;
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
}
