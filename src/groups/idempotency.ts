import { createHash } from 'node:crypto';
import {
  IDEMPOTENCY_KEY_HEADER,
  IDEMPOTENCY_KEY_MAX_LENGTH,
  IDEMPOTENCY_KEY_REGEX,
  requireIdempotencyKey,
} from '../common/utils/idempotency-key';

export {
  IDEMPOTENCY_KEY_HEADER,
  IDEMPOTENCY_KEY_MAX_LENGTH,
  IDEMPOTENCY_KEY_REGEX,
  requireIdempotencyKey,
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
