import { Controller, Get, HttpStatus, Req, Res } from '@nestjs/common';
import { Role, SessionStatus } from '@prisma/client';
import type { Request, Response } from 'express';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { HealthService } from '../../health/health.service';
import { baseView, type BaseViewModel } from '../view-helpers';

interface OverviewView extends BaseViewModel {
  totalUsers: number;
  activeUsers: number;
  connectedAccounts: number;
  disconnectedAccounts: number;
  qrRequiredAccounts: number;
  health: { gateway: string; database: string; waha: string };
  active: 'overview';
}

@Controller()
@Roles(Role.ADMIN, Role.USER)
export class OverviewController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly healthService: HealthService,
  ) {}

  @Get('dashboard')
  async overview(
    @Req() req: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ): Promise<void> {
    if (user.role === Role.USER) {
      res.redirect(HttpStatus.FOUND, '/me');
      return;
    }

    const [totalUsers, activeUsers, connected, disconnected, qrRequired, health] =
      await Promise.all([
        this.prisma.user.count(),
        this.prisma.user.count({ where: { isActive: true } }),
        this.prisma.whatsappAccount.count({ where: { status: SessionStatus.CONNECTED } }),
        this.prisma.whatsappAccount.count({ where: { status: SessionStatus.DISCONNECTED } }),
        this.prisma.whatsappAccount.count({ where: { status: SessionStatus.QR_REQUIRED } }),
        this.healthService.check(),
      ]);

    const view: OverviewView = {
      ...baseView(req, user, 'Overview'),
      totalUsers,
      activeUsers,
      connectedAccounts: connected,
      disconnectedAccounts: disconnected,
      qrRequiredAccounts: qrRequired,
      health,
      active: 'overview',
    };
    res.status(HttpStatus.OK).render('dashboard/overview', view);
  }
}
