import {
  MessageStatus,
  MessageType,
  OutboundIdempotencyStatus,
  Prisma,
  type OutboundMessageIdempotency,
  type OutboundMessageLog,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/errors/app.exception';
import { ERROR_CODES } from '../common/errors/error-codes';
import {
  requireStoredResult,
  resultFromSentLog,
  unknownOutcome,
  type V1SendResult,
} from './idempotency-result';
import { exceptionFromStoredFailure } from './v1-send-errors';
import type { IdempotencyStore } from './idempotency-db';

export type { V1SendResult } from './idempotency-result';
export type { IdempotencyStore } from './idempotency-db';
export { persistSentAndSucceeded } from './idempotency-db';

export type IdempotencyBegin =
  | { kind: 'fresh'; row: OutboundMessageIdempotency; log: OutboundMessageLog }
  | { kind: 'replay'; result: V1SendResult };

const isStaleProcessing = (row: OutboundMessageIdempotency, staleMs: number): boolean =>
  row.status === OutboundIdempotencyStatus.PROCESSING &&
  Date.now() - row.updatedAt.getTime() >= staleMs;

const isP2002 = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

export const beginIdempotency = async (
  prisma: PrismaService,
  input: {
    accountId: string;
    idempotencyKey: string;
    requestHash: string;
    staleMs: number;
    requestId: string;
    chatId: string;
    messageType: MessageType;
  },
): Promise<IdempotencyBegin> => {
  const existing = await prisma.outboundMessageIdempotency.findUnique({
    where: {
      whatsappAccountId_idempotencyKey: {
        whatsappAccountId: input.accountId,
        idempotencyKey: input.idempotencyKey,
      },
    },
  });
  if (existing) return resolveExisting(prisma, existing, input.requestHash, input.staleMs);
  return insertFresh(prisma, input);
};

const insertFresh = async (
  prisma: PrismaService,
  input: {
    accountId: string;
    idempotencyKey: string;
    requestHash: string;
    staleMs: number;
    requestId: string;
    chatId: string;
    messageType: MessageType;
  },
): Promise<IdempotencyBegin> => {
  try {
    return await prisma.$transaction(async (tx) => {
      const row = await tx.outboundMessageIdempotency.create({
        data: {
          whatsappAccountId: input.accountId,
          idempotencyKey: input.idempotencyKey,
          requestHash: input.requestHash,
          status: OutboundIdempotencyStatus.PROCESSING,
        },
      });
      const log = await tx.outboundMessageLog.create({
        data: {
          whatsappAccountId: input.accountId,
          requestId: input.requestId,
          chatId: input.chatId,
          messageType: input.messageType,
          status: MessageStatus.PENDING,
          idempotencyKey: input.idempotencyKey,
          requestHash: input.requestHash,
        },
      });
      return { kind: 'fresh' as const, row, log };
    });
  } catch (error) {
    if (!isP2002(error)) throw error;
    const raced = await prisma.outboundMessageIdempotency.findUnique({
      where: {
        whatsappAccountId_idempotencyKey: {
          whatsappAccountId: input.accountId,
          idempotencyKey: input.idempotencyKey,
        },
      },
    });
    if (!raced) throw error;
    return resolveExisting(prisma, raced, input.requestHash, input.staleMs);
  }
};

export const resolveExisting = async (
  prisma: IdempotencyStore,
  existing: OutboundMessageIdempotency,
  requestHash: string,
  staleMs: number,
): Promise<IdempotencyBegin> => {
  if (existing.requestHash !== requestHash) {
    throw new AppException({
      code: ERROR_CODES.IDEMPOTENCY_KEY_REUSED,
      message: 'Idempotency-Key was already used with a different request body.',
      status: 409,
    });
  }
  if (existing.status === OutboundIdempotencyStatus.SUCCEEDED) {
    return { kind: 'replay', result: requireStoredResult(existing) };
  }
  const reconciled = await reconcileFromSentLog(prisma, existing);
  if (reconciled) return reconciled;
  if (isStaleProcessing(existing, staleMs)) {
    return resolveStaleProcessing(prisma, existing, requestHash, staleMs);
  }
  return settleNonSuccess(existing);
};

const resolveStaleProcessing = async (
  prisma: IdempotencyStore,
  existing: OutboundMessageIdempotency,
  requestHash: string,
  staleMs: number,
): Promise<IdempotencyBegin> => {
  const moved = await prisma.outboundMessageIdempotency.updateMany({
    where: {
      id: existing.id,
      status: OutboundIdempotencyStatus.PROCESSING,
      updatedAt: existing.updatedAt,
    },
    data: {
      status: OutboundIdempotencyStatus.OUTCOME_UNKNOWN,
      errorCode: ERROR_CODES.MESSAGE_OUTCOME_UNKNOWN,
    },
  });
  if (moved.count === 0) {
    const latest = await prisma.outboundMessageIdempotency.findUnique({ where: { id: existing.id } });
    if (!latest) throw unknownOutcome('Idempotency record disappeared.');
    if (latest.status === OutboundIdempotencyStatus.PROCESSING && isStaleProcessing(latest, staleMs)) {
      throw unknownOutcome(
        'Previous send outcome is unknown after a stale PROCESSING record. Do not retry with a new key.',
      );
    }
    return resolveExisting(prisma, latest, requestHash, staleMs);
  }
  const afterCas = {
    ...existing,
    status: OutboundIdempotencyStatus.OUTCOME_UNKNOWN,
    errorCode: ERROR_CODES.MESSAGE_OUTCOME_UNKNOWN,
  };
  const lateSent = await reconcileFromSentLog(prisma, afterCas);
  if (lateSent) return lateSent;
  throw unknownOutcome(
    'Previous send outcome is unknown after a stale PROCESSING record. Do not retry with a new key.',
  );
};

export const reconcileFromSentLog = async (
  prisma: IdempotencyStore,
  existing: OutboundMessageIdempotency,
): Promise<IdempotencyBegin | null> => {
  if (
    existing.status !== OutboundIdempotencyStatus.PROCESSING &&
    existing.status !== OutboundIdempotencyStatus.OUTCOME_UNKNOWN
  ) {
    return null;
  }
  const log = await prisma.outboundMessageLog.findFirst({
    where: {
      whatsappAccountId: existing.whatsappAccountId,
      idempotencyKey: existing.idempotencyKey,
      requestHash: existing.requestHash,
      status: MessageStatus.SENT,
    },
    orderBy: { createdAt: 'desc' },
  });
  if (!log) return null;
  return finishReconcile(prisma, existing.id, resultFromSentLog(log), log.wahaMessageId);
};

const finishReconcile = async (
  prisma: IdempotencyStore,
  id: string,
  result: V1SendResult,
  wahaMessageId: string | null,
): Promise<IdempotencyBegin> => {
  const moved = await prisma.outboundMessageIdempotency.updateMany({
    where: {
      id,
      status: {
        in: [OutboundIdempotencyStatus.PROCESSING, OutboundIdempotencyStatus.OUTCOME_UNKNOWN],
      },
    },
    data: {
      status: OutboundIdempotencyStatus.SUCCEEDED,
      requestId: result.requestId,
      messageId: result.messageId,
      wahaMessageId,
      sentAt: new Date(result.sentAt),
      errorCode: null,
    },
  });
  if (moved.count > 0) return { kind: 'replay', result };
  const latest = await prisma.outboundMessageIdempotency.findUnique({ where: { id } });
  if (latest?.status === OutboundIdempotencyStatus.SUCCEEDED) {
    return { kind: 'replay', result: requireStoredResult(latest) };
  }
  throw unknownOutcome(
    'Could not persist reconciled SUCCEEDED state. Do not retry with a new key.',
  );
};

export const markIdempotencyFailed = async (
  prisma: IdempotencyStore,
  id: string,
  errorCode: string,
  outcome: OutboundIdempotencyStatus,
): Promise<void> => {
  const first = await prisma.outboundMessageIdempotency.updateMany({
    where: { id, status: OutboundIdempotencyStatus.PROCESSING },
    data: { status: outcome, errorCode },
  });
  if (first.count > 0) return;
  const latest = await prisma.outboundMessageIdempotency.findUnique({ where: { id } });
  if (latest && latest.status !== OutboundIdempotencyStatus.PROCESSING) return;
  const retry = await prisma.outboundMessageIdempotency.updateMany({
    where: { id, status: OutboundIdempotencyStatus.PROCESSING },
    data: { status: outcome, errorCode },
  });
  if (retry.count > 0) return;
  throw unknownOutcome('Could not persist terminal idempotency state. Treat the outcome as unknown.');
};

const settleNonSuccess = (existing: OutboundMessageIdempotency): never => {
  if (existing.status === OutboundIdempotencyStatus.PROCESSING) {
    throw new AppException({
      code: ERROR_CODES.IDEMPOTENT_OPERATION_IN_PROGRESS,
      message: 'An identical send is already in progress.',
      status: 409,
    });
  }
  if (existing.status === OutboundIdempotencyStatus.OUTCOME_UNKNOWN) {
    throw unknownOutcome(
      'Previous send outcome is unknown. Do not retry with a new key; reconcile manually.',
    );
  }
  throw exceptionFromStoredFailure(existing.errorCode);
};
