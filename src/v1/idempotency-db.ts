import { MessageStatus, OutboundIdempotencyStatus, Prisma } from '@prisma/client';
import { unknownOutcome, requireStoredResult, type V1SendResult } from './idempotency-result';

/** Delegates available on PrismaClient and on an interactive transaction client. */
export type IdempotencyStore = Pick<
  Prisma.TransactionClient,
  'outboundMessageIdempotency' | 'outboundMessageLog'
>;

const succeededData = (result: V1SendResult, wahaMessageId: string | null) => ({
  status: OutboundIdempotencyStatus.SUCCEEDED,
  requestId: result.requestId,
  messageId: result.messageId,
  wahaMessageId,
  sentAt: new Date(result.sentAt),
  errorCode: null,
});

const applySucceeded = async (
  db: IdempotencyStore,
  id: string,
  result: V1SendResult,
  wahaMessageId: string | null,
): Promise<void> => {
  const moved = await db.outboundMessageIdempotency.updateMany({
    where: {
      id,
      status: {
        in: [OutboundIdempotencyStatus.PROCESSING, OutboundIdempotencyStatus.OUTCOME_UNKNOWN],
      },
    },
    data: succeededData(result, wahaMessageId),
  });
  if (moved.count === 1) return;
  const latest = await db.outboundMessageIdempotency.findUnique({ where: { id } });
  if (latest?.status === OutboundIdempotencyStatus.SUCCEEDED) {
    requireStoredResult(latest);
    return;
  }
  throw unknownOutcome('Send may have been delivered but idempotency could not be persisted.');
};

/** PENDING→SENT and PROCESSING/UNKNOWN→SUCCEEDED. Caller must run this inside one transaction. */
export const persistSentAndSucceeded = async (
  db: IdempotencyStore,
  input: {
    logId: string;
    idempotencyId: string;
    result: V1SendResult;
    wahaMessageId: string | null;
  },
): Promise<void> => {
  const logMove = await db.outboundMessageLog.updateMany({
    where: { id: input.logId, status: MessageStatus.PENDING },
    data: { status: MessageStatus.SENT, wahaMessageId: input.wahaMessageId },
  });
  if (logMove.count !== 1) {
    throw unknownOutcome('Could not persist SENT operational log after provider success.');
  }
  await applySucceeded(db, input.idempotencyId, input.result, input.wahaMessageId);
};
