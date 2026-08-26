import { Controller, Get, HttpCode, HttpStatus, Param, UseGuards } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { ProjectApiTokenGuard } from '../common/guards/project-api-token.guard';
import { ApiProject, type ApiProjectContext } from '../common/decorators/api-project.decorator';
import { AppException } from '../common/errors/app.exception';
import { ERROR_CODES } from '../common/errors/error-codes';
import { V1AccountsService, type V1AccountStatus } from './v1-accounts.service';
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
