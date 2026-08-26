import { OutboundIdempotencyStatus, MessageStatus } from '@prisma/client';
import { ERROR_CODES } from '../../src/common/errors/error-codes';
import { reconcileFromSentLog, resolveExisting } from '../../src/v1/message-idempotency';

const row = {
  id: 'idemp1',
  whatsappAccountId: 'acc1',
  idempotencyKey: 'key-12345678',
  requestHash: 'hash-a',
  status: OutboundIdempotencyStatus.SUCCEEDED,
  requestId: 'req_1',
  messageId: 'w1',
  wahaMessageId: 'w1',
  sentAt: new Date('2026-08-24T12:00:00.000Z'),
  errorCode: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const emptyLog = { outboundMessageLog: { findFirst: jest.fn().mockResolvedValue(null) } };

const sentLog = {
  id: 'log1',
  requestId: 'req_1',
  wahaMessageId: 'waha-9',
  updatedAt: new Date('2026-08-24T12:00:00.000Z'),
  status: MessageStatus.SENT,
};

describe('message idempotency', () => {
  it('replays a succeeded result for the same hash', async () => {
    const prisma = { outboundMessageIdempotency: { updateMany: jest.fn() }, ...emptyLog };
    const begun = await resolveExisting(prisma as never, row, 'hash-a', 120_000);
    expect(begun).toEqual({
      kind: 'replay',
      result: {
        requestId: 'req_1',
        messageId: 'w1',
        status: 'sent',
        sentAt: '2026-08-24T12:00:00.000Z',
      },
    });
  });

  it('rejects the same key with a different request hash', async () => {
    const prisma = { outboundMessageIdempotency: { updateMany: jest.fn() }, ...emptyLog };
    await expect(resolveExisting(prisma as never, row, 'hash-b', 120_000)).rejects.toMatchObject({
      code: ERROR_CODES.IDEMPOTENCY_KEY_REUSED,
    });
  });

  it('returns in-progress for fresh PROCESSING rows', async () => {
    const prisma = { outboundMessageIdempotency: { updateMany: jest.fn() }, ...emptyLog };
    await expect(
      resolveExisting(
        prisma as never,
        { ...row, status: OutboundIdempotencyStatus.PROCESSING, updatedAt: new Date() },
        'hash-a',
        120_000,
      ),
    ).rejects.toMatchObject({ code: ERROR_CODES.IDEMPOTENT_OPERATION_IN_PROGRESS });
  });

  it('replays FAILED using the persisted errorCode without treating it as a generic 502', async () => {
    const prisma = { outboundMessageIdempotency: { updateMany: jest.fn() }, ...emptyLog };
    await expect(
      resolveExisting(
        prisma as never,
        {
          ...row,
          status: OutboundIdempotencyStatus.FAILED,
          errorCode: ERROR_CODES.ACCOUNT_INACTIVE,
        },
        'hash-a',
        120_000,
      ),
    ).rejects.toMatchObject({ code: ERROR_CODES.ACCOUNT_INACTIVE, status: 409 });
  });

  it('does not overwrite SUCCEEDED when a stale PROCESSING race loses the CAS', async () => {
    const prisma = {
      outboundMessageLog: { findFirst: jest.fn().mockResolvedValue(null) },
      outboundMessageIdempotency: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findUnique: jest.fn().mockResolvedValue(row),
      },
    };
    const stale = {
      ...row,
      status: OutboundIdempotencyStatus.PROCESSING,
      updatedAt: new Date(Date.now() - 200_000),
    };
    const begun = await resolveExisting(prisma as never, stale, 'hash-a', 120_000);
    expect(begun.kind).toBe('replay');
    if (begun.kind === 'replay') expect(begun.result.messageId).toBe('w1');
    expect(prisma.outboundMessageIdempotency.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'idemp1',
          status: OutboundIdempotencyStatus.PROCESSING,
        }),
      }),
    );
  });

  it('reconciles a SENT operational log into SUCCEEDED without another send', async () => {
    const prisma = {
      outboundMessageLog: { findFirst: jest.fn().mockResolvedValue(sentLog) },
      outboundMessageIdempotency: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const processing = {
      ...row,
      status: OutboundIdempotencyStatus.PROCESSING,
      requestId: null,
      messageId: null,
      sentAt: null,
      updatedAt: new Date(Date.now() - 200_000),
    };
    const begun = await reconcileFromSentLog(prisma as never, processing);
    expect(begun).toEqual({
      kind: 'replay',
      result: {
        requestId: 'req_1',
        messageId: 'waha-9',
        status: 'sent',
        sentAt: sentLog.updatedAt.toISOString(),
      },
    });
  });

  it('replays when reconcile update count is zero but the row is already SUCCEEDED', async () => {
    const prisma = {
      outboundMessageLog: { findFirst: jest.fn().mockResolvedValue(sentLog) },
      outboundMessageIdempotency: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findUnique: jest.fn().mockResolvedValue(row),
      },
    };
    const unknown = {
      ...row,
      status: OutboundIdempotencyStatus.OUTCOME_UNKNOWN,
      requestId: null,
      messageId: null,
      sentAt: null,
    };
    const begun = await reconcileFromSentLog(prisma as never, unknown);
    expect(begun).toEqual({
      kind: 'replay',
      result: {
        requestId: 'req_1',
        messageId: 'w1',
        status: 'sent',
        sentAt: '2026-08-24T12:00:00.000Z',
      },
    });
  });

  it('returns OUTCOME_UNKNOWN when reconcile count is zero and state is unresolved', async () => {
    const prisma = {
      outboundMessageLog: { findFirst: jest.fn().mockResolvedValue(sentLog) },
      outboundMessageIdempotency: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findUnique: jest.fn().mockResolvedValue({
          ...row,
          status: OutboundIdempotencyStatus.PROCESSING,
          requestId: null,
          messageId: null,
          sentAt: null,
        }),
      },
    };
    await expect(
      reconcileFromSentLog(prisma as never, {
        ...row,
        status: OutboundIdempotencyStatus.PROCESSING,
        requestId: null,
        messageId: null,
        sentAt: null,
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.MESSAGE_OUTCOME_UNKNOWN });
  });

  it('reconciles a SENT log that appears immediately after a successful stale CAS', async () => {
    const prisma = {
      outboundMessageLog: {
        findFirst: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(sentLog),
      },
      outboundMessageIdempotency: {
        updateMany: jest
          .fn()
          .mockResolvedValueOnce({ count: 1 })
          .mockResolvedValueOnce({ count: 1 }),
        findUnique: jest.fn(),
      },
    };
    const stale = {
      ...row,
      status: OutboundIdempotencyStatus.PROCESSING,
      requestId: null,
      messageId: null,
      sentAt: null,
      updatedAt: new Date(Date.now() - 200_000),
    };
    const begun = await resolveExisting(prisma as never, stale, 'hash-a', 120_000);
    expect(begun.kind).toBe('replay');
    if (begun.kind === 'replay') expect(begun.result.messageId).toBe('waha-9');
    expect(prisma.outboundMessageLog.findFirst).toHaveBeenCalledTimes(2);
  });

  it('does not treat OUTCOME_UNKNOWN as retryable when no SENT log exists', async () => {
    const prisma = { outboundMessageIdempotency: { updateMany: jest.fn() }, ...emptyLog };
    await expect(
      resolveExisting(
        prisma as never,
        { ...row, status: OutboundIdempotencyStatus.OUTCOME_UNKNOWN },
        'hash-a',
        120_000,
      ),
    ).rejects.toMatchObject({ code: ERROR_CODES.MESSAGE_OUTCOME_UNKNOWN });
  });
});
