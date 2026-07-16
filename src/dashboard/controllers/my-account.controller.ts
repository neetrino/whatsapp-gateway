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
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';
import type { RequestWithId } from '../../common/interceptors/request-id.middleware';
import { WhatsappAccountsService } from '../../whatsapp-accounts/whatsapp-accounts.service';
import { ApiTokensService } from '../../api-tokens/api-tokens.service';
import { CreateTokenDto } from '../../api-tokens/dto/create-token.dto';
import { CreateWhatsappAccountDto } from '../../whatsapp-accounts/dto/create-whatsapp-account.dto';
import { baseView, type BaseViewModel } from '../view-helpers';

@Controller('me')
export class MyAccountController {
  constructor(
    private readonly accountsService: WhatsappAccountsService,
    private readonly tokensService: ApiTokensService,
  ) {}

  @Get()
  @Render('dashboard/my-accounts-list')
  async list(
    @Req() req: Request,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<BaseViewModel & { accounts: unknown; active: 'me' }> {
    const accounts = await this.accountsService.listForUser(user.id);
    return { ...baseView(req, user, 'My WhatsApp accounts'), accounts, active: 'me' };
  }

  @Post('accounts')
  @HttpCode(HttpStatus.SEE_OTHER)
  async createAccount(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateWhatsappAccountDto,
    @Res() res: Response,
  ): Promise<void> {
    const created = await this.accountsService.createForUser(user.id, dto.label);
    res.redirect(303, `/me/accounts/${created.id}/qr`);
  }

  @Get('accounts/:id')
  @Render('dashboard/my-account')
  async detail(
    @Req() req: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<
    BaseViewModel & { account: unknown; tokens: unknown; revealed?: string; active: 'me' }
  > {
    const account = await this.accountsService.getByIdForActor(id, user);
    const refreshed = await this.accountsService.refreshStatus(account);
    const tokens = await this.tokensService.listForAccount(account.id);
    const query = req.query as Record<string, string | undefined>;
    const revealed = query.revealed ? decodeURIComponent(query.revealed) : undefined;
    return {
      ...baseView(req, user, account.label),
      account: refreshed,
      tokens,
      revealed,
      active: 'me',
    };
  }

  @Get('accounts/:id/qr')
  @Render('dashboard/my-qr')
  async qr(
    @Req() req: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<
    BaseViewModel & {
      account: unknown;
      qrDataUrl: string | null;
      qrError: string | null;
      qrErrorCode: string | null;
      active: 'me';
    }
  > {
    const account = await this.accountsService.getByIdForActor(id, user);
    await this.accountsService.startOrEnsureSession(account);
    const refreshed = await this.accountsService.refreshStatus(account);
    const requestId = (req as RequestWithId).requestId;
    const qr = await this.accountsService.getQrForPage(refreshed, requestId);
    return {
      ...baseView(req, user, `${account.label} — QR`),
      account: refreshed,
      qrDataUrl: qr.dataUrl,
      qrError: qr.errorSummary,
      qrErrorCode: qr.errorCode,
      active: 'me',
    };
  }

  @Get('accounts/:id/status.json')
  async status(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<{ status: string; phoneNumber: string | null }> {
    const account = await this.accountsService.getByIdForActor(id, user);
    const refreshed = await this.accountsService.refreshStatus(account);
    return { status: refreshed.status, phoneNumber: refreshed.phoneNumber };
  }

  @Post('accounts/:id/restart')
  @HttpCode(HttpStatus.SEE_OTHER)
  async restart(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const account = await this.accountsService.getByIdForActor(id, user);
    await this.accountsService.restart(account);
    res.redirect(303, `/me/accounts/${id}/qr`);
  }

  @Post('accounts/:id/unlink')
  @HttpCode(HttpStatus.SEE_OTHER)
  async unlink(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const account = await this.accountsService.getByIdForActor(id, user);
    await this.accountsService.unlink(account);
    res.redirect(303, `/me/accounts/${id}`);
  }

  @Post('accounts/:id/stop')
  @HttpCode(HttpStatus.SEE_OTHER)
  async stop(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const account = await this.accountsService.getByIdForActor(id, user);
    await this.accountsService.stopSession(account);
    res.redirect(303, `/me/accounts/${id}`);
  }

  @Post('accounts/:id/tokens')
  @HttpCode(HttpStatus.SEE_OTHER)
  @Throttle({ default: { ttl: 3_600_000, limit: 3 } })
  async createToken(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreateTokenDto,
    @Res() res: Response,
  ): Promise<void> {
    const account = await this.accountsService.getByIdForActor(id, user);
    const issued = await this.tokensService.create(account.id, dto.name);
    res.redirect(303, `/me/accounts/${id}?revealed=${encodeURIComponent(issued.raw)}`);
  }

  @Post('accounts/:id/tokens/:tokenId/revoke')
  @HttpCode(HttpStatus.SEE_OTHER)
  async revokeToken(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('tokenId') tokenId: string,
    @Res() res: Response,
  ): Promise<void> {
    await this.accountsService.getByIdForActor(id, user);
    await this.tokensService.revoke(tokenId, user);
    res.redirect(303, `/me/accounts/${id}`);
  }

  @Post('accounts/:id/tokens/:tokenId/regenerate')
  @HttpCode(HttpStatus.SEE_OTHER)
  @Throttle({ default: { ttl: 3_600_000, limit: 3 } })
  async regenerate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('tokenId') tokenId: string,
    @Res() res: Response,
  ): Promise<void> {
    await this.accountsService.getByIdForActor(id, user);
    const issued = await this.tokensService.regenerate(tokenId, user);
    res.redirect(303, `/me/accounts/${id}?revealed=${encodeURIComponent(issued.raw)}`);
  }
}
