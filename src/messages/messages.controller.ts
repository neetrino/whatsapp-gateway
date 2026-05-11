import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
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

@Controller('api/messages')
export class MessagesController {
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
