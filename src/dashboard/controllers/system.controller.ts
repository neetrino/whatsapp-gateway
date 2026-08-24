import { Controller, Get, Req, Render } from '@nestjs/common';
import type { Request } from 'express';
import {
  CurrentAdmin,
  type AuthenticatedAdmin,
} from '../../common/decorators/current-admin.decorator';
import { HealthService } from '../../health/health.service';
import { baseView, type BaseViewModel } from '../view-helpers';

interface SystemView extends BaseViewModel {
  health: { gateway: string; database: string; waha: string };
  active: 'system';
}

@Controller('system')
export class SystemController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @Render('dashboard/system')
  async system(
    @Req() req: Request,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ): Promise<SystemView> {
    const health = await this.healthService.check();
    return { ...baseView(req, admin, 'System / Health'), health, active: 'system' };
  }
}
