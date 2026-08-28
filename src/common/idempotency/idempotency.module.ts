import { Global, Module } from '@nestjs/common';
import { IdempotencyCleanupService } from './idempotency-cleanup.service';
import { IdempotencyStore } from './idempotency.store';

@Global()
@Module({
  providers: [IdempotencyStore, IdempotencyCleanupService],
  exports: [IdempotencyStore],
})
export class IdempotencyModule {}
