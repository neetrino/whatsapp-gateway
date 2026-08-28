import { IdempotencyScope, IdempotencyStatus } from '../../src/common/db-enums';
import { ERROR_CODES } from '../../src/common/errors/error-codes';
import { IdempotencyStore } from '../../src/common/idempotency/idempotency.store';
import { memoryApiIdempotency } from '../helpers/memory-api-idempotency';

const input = {
  accountId: 'acc1',
  scope: IdempotencyScope.SEND,
  idempotencyKey: 'order-42-send-1',
  requestHash: 'hash-a',
};

const storeFor = () => {
  const apiIdempotency = memoryApiIdempotency();
  return {
    apiIdempotency,
    store: new IdempotencyStore({ apiIdempotency } as never),
  };
};

describe('IdempotencyStore', () => {
  it('replays a succeeded key and rejects a different body', async () => {
    const { store } = storeFor();
    const first = await store.begin(input);
    expect(first.kind).toBe('fresh');
    if (first.kind !== 'fresh') return;
    await store.succeed(first.id, { messageId: 'w1', status: 'sent' });
    const replay = await store.begin(input);
    expect(replay).toMatchObject({ kind: 'replay', status: IdempotencyStatus.SUCCEEDED });
    if (replay.kind === 'replay') {
      expect(JSON.parse(replay.resultJson ?? '{}')).toEqual({ messageId: 'w1', status: 'sent' });
    }
    await expect(store.begin({ ...input, requestHash: 'hash-b' })).rejects.toMatchObject({
      code: ERROR_CODES.IDEMPOTENCY_KEY_REUSED,
    });
  });

  it('allows the same key after TTL expiry', async () => {
    const { store, apiIdempotency } = storeFor();
    const first = await store.begin(input);
    if (first.kind !== 'fresh') return;
    await store.succeed(first.id, { messageId: 'w1' });
    await apiIdempotency.updateMany({
      where: { id: first.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const again = await store.begin(input);
    expect(again.kind).toBe('fresh');
  });

  it('promotes stale PROCESSING to OUTCOME_UNKNOWN', async () => {
    const { store, apiIdempotency } = storeFor();
    const first = await store.begin(input);
    if (first.kind !== 'fresh') return;
    await apiIdempotency.updateMany({
      where: { id: first.id },
      data: { updatedAt: new Date(Date.now() - 60_000) },
    });
    const replay = await store.begin({ ...input, staleMs: 30_000 });
    expect(replay).toMatchObject({
      kind: 'replay',
      status: IdempotencyStatus.OUTCOME_UNKNOWN,
    });
  });

  it('purges expired rows so they do not pile up', async () => {
    const { store, apiIdempotency } = storeFor();
    const first = await store.begin(input);
    if (first.kind !== 'fresh') return;
    await apiIdempotency.updateMany({
      where: { id: first.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await expect(store.purgeExpired()).resolves.toBe(1);
    await expect(store.purgeExpired()).resolves.toBe(0);
  });
});
