import { AppException } from '../errors/app.exception';
import { ERROR_CODES } from '../errors/error-codes';

export const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';
export const IDEMPOTENCY_KEY_MAX_LENGTH = 128;
export const IDEMPOTENCY_KEY_REGEX = /^[A-Za-z0-9._:-]{8,128}$/;

export const requireIdempotencyKey = (headers: Record<string, unknown>): string => {
  const raw = headers[IDEMPOTENCY_KEY_HEADER] ?? headers['Idempotency-Key'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new AppException({
      code: ERROR_CODES.IDEMPOTENCY_KEY_REQUIRED,
      message: 'Idempotency-Key header is required.',
      status: 400,
    });
  }
  const key = value.trim();
  if (key.length > IDEMPOTENCY_KEY_MAX_LENGTH || !IDEMPOTENCY_KEY_REGEX.test(key)) {
    throw new AppException({
      code: ERROR_CODES.IDEMPOTENCY_KEY_INVALID,
      message: 'Idempotency-Key format is invalid.',
      status: 400,
    });
  }
  return key;
};
