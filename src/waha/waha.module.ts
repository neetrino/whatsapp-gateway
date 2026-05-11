import { Module } from '@nestjs/common';
import { WahaClient } from './waha.client';
import { WahaService } from './waha.service';

@Module({
  providers: [WahaClient, WahaService],
  exports: [WahaClient, WahaService],
})
export class WahaModule {}
