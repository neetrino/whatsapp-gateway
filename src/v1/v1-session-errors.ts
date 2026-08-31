import { SessionStatus } from '../common/db-enums';
import { AppException } from '../common/errors/app.exception';
import { ERROR_CODES } from '../common/errors/error-codes';

export const isQrStillPending = (errorCode: string | null, status: string): boolean => {
  if (status === SessionStatus.CONNECTED || status === SessionStatus.ERROR) {
    return false;
  }
  return errorCode === null || errorCode === 'WAHA_HTTP_404';
};

export const toQrUnavailableException = (errorCode: string | null): AppException => {
  if (errorCode === 'WAHA_HTTP_409') {
    return new AppException({
      code: ERROR_CODES.SESSION_CONFLICT,
      message: 'WhatsApp session is in a conflict state. Restart the session and try again.',
      status: 409,
    });
  }
  return new AppException({
    code: ERROR_CODES.WAHA_UNAVAILABLE,
    message: 'WhatsApp session is temporarily unavailable. Retry shortly or restart the session.',
    status: 503,
  });
};

export const toSessionMutationException = (error: unknown): AppException => {
  if (error instanceof AppException) return error;
  return new AppException({
    code: ERROR_CODES.WAHA_UNAVAILABLE,
    message: 'WhatsApp session is temporarily unavailable. Retry shortly.',
    status: 503,
  });
};
