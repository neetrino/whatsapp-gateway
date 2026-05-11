import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { ERROR_CODES, type ErrorCode } from '../errors/error-codes';
import { AppException } from '../errors/app.exception';

interface NormalizedError {
  status: number;
  code: ErrorCode;
  message: string;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const normalizeKnownHttp = (exception: HttpException): NormalizedError => {
  const status = exception.getStatus();
  const response = exception.getResponse();

  if (exception instanceof AppException) {
    return {
      status,
      code: exception.code,
      message:
        isPlainObject(response) && typeof response.message === 'string'
          ? response.message
          : exception.message,
    };
  }

  if (exception instanceof ThrottlerException) {
    return {
      status,
      code: ERROR_CODES.RATE_LIMITED,
      message: 'Too many requests. Please slow down.',
    };
  }

  if (isPlainObject(response)) {
    const rawMessage = response.message;
    const message = Array.isArray(rawMessage)
      ? rawMessage.join('; ')
      : typeof rawMessage === 'string'
        ? rawMessage
        : exception.message;
    const code: ErrorCode =
      status === HttpStatus.UNAUTHORIZED
        ? ERROR_CODES.UNAUTHORIZED
        : status === HttpStatus.FORBIDDEN
          ? ERROR_CODES.FORBIDDEN
          : status === HttpStatus.NOT_FOUND
            ? ERROR_CODES.NOT_FOUND
            : status === HttpStatus.CONFLICT
              ? ERROR_CODES.CONFLICT
              : status === HttpStatus.BAD_REQUEST
                ? ERROR_CODES.VALIDATION_ERROR
                : ERROR_CODES.INTERNAL_ERROR;
    return { status, code, message };
  }

  return {
    status,
    code: ERROR_CODES.INTERNAL_ERROR,
    message: typeof response === 'string' ? response : exception.message,
  };
};

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const normalized: NormalizedError =
      exception instanceof HttpException
        ? normalizeKnownHttp(exception)
        : {
            status: HttpStatus.INTERNAL_SERVER_ERROR,
            code: ERROR_CODES.INTERNAL_ERROR,
            message: 'Internal server error.',
          };

    if (normalized.status >= 500) {
      this.logger.error({
        msg: 'request_failed',
        status: normalized.status,
        code: normalized.code,
        path: request.path,
        method: request.method,
        error: exception instanceof Error ? exception.message : 'unknown',
      });
    }

    const requestId = (request as Request & { requestId?: string }).requestId;
    const wantsHtml = request.accepts(['html', 'json']) === 'html';

    if (wantsHtml && !request.path.startsWith('/api')) {
      try {
        response.status(normalized.status).render('error', {
          layout: 'main',
          title: 'Error',
          status: normalized.status,
          code: normalized.code,
          message: normalized.message,
        });
        return;
      } catch {
        this.logger.warn({ msg: 'error_page_render_failed', path: request.path });
      }
    }

    response.status(normalized.status).json({
      success: false,
      error: {
        code: normalized.code,
        message: normalized.message,
        ...(requestId ? { requestId } : {}),
      },
    });
  }
}
