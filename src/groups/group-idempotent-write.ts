import { IdempotencyStatus } from '../common/db-enums';
import { AppException } from '../common/errors/app.exception';
import { ERROR_CODES, type ErrorCode } from '../common/errors/error-codes';
import type { IdempotencyStore } from '../common/idempotency/idempotency.store';
import type { IdempotencyBeginInput } from '../common/idempotency/idempotency.types';
import { WahaTransportError } from '../waha/types/waha.types';

const parseStored = <T>(resultJson: string | null): T => {
  if (!resultJson) {
    throw new AppException({
      code: ERROR_CODES.INTERNAL_ERROR,
      message: 'Stored idempotent result is missing.',
      status: 500,
    });
  }
  return JSON.parse(resultJson) as T;
};

export const runGroupWrite = async <T>(
  store: IdempotencyStore,
  input: IdempotencyBeginInput,
  execute: () => Promise<T>,
  unknown: { code: ErrorCode; message: string },
): Promise<T> => {
  const begun = await store.begin(input);
  if (begun.kind === 'replay') {
    if (begun.resultJson) return parseStored<T>(begun.resultJson);
    if (begun.status === IdempotencyStatus.OUTCOME_UNKNOWN) {
      throw new AppException({ ...unknown, status: 503 });
    }
    throw new AppException({
      code: (begun.errorCode as ErrorCode) || unknown.code,
      message: unknown.message,
      status: 502,
    });
  }
  try {
    const result = await execute();
    await store.succeed(begun.id, result);
    return result;
  } catch (error) {
    if (error instanceof AppException) {
      await store.fail(begun.id, error.code, IdempotencyStatus.FAILED);
      throw error;
    }
    if (error instanceof WahaTransportError) {
      await store.fail(begun.id, unknown.code, IdempotencyStatus.OUTCOME_UNKNOWN);
      throw new AppException({ ...unknown, status: 503 });
    }
    await store.fail(begun.id, unknown.code, IdempotencyStatus.FAILED);
    throw error;
  }
};
