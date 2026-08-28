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
  CurrentAdmin,
  type AuthenticatedAdmin,
} from '../../common/decorators/current-admin.decorator';
import { ProjectsService } from '../../projects/projects.service';
import { ApiTokensService } from '../../api-tokens/api-tokens.service';
import { WhatsappAccountsService } from '../../whatsapp-accounts/whatsapp-accounts.service';
import { AuthService } from '../../auth/auth.service';
import { CreateProjectDto } from '../../projects/dto/create-project.dto';
import { UpdateProjectDto } from '../../projects/dto/update-project.dto';
import { CreateTokenDto } from '../../api-tokens/dto/create-token.dto';
import { UpdateProjectWebhookDto } from '../../projects/dto/update-project-webhook.dto';
import { ProjectWebhooksService } from '../../projects/project-webhooks.service';
import { ProjectWebhookDeliveryService } from '../../webhooks/project-webhook-delivery.service';
import { CsrfFormDto } from '../../common/dto/csrf-form.dto';
import { consumeTokenRevealCookie, setTokenRevealCookie } from '../../auth/token-reveal';
import {
  consumeWebhookRevealCookie,
  setWebhookRevealCookie,
} from '../../webhooks/webhook-reveal';
import { baseView, type BaseViewModel } from '../view-helpers';

