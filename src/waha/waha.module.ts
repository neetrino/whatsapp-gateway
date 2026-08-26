import { Module } from '@nestjs/common';
import { WahaClient } from './waha.client';
import { WahaService } from './waha.service';

import { AccountModePolicyService } from './account-mode-policy.service';

@Module({
  providers: [WahaClient, WahaService, AccountModePolicyService],
  exports: [WahaClient, WahaService, AccountModePolicyService],
})
export class WahaModule {}
