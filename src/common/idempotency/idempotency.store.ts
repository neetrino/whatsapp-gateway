import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { IdempotencyStatus } from '../db-enums';
import { AppException } from '../errors/app.exception';
import { ERROR_CODES } from '../errors/error-codes';
import { IDEMPOTENCY_STALE_MS, IDEMPOTENCY_TTL_MS } from './idempotency.constants';
import type { IdempotencyBegin, IdempotencyBeginInput } from './idempotency.types';

type IdempotencyRow = {
  id: string;
  requestHash: string;
  status: string;
  resultJson: string | null;
  errorCode: string | null;
  updatedAt: Date;
  expiresAt: Date;
};

const isP2002 = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

const replayOf = (row: IdempotencyRow): Extract<IdempotencyBegin, { kind: 'replay' }> => ({
  kind: 'replay',
  status: row.status as IdempotencyStatus,
  resultJson: row.resultJson,
  errorCode: row.errorCode,
});

@Injectable()
export class IdempotencyStore {
  constructor(private readonly prisma: PrismaService) {}

  async begin(input: IdempotencyBeginInput): Promise<IdempotencyBegin> {
    const existing = await this.findRow(input);
    if (existing) {
      if (this.isExpired(existing)) {
        await this.prisma.apiIdempotency.deleteMany({ where: { id: existing.id } });
      } else {
        return this.resolveExisting(existing, input);
      }
    }
    return this.insertFresh(input);
  }

  async succeed(id: string, result: unknown): Promise<void> {
    try {
      const moved = await this.prisma.apiIdempotency.updateMany({
        where: { id, status: IdempotencyStatus.PROCESSING },
        data: {
          status: IdempotencyStatus.SUCCEEDED,
          resultJson: JSON.stringify(result),
          errorCode: null,
        },
      });
      if (moved.count > 0) return;
    } catch {
      // Persistence failed after the provider accepted the request.
    }
    throw new AppException({
      code: ERROR_CODES.MESSAGE_OUTCOME_UNKNOWN,
      message: 'Could not persist success after the provider accepted the request.',
      status: 503,
    });
  }

  async fail(id: string, errorCode: string, status: IdempotencyStatus): Promise<void> {
    await this.prisma.apiIdempotency.updateMany({
      where: { id, status: IdempotencyStatus.PROCESSING },
      data: { status, errorCode },
    });
  }

  async purgeExpired(): Promise<number> {
    const result = await this.prisma.apiIdempotency.deleteMany({
      where: { expiresAt: { lte: new Date() } },
    });
    return result.count;
  }

  private async insertFresh(input: IdempotencyBeginInput): Promise<IdempotencyBegin> {
    const now = new Date();
    try {
      const row = await this.prisma.apiIdempotency.create({
        data: {
          whatsappAccountId: input.accountId,
          scope: input.scope,
          idempotencyKey: input.idempotencyKey,
          requestHash: input.requestHash,
          status: IdempotencyStatus.PROCESSING,
          expiresAt: new Date(now.getTime() + IDEMPOTENCY_TTL_MS),
        },
      });
      return { kind: 'fresh', id: row.id };
    } catch (error) {
      if (!isP2002(error)) throw error;
      const raced = await this.findRow(input);
      if (!raced) throw error;
      if (this.isExpired(raced)) {
        await this.prisma.apiIdempotency.deleteMany({ where: { id: raced.id } });
        return this.insertFresh(input);
      }
      return this.resolveExisting(raced, input);
    }
  }

  private async resolveExisting(
    existing: IdempotencyRow,
    input: IdempotencyBeginInput,
  ): Promise<IdempotencyBegin> {
    if (existing.requestHash !== input.requestHash) {
      throw new AppException({
        code: ERROR_CODES.IDEMPOTENCY_KEY_REUSED,
        message: 'Idempotency-Key was already used with a different request body.',
        status: 409,
      });
    }
    if (existing.status === IdempotencyStatus.PROCESSING) {
      return this.resolveProcessing(existing, input);
    }
    return replayOf(existing);
  }

  private async resolveProcessing(
    existing: IdempotencyRow,
    input: IdempotencyBeginInput,
  ): Promise<IdempotencyBegin> {
    const staleMs = input.staleMs ?? IDEMPOTENCY_STALE_MS;
    const age = Date.now() - existing.updatedAt.getTime();
    if (age < staleMs) {
      throw new AppException({
        code: ERROR_CODES.IDEMPOTENT_OPERATION_IN_PROGRESS,
        message: 'An identical operation is already in progress.',
        status: 409,
      });
    }
    await this.prisma.apiIdempotency.updateMany({
      where: { id: existing.id, status: IdempotencyStatus.PROCESSING },
      data: {
        status: IdempotencyStatus.OUTCOME_UNKNOWN,
        errorCode: ERROR_CODES.MESSAGE_OUTCOME_UNKNOWN,
      },
    });
    const latest = await this.prisma.apiIdempotency.findUnique({ where: { id: existing.id } });
    return latest ? replayOf(latest) : replayOf({
      ...existing,
      status: IdempotencyStatus.OUTCOME_UNKNOWN,
      errorCode: ERROR_CODES.MESSAGE_OUTCOME_UNKNOWN,
    });
  }

  private findRow(input: IdempotencyBeginInput): Promise<IdempotencyRow | null> {
    return this.prisma.apiIdempotency.findUnique({
      where: {
        whatsappAccountId_scope_idempotencyKey: {
          whatsappAccountId: input.accountId,
          scope: input.scope,
          idempotencyKey: input.idempotencyKey,
        },
      },
    });
  }

  private isExpired(row: Pick<IdempotencyRow, 'expiresAt'>): boolean {
    return row.expiresAt.getTime() <= Date.now();
  }
}
