import { createHash } from 'node:crypto';
import {
  IDEMPOTENCY_KEY_HEADER,
  IDEMPOTENCY_KEY_MAX_LENGTH,
  IDEMPOTENCY_KEY_REGEX,
} from './constants/group.constants';
import { AppException } from '../common/errors/app.exception';
import { ERROR_CODES } from '../common/errors/error-codes';

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

export const hashGroupRequestPayload = (payload: unknown): string => {
  const canonical = JSON.stringify(payload);
  return createHash('sha256').update(canonical).digest('hex');
};

export const dedupeParticipantIds = (participants: string[]): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const id of participants) {
    if (seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }
  return result;
};
