import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { ProjectApiTokenGuard } from '../common/guards/project-api-token.guard';
import { ApiProject, type ApiProjectContext } from '../common/decorators/api-project.decorator';
import type { RequestWithId } from '../common/interceptors/request-id.middleware';
import { AppException } from '../common/errors/app.exception';
import { ERROR_CODES } from '../common/errors/error-codes';
import {
  V1AccountsService,
  type V1AccountPairingCode,
  type V1AccountQr,
  type V1AccountStatus,
} from './v1-accounts.service';
import { V1RequestPairingCodeDto } from './dto/request-pairing-code.dto';
import type { V1AccountPublic } from '../whatsapp-accounts/account-public';

@Controller('api/v1/accounts')
@Public()
@UseGuards(ProjectApiTokenGuard)
export class V1AccountsController {
  constructor(private readonly accountsService: V1AccountsService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async list(
    @ApiProject() project: ApiProjectContext | undefined,
  ): Promise<{ success: true; data: V1AccountPublic[] }> {
    const data = await this.accountsService.list(this.requireProject(project));
    return { success: true, data };
  }

  @Get(':accountId/status')
  @HttpCode(HttpStatus.OK)
  async status(
    @Param('accountId') accountId: string,
    @ApiProject() project: ApiProjectContext | undefined,
  ): Promise<{ success: true; data: V1AccountStatus }> {
    const data = await this.accountsService.status(this.requireProject(project), accountId);
    return { success: true, data };
  }

  @Get(':accountId/qr')
  @HttpCode(HttpStatus.OK)
  async qr(
    @Req() req: RequestWithId,
    @Param('accountId') accountId: string,
    @ApiProject() project: ApiProjectContext | undefined,
  ): Promise<{ success: true; data: V1AccountQr }> {
    const data = await this.accountsService.getQr(
      this.requireProject(project),
      accountId,
      req.requestId ?? 'unknown',
    );
    return { success: true, data };
  }

  @Post(':accountId/pairing-code')
  @HttpCode(HttpStatus.OK)
  async pairingCode(
    @Req() req: RequestWithId,
    @Param('accountId') accountId: string,
    @Body() dto: V1RequestPairingCodeDto,
    @ApiProject() project: ApiProjectContext | undefined,
  ): Promise<{ success: true; data: V1AccountPairingCode }> {
    const data = await this.accountsService.requestPairingCode(
      this.requireProject(project),
      accountId,
      dto.phoneNumber,
      req.requestId ?? 'unknown',
    );
    return { success: true, data };
  }

  @Post(':accountId/session/restart')
  @HttpCode(HttpStatus.OK)
  async restart(
    @Param('accountId') accountId: string,
    @ApiProject() project: ApiProjectContext | undefined,
  ): Promise<{ success: true; data: V1AccountStatus }> {
    const data = await this.accountsService.restart(this.requireProject(project), accountId);
    return { success: true, data };
  }

  @Post(':accountId/session/logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Param('accountId') accountId: string,
    @ApiProject() project: ApiProjectContext | undefined,
  ): Promise<{ success: true; data: V1AccountStatus }> {
    const data = await this.accountsService.logout(this.requireProject(project), accountId);
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
