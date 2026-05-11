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
import { Role } from '@prisma/client';
import type { Request, Response } from 'express';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';
import { ApiTokensService } from '../../api-tokens/api-tokens.service';
import { CreateTokenDto } from '../../api-tokens/dto/create-token.dto';
import { baseView, type BaseViewModel } from '../view-helpers';

@Controller('tokens')
@Roles(Role.ADMIN)
export class TokensDashboardController {
  constructor(private readonly tokensService: ApiTokensService) {}

  @Get()
  @Render('dashboard/tokens-list')
  async list(
    @Req() req: Request,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<BaseViewModel & { tokens: unknown; revealed?: string; active: 'tokens' }> {
    const tokens = await this.tokensService.listAll();
    const query = req.query as Record<string, string | undefined>;
    const revealed = query.revealed ? decodeURIComponent(query.revealed) : undefined;
    return { ...baseView(req, user, 'API tokens'), tokens, revealed, active: 'tokens' };
  }

  @Post(':accountId/create')
  @HttpCode(HttpStatus.SEE_OTHER)
  @Throttle({ default: { ttl: 3_600_000, limit: 3 } })
  async create(
    @Param('accountId') accountId: string,
    @Body() dto: CreateTokenDto,
    @Res() res: Response,
  ): Promise<void> {
    const issued = await this.tokensService.create(accountId, dto.name);
    res.redirect(303, `/tokens?revealed=${encodeURIComponent(issued.raw)}&id=${issued.id}`);
  }

  @Post(':id/revoke')
  @HttpCode(HttpStatus.SEE_OTHER)
  async revoke(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    await this.tokensService.revoke(id, actor);
    res.redirect(303, '/tokens');
  }

  @Post(':id/regenerate')
  @HttpCode(HttpStatus.SEE_OTHER)
  @Throttle({ default: { ttl: 3_600_000, limit: 3 } })
  async regenerate(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const issued = await this.tokensService.regenerate(id, actor);
    res.redirect(303, `/tokens?revealed=${encodeURIComponent(issued.raw)}&id=${issued.id}`);
  }
}
