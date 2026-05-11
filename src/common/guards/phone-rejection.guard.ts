import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { AppException } from '../errors/app.exception';
import { ERROR_CODES } from '../errors/error-codes';

@Injectable()
export class PhoneRejectionGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const body = request.body;
    if (body && typeof body === 'object' && 'phone' in (body as Record<string, unknown>)) {
      throw new AppException({
        code: ERROR_CODES.PHONE_NOT_SUPPORTED,
        message:
          'phone is not supported. Send WhatsApp chatId instead, for example 37499111222@c.us.',
        status: 400,
      });
    }
    return true;
  }
}
