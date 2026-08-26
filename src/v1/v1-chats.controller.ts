import { Controller, Get, HttpCode, HttpStatus, Param, Query, UseGuards } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { ProjectApiTokenGuard } from '../common/guards/project-api-token.guard';
import { ApiProject, type ApiProjectContext } from '../common/decorators/api-project.decorator';
import { AppException } from '../common/errors/app.exception';
import { ERROR_CODES } from '../common/errors/error-codes';
import { V1ChatsService } from './v1-chats.service';
import { parseWhatsappChatId } from '../common/utils/whatsapp-chat-id';
import { ListChatMessagesQueryDto, ListChatsQueryDto } from './dto/list-chats-query.dto';

@Controller('api/v1/accounts')
@Public()
@UseGuards(ProjectApiTokenGuard)
export class V1ChatsController {
  constructor(private readonly chatsService: V1ChatsService) {}

  @Get(':accountId/chats')
  @HttpCode(HttpStatus.OK)
  async listChats(
    @Param('accountId') accountId: string,
    @Query() query: ListChatsQueryDto,
    @ApiProject() project: ApiProjectContext | undefined,
  ) {
    const data = await this.chatsService.listChats(this.requireProject(project), accountId, query);
    return { success: true, data };
  }

  @Get(':accountId/chats/:chatId/messages')
  @HttpCode(HttpStatus.OK)
  async listMessages(
    @Param('accountId') accountId: string,
    @Param('chatId') chatId: string,
    @Query() query: ListChatMessagesQueryDto,
    @ApiProject() project: ApiProjectContext | undefined,
  ) {
    const data = await this.chatsService.listMessages(
      this.requireProject(project),
      accountId,
      parseWhatsappChatId(chatId),
      query,
    );
    return { success: true, data };
  }

  private requireProject(project: ApiProjectContext | undefined): ApiProjectContext {
    if (!project) {
      throw new AppException({
        code: ERROR_CODES.UNAUTHORIZED,
        message: 'Authorization token is required.',
        status: 401,
      });
    }
    return project;
  }
}
