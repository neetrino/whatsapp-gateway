import { Controller, Get, HttpStatus, Req, Res } from '@nestjs/common';
import { SessionStatus } from '@prisma/client';
import type { Request, Response } from 'express';
import {
  CurrentAdmin,
  type AuthenticatedAdmin,
} from '../../common/decorators/current-admin.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { HealthService } from '../../health/health.service';
import { baseView, type BaseViewModel } from '../view-helpers';

interface OverviewView extends BaseViewModel {
  totalProjects: number;
  activeProjects: number;
  totalAccounts: number;
  connectedAccounts: number;
  qrRequiredAccounts: number;
  health: { gateway: string; database: string; waha: string };
  active: 'overview';
}

@Controller()
export class OverviewController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly healthService: HealthService,
  ) {}

  @Get('dashboard')
  async overview(
    @Req() req: Request,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Res() res: Response,
  ): Promise<void> {
    const [totalProjects, activeProjects, totalAccounts, connected, qrRequired, health] =
      await Promise.all([
        this.prisma.project.count(),
        this.prisma.project.count({ where: { isActive: true } }),
        this.prisma.whatsappAccount.count(),
        this.prisma.whatsappAccount.count({ where: { status: SessionStatus.CONNECTED } }),
        this.prisma.whatsappAccount.count({ where: { status: SessionStatus.QR_REQUIRED } }),
        this.healthService.check(),
      ]);

    const view: OverviewView = {
      ...baseView(req, admin, 'Dashboard'),
      totalProjects,
      activeProjects,
      totalAccounts,
      connectedAccounts: connected,
      qrRequiredAccounts: qrRequired,
      health,
      active: 'overview',
    };
    res.status(HttpStatus.OK).render('dashboard/overview', view);
  }
}
