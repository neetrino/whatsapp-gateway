import { Controller, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { WahaInboundService } from './waha-inbound.service';

type RawBodyRequest = Request & { rawBody?: Buffer };

@Controller('internal/waha')
@Public()
export class WahaInboundController {
  constructor(private readonly inboundService: WahaInboundService) {}

  @Post('events')
  @SkipThrottle()
  @HttpCode(HttpStatus.OK)
  async receive(@Req() req: RawBodyRequest): Promise<{ received: true }> {
    const rawBody = req.rawBody ?? Buffer.alloc(0);
    const headers = {
      hmac: req.header('x-webhook-hmac') ?? undefined,
      hmacAlgorithm: req.header('x-webhook-hmac-algorithm') ?? undefined,
      requestId: req.header('x-webhook-request-id') ?? undefined,
      timestamp: req.header('x-webhook-timestamp') ?? undefined,
    };
    this.inboundService.verifyRequest(rawBody, headers);
    await this.inboundService.handleEvent(rawBody, headers);
    return { received: true };
  }
}
