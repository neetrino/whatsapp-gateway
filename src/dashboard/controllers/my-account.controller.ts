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
import { baseView, type BaseViewModel } from '../view-helpers';

@Controller('me')
export class MyAccountController {
  constructor(
    private readonly accountsService: WhatsappAccountsService,
    private readonly tokensService: ApiTokensService,
  ) {}

  @Get()
  @Render('dashboard/my-account')
  async myAccount(
    @Req() req: Request,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<
    BaseViewModel & { account: unknown; tokens: unknown; revealed?: string; active: 'me' }
  > {
    const account = await this.accountsService.getOwnByUserId(user.id);
    const refreshed = await this.accountsService.refreshStatus(account);
    const tokens = await this.tokensService.listForAccount(account.id);
    const query = req.query as Record<string, string | undefined>;
    const revealed = query.revealed ? decodeURIComponent(query.revealed) : undefined;
    return {
      ...baseView(req, user, 'My WhatsApp'),
      account: refreshed,
      tokens,
      revealed,
      active: 'me',
    };
  }

  @Get('qr')
  @Render('dashboard/my-qr')
  async qr(
    @Req() req: Request,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<
    BaseViewModel & {
      account: unknown;
      qrDataUrl: string | null;
      qrError: string | null;
      qrErrorCode: string | null;
      active: 'me';
    }
  > {
    const account = await this.accountsService.getOwnByUserId(user.id);
    await this.accountsService.startOrEnsureSession(account);
    const refreshed = await this.accountsService.refreshStatus(account);
    const requestId = (req as RequestWithId).requestId;
    const qr = await this.accountsService.getQrForPage(refreshed, requestId);
    return {
      ...baseView(req, user, 'My WhatsApp QR'),
      account: refreshed,
      qrDataUrl: qr.dataUrl,
      qrError: qr.errorSummary,
      qrErrorCode: qr.errorCode,
      active: 'me',
    };
  }

  @Get('status.json')
  async status(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ status: string; phoneNumber: string | null }> {
    const account = await this.accountsService.getOwnByUserId(user.id);
    const refreshed = await this.accountsService.refreshStatus(account);
    return { status: refreshed.status, phoneNumber: refreshed.phoneNumber };
  }

  @Post('restart')
  @HttpCode(HttpStatus.SEE_OTHER)
  async restart(@CurrentUser() user: AuthenticatedUser, @Res() res: Response): Promise<void> {
    const account = await this.accountsService.getOwnByUserId(user.id);
    await this.accountsService.restart(account);
    res.redirect(303, '/me/qr');
  }

  /** Fully unlinks WhatsApp from this Gateway account (WAHA logout). */
  @Post('unlink')
  @HttpCode(HttpStatus.SEE_OTHER)
  async unlink(@CurrentUser() user: AuthenticatedUser, @Res() res: Response): Promise<void> {
    const account = await this.accountsService.getOwnByUserId(user.id);
    await this.accountsService.unlink(account);
    res.redirect(303, '/me');
  }

  /** Temporarily stops WAHA session without unlinking auth state. */
  @Post('stop')
  @HttpCode(HttpStatus.SEE_OTHER)
  async stop(@CurrentUser() user: AuthenticatedUser, @Res() res: Response): Promise<void> {
    const account = await this.accountsService.getOwnByUserId(user.id);
    await this.accountsService.stopSession(account);
    res.redirect(303, '/me');
  }

  @Post('tokens')
  @HttpCode(HttpStatus.SEE_OTHER)
  @Throttle({ default: { ttl: 3_600_000, limit: 3 } })
  async createToken(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateTokenDto,
    @Res() res: Response,
  ): Promise<void> {
    const account = await this.accountsService.getOwnByUserId(user.id);
    const issued = await this.tokensService.create(account.id, dto.name);
    res.redirect(303, `/me?revealed=${encodeURIComponent(issued.raw)}`);
  }

  @Post('tokens/:id/revoke')
  @HttpCode(HttpStatus.SEE_OTHER)
  async revokeToken(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    await this.tokensService.revoke(id, user);
    res.redirect(303, '/me');
  }

  @Post('tokens/:id/regenerate')
  @HttpCode(HttpStatus.SEE_OTHER)
  @Throttle({ default: { ttl: 3_600_000, limit: 3 } })
  async regenerate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const issued = await this.tokensService.regenerate(id, user);
    res.redirect(303, `/me?revealed=${encodeURIComponent(issued.raw)}`);
  }
}
