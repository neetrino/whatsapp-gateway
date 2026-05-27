import {
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
import { Role } from '@prisma/client';
import type { Request, Response } from 'express';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';
import type { RequestWithId } from '../../common/interceptors/request-id.middleware';
import { WhatsappAccountsService } from '../../whatsapp-accounts/whatsapp-accounts.service';
import { baseView, type BaseViewModel } from '../view-helpers';

@Controller('accounts')
@Roles(Role.ADMIN)
export class AccountsDashboardController {
  constructor(private readonly accountsService: WhatsappAccountsService) {}

  @Get()
  @Render('dashboard/accounts-list')
  async list(
    @Req() req: Request,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<BaseViewModel & { accounts: unknown; active: 'accounts' }> {
    const accounts = await this.accountsService.listAll();
    return { ...baseView(req, user, 'WhatsApp accounts'), accounts, active: 'accounts' };
  }

  @Get(':id')
  @Render('dashboard/accounts-detail')
  async detail(
    @Req() req: Request,
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<BaseViewModel & { account: unknown; active: 'accounts' }> {
    const account = await this.accountsService.getByIdForActor(id, actor);
    const refreshed = await this.accountsService.refreshStatus(account);
    return {
      ...baseView(req, actor, account.label),
      account: { ...account, ...refreshed },
      active: 'accounts',
    };
  }

  @Get(':id/qr')
  @Render('dashboard/accounts-qr')
  async qrPage(
    @Req() req: Request,
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<
    BaseViewModel & {
      account: unknown;
      qrDataUrl: string | null;
      qrError: string | null;
      qrErrorCode: string | null;
      active: 'accounts';
    }
  > {
    const account = await this.accountsService.getByIdForActor(id, actor);
    await this.accountsService.startOrEnsureSession(account);
    const refreshed = await this.accountsService.refreshStatus(account);
    const requestId = (req as RequestWithId).requestId;
    const qr = await this.accountsService.getQrForPage(refreshed, requestId);
    return {
      ...baseView(req, actor, `${account.label} — QR`),
      account: refreshed,
      qrDataUrl: qr.dataUrl,
      qrError: qr.errorSummary,
      qrErrorCode: qr.errorCode,
      active: 'accounts',
    };
  }

  @Get(':id/status.json')
  async status(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<{ status: string; phoneNumber: string | null }> {
    const account = await this.accountsService.getByIdForActor(id, actor);
    const refreshed = await this.accountsService.refreshStatus(account);
    return { status: refreshed.status, phoneNumber: refreshed.phoneNumber };
  }

  @Post(':id/restart')
  @HttpCode(HttpStatus.SEE_OTHER)
  async restart(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const account = await this.accountsService.getByIdForActor(id, actor);
    await this.accountsService.restart(account);
    res.redirect(303, `/accounts/${id}/qr`);
  }

  @Post(':id/unlink')
  @HttpCode(HttpStatus.SEE_OTHER)
  async unlink(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const account = await this.accountsService.getByIdForActor(id, actor);
    await this.accountsService.unlink(account);
    res.redirect(303, `/accounts/${id}`);
  }

  @Post(':id/stop')
  @HttpCode(HttpStatus.SEE_OTHER)
  async stop(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const account = await this.accountsService.getByIdForActor(id, actor);
    await this.accountsService.stopSession(account);
    res.redirect(303, `/accounts/${id}`);
  }
}
