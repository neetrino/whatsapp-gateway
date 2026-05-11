import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  StreamableFile,
} from '@nestjs/common';
import type { Request } from 'express';
import { Observable, map } from 'rxjs';

const SKIP_ENVELOPE = Symbol('skip_envelope');

export const skipEnvelope = <T>(value: T): T & { [SKIP_ENVELOPE]: true } =>
  Object.assign(value as object, { [SKIP_ENVELOPE]: true }) as T & { [SKIP_ENVELOPE]: true };

const shouldSkip = (value: unknown): boolean =>
  typeof value === 'object' && value !== null && SKIP_ENVELOPE in value;

@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const httpCtx = context.switchToHttp();
    const request = httpCtx.getRequest<Request>();

    const isApi = request.path.startsWith('/api');
    if (!isApi) {
      return next.handle();
    }

    return next.handle().pipe(
      map((data) => {
        if (data instanceof StreamableFile) return data;
        if (shouldSkip(data)) {
          const cleaned = { ...(data as object) };
          delete (cleaned as Record<symbol, unknown>)[SKIP_ENVELOPE];
          return cleaned;
        }
        if (
          data !== null &&
          typeof data === 'object' &&
          'success' in (data as Record<string, unknown>)
        ) {
          return data;
        }
        return { success: true, data };
      }),
    );
  }
}
