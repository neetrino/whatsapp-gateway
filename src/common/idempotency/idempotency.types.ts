import type { IdempotencyScope, IdempotencyStatus } from '../db-enums';

export interface IdempotencyBeginInput {
  accountId: string;
  scope: IdempotencyScope;
  idempotencyKey: string;
  requestHash: string;
  staleMs?: number;
}

export type IdempotencyBegin =
  | { kind: 'fresh'; id: string }
  | {
      kind: 'replay';
      status: IdempotencyStatus;
      resultJson: string | null;
      errorCode: string | null;
    };
