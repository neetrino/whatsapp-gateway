import { Body, Controller, Headers, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { ProjectApiTokenGuard } from '../common/guards/project-api-token.guard';
import { PhoneRejectionGuard } from '../common/guards/phone-rejection.guard';
import { ApiProject, type ApiProjectContext } from '../common/decorators/api-project.decorator';
import { AppException } from '../common/errors/app.exception';
import { ERROR_CODES } from '../common/errors/error-codes';
import { requireIdempotencyKey } from '../common/utils/idempotency-key';
import { V1MessagesService } from './v1-messages.service';
import { V1SendMessagePipe } from './v1-send-message.pipe';
import type { V1SendMessageDto } from './dto/send-v1-message.dto';
import type { V1SendResult } from './v1-send.types';

@Controller('api/v1/accounts')
@Public()
@UseGuards(ProjectApiTokenGuard, PhoneRejectionGuard)
export class V1MessagesController {
  constructor(private readonly messagesService: V1MessagesService) {}

  @Post(':accountId/messages')
  @HttpCode(HttpStatus.OK)
  async send(
    @Param('accountId') accountId: string,
    @Body(V1SendMessagePipe) dto: V1SendMessageDto,
    @Headers() headers: Record<string, unknown>,
    @ApiProject() project: ApiProjectContext | undefined,
  ): Promise<{ success: true; data: V1SendResult }> {
    const data = await this.messagesService.send(
      this.requireProject(project),
      accountId,
      dto,
      requireIdempotencyKey(headers),
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
