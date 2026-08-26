import { Module } from '@nestjs/common';
import { WahaInboundController } from './waha-inbound.controller';
import { WahaInboundService } from './waha-inbound.service';
import { ProjectWebhookDeliveryService } from './project-webhook-delivery.service';

@Module({
  controllers: [WahaInboundController],
  providers: [WahaInboundService, ProjectWebhookDeliveryService],
  exports: [ProjectWebhookDeliveryService],
})
export class WebhooksModule {}
