import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WahaClient } from '../waha/waha.client';

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly wahaClient: WahaClient,
  ) {}

  async check(): Promise<{ gateway: string; database: string; waha: string }> {
    const [database, waha] = await Promise.all([this.checkDatabase(), this.checkWaha()]);
    return { gateway: 'ok', database, waha };
  }

  private async checkDatabase(): Promise<string> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return 'ok';
    } catch (error) {
      this.logger.warn({ msg: 'database_health_failed', error: this.errorMessage(error) });
      return 'unavailable';
    }
  }

  private async checkWaha(): Promise<string> {
    try {
      const ok = await this.wahaClient.healthCheck();
      return ok ? 'ok' : 'unavailable';
    } catch (error) {
      this.logger.warn({ msg: 'waha_health_failed', error: this.errorMessage(error) });
      return 'unavailable';
    }
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'unknown';
  }
}
