import { Controller, Get, HttpCode, HttpStatus, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTokenGuard } from '../common/guards/api-token.guard';
import { Public } from '../common/decorators/public.decorator';
import { ApiAccount, ApiAccountContext } from '../common/decorators/api-account.decorator';
import { AppException } from '../common/errors/app.exception';
import { ERROR_CODES } from '../common/errors/error-codes';
import { ChatsService } from './chats.service';
import { ListChatsQueryDto } from './dto/list-chats-query.dto';
import type { ChatsListResult } from './chats.types';

@Controller('api/chats')
export class ChatsController {
  constructor(private readonly chatsService: ChatsService) {}

  @Public()
  @UseGuards(ApiTokenGuard)
  @Get()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60_000, limit: 1200 } })
  async list(
    @Query() query: ListChatsQueryDto,
    @ApiAccount() account: ApiAccountContext | undefined,
  ): Promise<{ success: true; data: ChatsListResult }> {
    const data = await this.chatsService.listChats(this.requireAccount(account), query);
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
}
