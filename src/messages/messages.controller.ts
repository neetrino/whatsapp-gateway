import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTokenGuard } from '../common/guards/api-token.guard';
import { PhoneRejectionGuard } from '../common/guards/phone-rejection.guard';
import { Public } from '../common/decorators/public.decorator';
import { ApiAccount, ApiAccountContext } from '../common/decorators/api-account.decorator';
import { SendMessageDto } from './dto/send-message.dto';
import { SendByUrlDto } from './dto/send-by-url.dto';
import { SendMediaDto } from './dto/send-media.dto';
import { MessagesService, SendResult } from './messages.service';
import { MessagesMediaService, SendMediaResult } from './messages-media.service';
import { AppException } from '../common/errors/app.exception';
import { ERROR_CODES } from '../common/errors/error-codes';
import { ApiTokensService } from '../api-tokens/api-tokens.service';

const QUERY_TOKEN_PATTERN = /^[A-Za-z0-9_\-.]{8,256}$/;

@Controller('api/messages')
export class MessagesController {
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
    const rawToken = query.token.trim();
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
      { chatId: query.chatId, text: query.text },
    );
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
}
