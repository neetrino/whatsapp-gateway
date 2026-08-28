import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Render,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  CurrentAdmin,
  type AuthenticatedAdmin,
} from '../../common/decorators/current-admin.decorator';
import type { RequestWithId } from '../../common/interceptors/request-id.middleware';
import { ProjectsService } from '../../projects/projects.service';
import { WhatsappAccountsService } from '../../whatsapp-accounts/whatsapp-accounts.service';
import { CreateWhatsappAccountDto } from '../../whatsapp-accounts/dto/create-whatsapp-account.dto';
import { SwitchAccountModeDto } from '../../whatsapp-accounts/dto/switch-account-mode.dto';
import { CsrfFormDto } from '../../common/dto/csrf-form.dto';
import { baseView, type BaseViewModel } from '../view-helpers';

@Controller('projects/:projectId/accounts')
export class ProjectAccountsController {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly accountsService: WhatsappAccountsService,
  ) {}

  @Get('new')
  @HttpCode(HttpStatus.SEE_OTHER)
  async newPage(@Param('projectId') projectId: string, @Res() res: Response): Promise<void> {
    await this.projectsService.getById(projectId);
    res.redirect(303, `/projects/${projectId}#create-account`);
  }

  @Post()
  @HttpCode(HttpStatus.SEE_OTHER)
  async create(
    @Param('projectId') projectId: string,
    @Body() dto: CreateWhatsappAccountDto,
    @Res() res: Response,
  ): Promise<void> {
    const account = await this.accountsService.createForProject(projectId, dto.label, dto.mode);
    res.redirect(303, `/projects/${projectId}/accounts/${account.id}`);
  }

  @Get(':accountId')
  @Render('dashboard/accounts-detail')
  async detail(
    @Req() req: Request,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Param('projectId') projectId: string,
    @Param('accountId') accountId: string,
  ): Promise<
    BaseViewModel & {
      projectId: string;
      account: unknown;
      recentLogs: unknown;
      active: 'projects';
      modeError?: boolean;
    }
  > {
    const account = await this.accountsService.getByIdForProject(projectId, accountId);
    const refreshed = await this.accountsService.refreshStatus(account);
    const recentLogs = await this.accountsService.listRecentLogs(projectId, accountId);
    const modeError = req.query.modeError === 'waha_config';
    return {
      ...baseView(req, admin, account.label),
      projectId,
      account: { ...account, ...refreshed },
      recentLogs,
      active: 'projects',
      modeError,
    };
  }

  @Post(':accountId/switch-mode')
  @HttpCode(HttpStatus.SEE_OTHER)
  async switchMode(
    @Param('projectId') projectId: string,
    @Param('accountId') accountId: string,
    @Body() dto: SwitchAccountModeDto,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.accountsService.switchModeForProject(projectId, accountId, dto.mode);
    const suffix = result.applied ? '' : '?modeError=waha_config';
    res.redirect(303, `/projects/${projectId}/accounts/${accountId}${suffix}`);
  }

  @Get(':accountId/qr')
  @Render('dashboard/accounts-qr')
  async qrPage(
    @Req() req: Request,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Param('projectId') projectId: string,
    @Param('accountId') accountId: string,
  ): Promise<
    BaseViewModel & {
      projectId: string;
      account: unknown;
      qrDataUrl: string | null;
      qrError: string | null;
      qrErrorCode: string | null;
      active: 'projects';
    }
  > {
    const account = await this.accountsService.getByIdForProject(projectId, accountId);
    await this.accountsService.startOrEnsureSession(account);
    const refreshed = await this.accountsService.refreshStatus(account);
    const requestId = (req as RequestWithId).requestId;
    const qr = await this.accountsService.getQrForPage(refreshed, requestId);
    return {
      ...baseView(req, admin, `${account.label} — QR`),
      projectId,
      account: refreshed,
      qrDataUrl: qr.dataUrl,
      qrError: qr.errorSummary,
      qrErrorCode: qr.errorCode,
      active: 'projects',
    };
  }

  @Get(':accountId/status.json')
  async status(
    @Param('projectId') projectId: string,
    @Param('accountId') accountId: string,
  ): Promise<{ status: string; phoneNumber: string | null }> {
    const account = await this.accountsService.getByIdForProject(projectId, accountId);
    const refreshed = await this.accountsService.refreshStatus(account);
    return { status: refreshed.status, phoneNumber: refreshed.phoneNumber };
  }

  @Get(':accountId/qr.json')
  async qrJson(
    @Req() req: Request,
    @Param('projectId') projectId: string,
    @Param('accountId') accountId: string,
  ): Promise<{
    status: string;
    phoneNumber: string | null;
    label: string;
    qrDataUrl: string | null;
    qrError: string | null;
    qrErrorCode: string | null;
  }> {
    const account = await this.accountsService.getByIdForProject(projectId, accountId);
    await this.accountsService.startOrEnsureSession(account);
    const refreshed = await this.accountsService.refreshStatus(account);
    const requestId = (req as RequestWithId).requestId;
    const qr = await this.accountsService.getQrForPage(refreshed, requestId);
    return {
      status: refreshed.status,
      phoneNumber: refreshed.phoneNumber,
      label: refreshed.label,
      qrDataUrl: qr.dataUrl,
      qrError: qr.errorSummary,
      qrErrorCode: qr.errorCode,
    };
  }

  @Post(':accountId/restart')
  @HttpCode(HttpStatus.SEE_OTHER)
  async restart(
    @Param('projectId') projectId: string,
    @Param('accountId') accountId: string,
    @Body() _dto: CsrfFormDto,
    @Res() res: Response,
  ): Promise<void> {
    const account = await this.accountsService.getByIdForProject(projectId, accountId);
    await this.accountsService.restart(account);
    res.redirect(303, `/projects/${projectId}/accounts/${accountId}/qr`);
  }

  @Post(':accountId/stop')
  @HttpCode(HttpStatus.SEE_OTHER)
  async stop(
    @Param('projectId') projectId: string,
    @Param('accountId') accountId: string,
    @Body() _dto: CsrfFormDto,
    @Res() res: Response,
  ): Promise<void> {
    const account = await this.accountsService.getByIdForProject(projectId, accountId);
    await this.accountsService.stopSession(account);
    res.redirect(303, `/projects/${projectId}/accounts/${accountId}`);
  }

  @Post(':accountId/unlink')
  @HttpCode(HttpStatus.SEE_OTHER)
  async unlink(
    @Param('projectId') projectId: string,
    @Param('accountId') accountId: string,
    @Body() _dto: CsrfFormDto,
    @Res() res: Response,
  ): Promise<void> {
    const account = await this.accountsService.getByIdForProject(projectId, accountId);
    await this.accountsService.unlink(account);
    res.redirect(303, `/projects/${projectId}/accounts/${accountId}`);
  }

  @Post(':accountId/activate')
  @HttpCode(HttpStatus.SEE_OTHER)
  async activate(
    @Param('projectId') projectId: string,
    @Param('accountId') accountId: string,
    @Body() _dto: CsrfFormDto,
    @Res() res: Response,
  ): Promise<void> {
    await this.accountsService.setActiveForProject(projectId, accountId, true);
    res.redirect(303, `/projects/${projectId}#accounts`);
  }

  @Post(':accountId/deactivate')
  @HttpCode(HttpStatus.SEE_OTHER)
  async deactivate(
    @Param('projectId') projectId: string,
    @Param('accountId') accountId: string,
    @Body() _dto: CsrfFormDto,
    @Res() res: Response,
  ): Promise<void> {
    await this.accountsService.setActiveForProject(projectId, accountId, false);
    res.redirect(303, `/projects/${projectId}#accounts`);
  }
}
