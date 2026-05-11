import { HttpException } from '@nestjs/common';
import type { ErrorCode } from './error-codes';

export interface AppExceptionPayload {
  code: ErrorCode;
  message: string;
  status: number;
}

export class AppException extends HttpException {
  readonly code: ErrorCode;

  constructor(payload: AppExceptionPayload) {
    super({ code: payload.code, message: payload.message }, payload.status);
    this.code = payload.code;
  }
}
