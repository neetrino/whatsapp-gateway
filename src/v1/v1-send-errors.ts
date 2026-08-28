import { AppException } from '../common/errors/app.exception';
import { ERROR_CODES } from '../common/errors/error-codes';
import { WahaApiError, WahaTransportError } from '../waha/types/waha.types';

export const safeErrorSummary = (error: unknown): string => {
  if (error instanceof WahaApiError) return `WAHA_HTTP_${error.status}`;
  if (error instanceof WahaTransportError) return 'WAHA_TRANSPORT';
  if (error instanceof AppException) return error.code;
  return ERROR_CODES.INTERNAL_ERROR;
};

export const toSendAppException = (
  error: unknown,
  kind: 'TEXT' | 'IMAGE' | 'VIDEO',
): AppException => {
  if (error instanceof AppException) return error;
  if (error instanceof WahaTransportError) {
    return new AppException({
      code: ERROR_CODES.WAHA_UNAVAILABLE,
      message: 'WAHA service is currently unavailable.',
      status: 503,
    });
  }
  if (error instanceof WahaApiError) {
    const code =
      kind === 'IMAGE'
        ? ERROR_CODES.IMAGE_SEND_FAILED
        : kind === 'VIDEO'
          ? ERROR_CODES.VIDEO_SEND_FAILED
          : ERROR_CODES.MESSAGE_SEND_FAILED;
    return new AppException({
      code,
      message: 'Failed to send WhatsApp message.',
      status: 502,
    });
  }
  return new AppException({
    code: ERROR_CODES.MESSAGE_SEND_FAILED,
    message: 'Failed to send WhatsApp message.',
    status: 502,
  });
};
