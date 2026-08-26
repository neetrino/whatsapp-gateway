import { MessageStatus, OutboundIdempotencyStatus } from '@prisma/client';
import { ERROR_CODES } from '../../src/common/errors/error-codes';
import { persistSentAndSucceeded } from '../../src/v1/idempotency-db';

const result = {
  requestId: 'req_1',
  messageId: 'w1',
  status: 'sent' as const,
  sentAt: '2026-08-24T12:00:00.000Z',
};

describe('persistSentAndSucceeded', () => {
  it('requires the PENDING log transition to update exactly one row', async () => {
    const db = {
      outboundMessageLog: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      outboundMessageIdempotency: { updateMany: jest.fn(), findUnique: jest.fn() },
    };
    await expect(
      persistSentAndSucceeded(db as never, {
        logId: 'log1',
        idempotencyId: 'idemp1',
        result,
        wahaMessageId: 'w1',
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.MESSAGE_OUTCOME_UNKNOWN });
    expect(db.outboundMessageIdempotency.updateMany).not.toHaveBeenCalled();
  });

  it('requires idempotency to leave PROCESSING or OUTCOME_UNKNOWN', async () => {
    const db = {
      outboundMessageLog: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      outboundMessageIdempotency: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findUnique: jest.fn().mockResolvedValue({
          status: OutboundIdempotencyStatus.PROCESSING,
          requestId: null,
          messageId: null,
          sentAt: null,
        }),
      },
    };
    await expect(
      persistSentAndSucceeded(db as never, {
        logId: 'log1',
        idempotencyId: 'idemp1',
        result,
        wahaMessageId: 'w1',
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.MESSAGE_OUTCOME_UNKNOWN });
    expect(db.outboundMessageLog.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'log1', status: MessageStatus.PENDING },
        data: expect.objectContaining({ status: MessageStatus.SENT }),
      }),
    );
  });

  it('accepts a concurrent SUCCEEDED row after the log SENT write', async () => {
    const db = {
      outboundMessageLog: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      outboundMessageIdempotency: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findUnique: jest.fn().mockResolvedValue({
          status: OutboundIdempotencyStatus.SUCCEEDED,
          requestId: result.requestId,
          messageId: result.messageId,
          sentAt: new Date(result.sentAt),
        }),
      },
    };
    await expect(
      persistSentAndSucceeded(db as never, {
        logId: 'log1',
        idempotencyId: 'idemp1',
        result,
        wahaMessageId: 'w1',
      }),
    ).resolves.toBeUndefined();
  });
});
