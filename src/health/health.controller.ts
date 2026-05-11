import { Controller, Get } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { HealthService } from './health.service';

@Controller()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Public()
  @Get('health')
  async check(): Promise<{
    success: true;
    data: { gateway: string; database: string; waha: string };
  }> {
    const data = await this.healthService.check();
    return { success: true, data };
  }
}
