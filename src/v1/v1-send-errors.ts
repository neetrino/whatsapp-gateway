import { OutboundIdempotencyStatus } from '@prisma/client';
import { AppException } from '../common/errors/app.exception';
import { ERROR_CODES, type ErrorCode } from '../common/errors/error-codes';
import { WahaApiError, WahaTransportError } from '../waha/types/waha.types';

const AMBIGUOUS_WAHA_HTTP = new Set([408, 502, 504]);

export const isAmbiguousWahaError = (error: unknown): boolean => {
  if (error instanceof WahaTransportError) return true;
  return error instanceof WahaApiError && AMBIGUOUS_WAHA_HTTP.has(error.status);
};

export const safeErrorSummary = (error: unknown): string => {
  if (error instanceof WahaApiError) return `WAHA_HTTP_${error.status}`;
  if (error instanceof WahaTransportError) return 'WAHA_TRANSPORT';
  if (error instanceof AppException) return error.code;
  return ERROR_CODES.INTERNAL_ERROR;
};

export const outcomeForSendFailure = (
  error: unknown,
  dispatched: boolean,
): OutboundIdempotencyStatus => {
  if (dispatched || isAmbiguousWahaError(error)) {
    return OutboundIdempotencyStatus.OUTCOME_UNKNOWN;
  }
  return OutboundIdempotencyStatus.FAILED;
};

export const sendFailureCode = (error: unknown, kind: 'TEXT' | 'IMAGE' | 'VIDEO'): string => {
  if (isAmbiguousWahaError(error)) return ERROR_CODES.MESSAGE_OUTCOME_UNKNOWN;
  if (error instanceof WahaApiError) {
    if (kind === 'IMAGE') return ERROR_CODES.IMAGE_SEND_FAILED;
    if (kind === 'VIDEO') return ERROR_CODES.VIDEO_SEND_FAILED;
    return ERROR_CODES.MESSAGE_SEND_FAILED;
  }
  if (error instanceof AppException) return error.code;
  return ERROR_CODES.INTERNAL_ERROR;
};

export const toSendAppException = (error: unknown, kind: 'TEXT' | 'IMAGE' | 'VIDEO'): AppException => {
  if (error instanceof AppException) return error;
  if (isAmbiguousWahaError(error)) {
    return new AppException({
      code: ERROR_CODES.MESSAGE_OUTCOME_UNKNOWN,
      message: 'Send outcome is unknown. Do not retry with a new key.',
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

const previousSendFailed = (): AppException =>
  new AppException({
    code: ERROR_CODES.MESSAGE_SEND_FAILED,
    message: 'Previous send operation failed.',
    status: 502,
  });

const STORED_FAILURE: Record<string, { code: ErrorCode; message: string; status: number }> = {
  [ERROR_CODES.ACCOUNT_INACTIVE]: {
    code: ERROR_CODES.ACCOUNT_INACTIVE,
    message: 'WhatsApp account is inactive.',
    status: 409,
  },
  [ERROR_CODES.WHATSAPP_NOT_CONNECTED]: {
    code: ERROR_CODES.WHATSAPP_NOT_CONNECTED,
    message: 'WhatsApp account is not connected.',
    status: 409,
  },
  [ERROR_CODES.VALIDATION_ERROR]: {
    code: ERROR_CODES.VALIDATION_ERROR,
    message: 'Request validation failed.',
    status: 400,
  },
  [ERROR_CODES.INVALID_MEDIA_URL]: {
    code: ERROR_CODES.INVALID_MEDIA_URL,
    message: 'mediaUrl is invalid.',
    status: 400,
  },
  [ERROR_CODES.IMAGE_SEND_FAILED]: {
    code: ERROR_CODES.IMAGE_SEND_FAILED,
    message: 'Failed to send WhatsApp image.',
    status: 502,
  },
  [ERROR_CODES.VIDEO_SEND_FAILED]: {
    code: ERROR_CODES.VIDEO_SEND_FAILED,
    message: 'Failed to send WhatsApp video.',
    status: 502,
  },
  [ERROR_CODES.MESSAGE_SEND_FAILED]: {
    code: ERROR_CODES.MESSAGE_SEND_FAILED,
    message: 'Previous send operation failed.',
    status: 502,
  },
  [ERROR_CODES.MESSAGE_OUTCOME_UNKNOWN]: {
    code: ERROR_CODES.MESSAGE_OUTCOME_UNKNOWN,
    message: 'Previous send outcome is unknown. Do not retry with a new key; reconcile manually.',
    status: 503,
  },
};

/** Maps a persisted safe errorCode to a stable replay response. Never includes provider text. */
export const exceptionFromStoredFailure = (errorCode: string | null): AppException => {
  const mapped = errorCode ? STORED_FAILURE[errorCode] : undefined;
  return mapped ? new AppException(mapped) : previousSendFailed();
};
