import { Module } from '@nestjs/common';
import { ApiTokensService } from './api-tokens.service';

@Module({
  providers: [ApiTokensService],
  exports: [ApiTokensService],
})
export class ApiTokensModule {}
