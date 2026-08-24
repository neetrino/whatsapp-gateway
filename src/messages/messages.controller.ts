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
import { SendMessageDto } from './dto/send-message.dto';
import { SendMediaDto } from './dto/send-media.dto';
import { MessagesService, SendResult } from './messages.service';
import { MessagesMediaService, SendMediaResult } from './messages-media.service';
import { AppException } from '../common/errors/app.exception';
import { ERROR_CODES } from '../common/errors/error-codes';

const SEND_BY_URL_ROUTE = '/api/messages/send-by-url';

@Controller('api/messages')
export class MessagesController {
  private readonly logger = new Logger(MessagesController.name);

  constructor(
    private readonly messagesService: MessagesService,
    private readonly messagesMediaService: MessagesMediaService,
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
    const data = await this.messagesService.send(this.requireAccount(account), {
      chatId: dto.chatId,
      text: dto.text,
    });
    return { success: true, data };
  }

  @Public()
  @Get('send-by-url')
  @HttpCode(HttpStatus.OK)
  sendByUrlGet(@Query() query: Record<string, unknown>): never {
    this.rejectSecretsInQuery(query);
    throw new AppException({
      code: ERROR_CODES.UNAUTHORIZED,
      message: 'Authorization token is required. Use Authorization: Bearer.',
      status: 401,
    });
  }

  @Public()
  @UseGuards(ApiTokenGuard, PhoneRejectionGuard)
  @Post('send-by-url')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  async sendByUrlPost(
    @Query() query: Record<string, unknown>,
    @Body() dto: SendMessageDto,
    @ApiAccount() account: ApiAccountContext | undefined,
  ): Promise<{ success: true; data: SendResult }> {
    this.rejectSecretsInQuery(query);
    this.logger.log({
      msg: 'send_by_url_request',
      method: 'POST',
      route: SEND_BY_URL_ROUTE,
      chatId: dto.chatId,
    });
    const data = await this.messagesService.send(this.requireAccount(account), {
      chatId: dto.chatId,
      text: dto.text,
    });
    return { success: true, data };
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
    const data = await this.messagesMediaService.sendMedia(this.requireAccount(account), {
      chatId: dto.chatId,
      mediaType: dto.mediaType,
      mediaUrl: dto.mediaUrl,
      caption: dto.caption,
    });
    return { success: true, data };
  }

  private requireAccount(account: ApiAccountContext | undefined): ApiAccountContext {
    if (!account) {
      throw new AppException({
        code: ERROR_CODES.UNAUTHORIZED,
        message: 'Authorization token is required.',
        status: 401,
      });
    }
    return account;
  }

  private rejectSecretsInQuery(query: Record<string, unknown>): void {
    if (!Object.prototype.hasOwnProperty.call(query, 'token')) return;
    throw new AppException({
      code: ERROR_CODES.VALIDATION_ERROR,
      message: 'API tokens must not be sent in the URL or query string. Use Authorization: Bearer.',
      status: 400,
    });
  }
}
