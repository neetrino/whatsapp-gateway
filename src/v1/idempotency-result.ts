import type { OutboundMessageIdempotency, OutboundMessageLog } from '@prisma/client';
import { AppException } from '../common/errors/app.exception';
import { ERROR_CODES } from '../common/errors/error-codes';

export interface V1SendResult {
  requestId: string;
  messageId: string;
  status: 'sent';
  sentAt: string;
}

export const unknownOutcome = (message: string): AppException =>
  new AppException({ code: ERROR_CODES.MESSAGE_OUTCOME_UNKNOWN, message, status: 503 });

export const requireStoredResult = (existing: OutboundMessageIdempotency): V1SendResult => {
  if (!existing.requestId || !existing.messageId || !existing.sentAt) {
    throw unknownOutcome('Previous send is missing a stored result.');
  }
  return {
    requestId: existing.requestId,
    messageId: existing.messageId,
    status: 'sent',
    sentAt: existing.sentAt.toISOString(),
  };
};

export const resultFromSentLog = (log: OutboundMessageLog): V1SendResult => ({
  requestId: log.requestId,
  messageId: log.wahaMessageId ?? log.id,
  status: 'sent',
  sentAt: log.updatedAt.toISOString(),
});
