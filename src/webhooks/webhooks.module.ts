import { Module } from '@nestjs/common';
import { WahaInboundController } from './waha-inbound.controller';
import { WahaInboundService } from './waha-inbound.service';
import { ProjectWebhookFanoutService } from './project-webhook-fanout.service';

@Module({
  controllers: [WahaInboundController],
  providers: [WahaInboundService, ProjectWebhookFanoutService],
  exports: [ProjectWebhookFanoutService],
})
export class WebhooksModule {}