@Controller('projects')
export class ProjectsDashboardController {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly tokensService: ApiTokensService,
    private readonly accountsService: WhatsappAccountsService,
    private readonly authService: AuthService,
    private readonly webhookDeliveryService: ProjectWebhookDeliveryService,
    private readonly projectWebhooksService: ProjectWebhooksService,
  ) {}

  @Get()
  @Render('dashboard/projects-list')
  async list(
    @Req() req: Request,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ): Promise<BaseViewModel & { projects: unknown; active: 'projects' }> {
    const projects = await this.projectsService.list();
    return { ...baseView(req, admin, 'Projects'), projects, active: 'projects' };
  }

  @Get('new')
  @Render('dashboard/projects-new')
  newPage(
    @Req() req: Request,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ): BaseViewModel & { active: 'projects' } {
    return { ...baseView(req, admin, 'New project'), active: 'projects' };
  }

  @Post()
  @HttpCode(HttpStatus.SEE_OTHER)
  async create(@Body() dto: CreateProjectDto, @Res() res: Response): Promise<void> {
    const created = await this.projectsService.create(dto.name, dto.slug);
    res.redirect(303, `/projects/${created.id}`);
  }

  @Get(':id')
  @Render('dashboard/projects-detail')
  async detail(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Param('id') id: string,
  ): Promise<
    BaseViewModel & {
      project: unknown;
      tokens: unknown;
      accounts: unknown;
      revealed?: string;
      revealedWebhook?: string;
      accountAmbiguous: boolean;
      webhookStats: unknown;
      active: 'projects';
    }
  > {
    const project = await this.projectsService.getById(id);
    const [tokens, accounts, webhookStats] = await Promise.all([
      this.tokensService.listForProject(id),
      this.accountsService.listForProject(id),
      this.webhookDeliveryService.getDeliveryStats(id),
    ]);
    const revealed = consumeTokenRevealCookie(
      req,
      res,
      this.authService.secureCookies(),
      id,
    );
    const revealedWebhook = consumeWebhookRevealCookie(
      req,
      res,
      this.authService.secureCookies(),
      id,
    );
    const activeAccountCount = accounts.filter((account) => account.isActive).length;
    return {
      ...baseView(req, admin, project.name),
      project,
      tokens,
      accounts,
      revealed,
      revealedWebhook,
      accountAmbiguous: activeAccountCount > 1,
      webhookStats,
      active: 'projects',
    };
  }

  @Post(':id/webhook')
  @HttpCode(HttpStatus.SEE_OTHER)
  async updateWebhook(
    @Param('id') id: string,
    @Body() dto: UpdateProjectWebhookDto,
    @Res() res: Response,
  ): Promise<void> {
    await this.projectsService.updateWebhookSettings(id, {
      webhookUrl: dto.webhookUrl,
      webhookEnabled: dto.webhookEnabled,
    });
    res.redirect(303, `/projects/${id}`);
  }

  @Post(':id/webhook/regenerate')
  @HttpCode(HttpStatus.SEE_OTHER)
  @Throttle({ default: { ttl: 3_600_000, limit: 100 } })
  async regenerateWebhookSecret(
    @Param('id') id: string,
    @Body() _dto: CsrfFormDto,
    @Res() res: Response,
  ): Promise<void> {
    const generated = await this.projectWebhooksService.regenerateSecret(id);
    setWebhookRevealCookie(
      res,
      { projectId: id, signingKey: generated.signingKey },
      this.authService.secureCookies(),
    );
    res.redirect(303, `/projects/${id}`);
  }

  @Post(':id/update')
  @HttpCode(HttpStatus.SEE_OTHER)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateProjectDto,
    @Res() res: Response,
  ): Promise<void> {
    await this.projectsService.update(id, { name: dto.name, slug: dto.slug });
    res.redirect(303, `/projects/${id}`);
  }

  @Post(':id/activate')
  @HttpCode(HttpStatus.SEE_OTHER)
  async activate(
    @Param('id') id: string,
    @Body() _dto: CsrfFormDto,
    @Res() res: Response,
  ): Promise<void> {
    await this.projectsService.setActive(id, true);
    res.redirect(303, `/projects/${id}`);
  }

  @Post(':id/deactivate')
  @HttpCode(HttpStatus.SEE_OTHER)
  async deactivate(
    @Param('id') id: string,
    @Body() _dto: CsrfFormDto,
    @Res() res: Response,
  ): Promise<void> {
    await this.projectsService.setActive(id, false);
    res.redirect(303, `/projects/${id}`);
  }

  @Post(':id/tokens')
  @HttpCode(HttpStatus.SEE_OTHER)
  @Throttle({ default: { ttl: 3_600_000, limit: 100 } })
  async createToken(
    @Param('id') id: string,
    @Body() dto: CreateTokenDto,
    @Res() res: Response,
  ): Promise<void> {
    await this.projectsService.getById(id);
    const issued = await this.tokensService.create(id, dto.name);
    setTokenRevealCookie(
      res,
      { projectId: id, raw: issued.raw },
      this.authService.secureCookies(),
    );
    res.redirect(303, `/projects/${id}`);
  }

  @Post(':id/tokens/:tokenId/revoke')
  @HttpCode(HttpStatus.SEE_OTHER)
  async revokeToken(
    @Param('id') id: string,
    @Param('tokenId') tokenId: string,
    @Body() _dto: CsrfFormDto,
    @Res() res: Response,
  ): Promise<void> {
    await this.tokensService.revoke(id, tokenId);
    res.redirect(303, `/projects/${id}`);
  }

  @Post(':id/tokens/:tokenId/restore')
  @HttpCode(HttpStatus.SEE_OTHER)
  async restoreToken(
    @Param('id') id: string,
    @Param('tokenId') tokenId: string,
    @Body() _dto: CsrfFormDto,
    @Res() res: Response,
  ): Promise<void> {
    await this.tokensService.restore(id, tokenId);
    res.redirect(303, `/projects/${id}`);
  }

  @Post(':id/tokens/:tokenId/regenerate')
  @HttpCode(HttpStatus.SEE_OTHER)
  @Throttle({ default: { ttl: 3_600_000, limit: 100 } })
  async regenerateToken(
    @Param('id') id: string,
    @Param('tokenId') tokenId: string,
    @Body() _dto: CsrfFormDto,
    @Res() res: Response,
  ): Promise<void> {
    const issued = await this.tokensService.regenerate(id, tokenId);
    setTokenRevealCookie(
      res,
      { projectId: id, raw: issued.raw },
      this.authService.secureCookies(),
    );
    res.redirect(303, `/projects/${id}`);
  }
}
