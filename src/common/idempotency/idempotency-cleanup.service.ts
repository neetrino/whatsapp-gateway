import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { NodeEnv } from '../../config/env.validation';
import { IDEMPOTENCY_CLEANUP_INTERVAL_MS } from './idempotency.constants';
import { IdempotencyStore } from './idempotency.store';

@Injectable()
export class IdempotencyCleanupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IdempotencyCleanupService.name);
  private timer: NodeJS.Timeout | undefined;

  constructor(private readonly store: IdempotencyStore) {}

  async onModuleInit(): Promise<void> {
    if (process.env.NODE_ENV === NodeEnv.Test) return;
    await this.sweep();
    this.timer = setInterval(() => {
      void this.sweep();
    }, IDEMPOTENCY_CLEANUP_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async sweep(): Promise<void> {
    try {
      const removed = await this.store.purgeExpired();
      if (removed > 0) {
        this.logger.log({ msg: 'idempotency_expired_purged', removed });
      }
    } catch (error) {
      this.logger.warn({
        msg: 'idempotency_purge_failed',
        error: error instanceof Error ? error.message : 'unknown',
      });
    }
  }
}
