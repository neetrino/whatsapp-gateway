import { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvironmentVariables } from './env.validation';
import { BoundedThrottlerStorage } from '../common/throttling/bounded-throttler.storage';
import {
  classifyV1Throttle,
  rateLimitTrackerKey,
  requestPath,
} from '../common/utils/rate-limit-tracker';

const v1ThrottleKind = (context: ExecutionContext): 'send' | 'read' | undefined => {
  const { path, method } = requestPath(context.switchToHttp().getRequest<Record<string, unknown>>());
  return classifyV1Throttle(path, method);
};

const isWahaInboundPath = (context: ExecutionContext): boolean => {
  const { path, method } = requestPath(context.switchToHttp().getRequest<Record<string, unknown>>());
  return method === 'POST' && path === '/internal/waha/events';
};

const liveLimit = (key: string, fallback: number): number => {
  const n = Number(process.env[key]);
  return Number.isFinite(n) && n >= 1 ? n : fallback;
};

export const buildThrottlerOptions = (
  configService: ConfigService<EnvironmentVariables, true>,
) => {
  const pepper = configService.get('TOKEN_PEPPER', { infer: true });
  const sendLimit = configService.get('RATE_LIMIT_SEND', { infer: true });
  const v1Send = configService.get('RATE_LIMIT_V1_SEND', { infer: true });
  const v1Read = configService.get('RATE_LIMIT_V1_READ', { infer: true });
  return {
    storage: new BoundedThrottlerStorage(),
    getTracker: (req: Record<string, unknown> | undefined) =>
      rateLimitTrackerKey(req ?? {}, pepper),
    throttlers: [
      {
        name: 'default',
        ttl: 60_000,
        limit: () => liveLimit('RATE_LIMIT_SEND', sendLimit),
        skipIf: (context: ExecutionContext) =>
          v1ThrottleKind(context) !== undefined || isWahaInboundPath(context),
      },
      {
        name: 'v1-send',
        ttl: 60_000,
        limit: () => liveLimit('RATE_LIMIT_V1_SEND', v1Send),
        skipIf: (context: ExecutionContext) => v1ThrottleKind(context) !== 'send',
      },
      {
        name: 'v1-read',
        ttl: 60_000,
        limit: () => liveLimit('RATE_LIMIT_V1_READ', v1Read),
        skipIf: (context: ExecutionContext) => v1ThrottleKind(context) !== 'read',
      },
    ],
  };
};
