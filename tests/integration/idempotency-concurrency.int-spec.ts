/**
 * Optional PostgreSQL concurrency check.
 * Run with: IDEMPOTENCY_PG_INTEGRATION=1 IDEMPOTENCY_PG_URL=... npm run test:idempotency:pg
 * Never reuse production DATABASE_URL.
 */
import {
  PrismaClient,
  MessageStatus,
  MessageType,
  OutboundIdempotencyStatus,
  SessionStatus,
  WhatsappAccountMode,
} from '@prisma/client';
import { resolveExisting } from '../../src/v1/message-idempotency';

const requirePgUrl = (): string => {
  const url = process.env.IDEMPOTENCY_PG_URL;
  if (process.env.IDEMPOTENCY_PG_INTEGRATION !== '1') {
    throw new Error('Set IDEMPOTENCY_PG_INTEGRATION=1 to run this suite.');
  }
  if (!url) {
    throw new Error('IDEMPOTENCY_PG_URL is required. Do not use DATABASE_URL.');
  }
  if (url === process.env.DATABASE_URL) {
    throw new Error('Refusing to use DATABASE_URL for idempotency PostgreSQL tests.');
  }
  return url;
};

describe('outbound idempotency (postgres)', () => {
  const prisma = new PrismaClient({ datasources: { db: { url: requirePgUrl() } } });
  let projectId: string | undefined;
  let accountId: string | undefined;

  beforeAll(async () => {
    const runId = `${Date.now()}`;
    const project = await prisma.project.create({
      data: { name: 'idempotency-pg', slug: `idem-pg-${runId}` },
    });
    projectId = project.id;
    const account = await prisma.whatsappAccount.create({
      data: {
        projectId: project.id,
        label: 'pg-idem',
        mode: WhatsappAccountMode.SEND_ONLY,
        sessionName: `wa_pg_${runId}`,
        status: SessionStatus.CONNECTED,
      },
    });
    accountId = account.id;
  });

  afterAll(async () => {
    try {
      if (accountId) {
        await prisma.outboundMessageLog.deleteMany({ where: { whatsappAccountId: accountId } });
        await prisma.outboundMessageIdempotency.deleteMany({
          where: { whatsappAccountId: accountId },
        });
        await prisma.whatsappAccount.delete({ where: { id: accountId } });
      }
      if (projectId) {
        await prisma.project.delete({ where: { id: projectId } });
      }
    } finally {
      await prisma.$disconnect();
    }
  });

  it('does not overwrite SUCCEEDED when a stale PROCESSING CAS loses', async () => {
    if (!accountId) {
      throw new Error('PostgreSQL fixture WhatsappAccount was not created.');
    }
    const key = `pg-race-${Date.now()}`;
    const hash = 'abc'.repeat(16).slice(0, 64);
    const created = await prisma.outboundMessageIdempotency.create({
      data: {
        whatsappAccountId: accountId,
        idempotencyKey: key,
        requestHash: hash,
        status: OutboundIdempotencyStatus.PROCESSING,
      },
    });
    try {
      await prisma.outboundMessageLog.create({
        data: {
          whatsappAccountId: accountId,
          requestId: `req_pg_${Date.now()}`,
          chatId: '37499111222@c.us',
          messageType: MessageType.TEXT,
          status: MessageStatus.SENT,
          wahaMessageId: 'waha-pg',
          idempotencyKey: key,
          requestHash: hash,
        },
      });
      await prisma.outboundMessageIdempotency.update({
        where: { id: created.id },
        data: {
          status: OutboundIdempotencyStatus.SUCCEEDED,
          requestId: `req_pg_${Date.now()}`,
          messageId: 'waha-pg',
          sentAt: new Date(),
        },
      });
      const staleView = { ...created, updatedAt: new Date(Date.now() - 200_000) };
      const begun = await resolveExisting(prisma, staleView, hash, 1);
      expect(begun.kind).toBe('replay');
      const latest = await prisma.outboundMessageIdempotency.findUnique({
        where: { id: created.id },
      });
      expect(latest?.status).toBe(OutboundIdempotencyStatus.SUCCEEDED);
    } finally {
      await prisma.outboundMessageLog.deleteMany({ where: { idempotencyKey: key } });
      await prisma.outboundMessageIdempotency.deleteMany({ where: { idempotencyKey: key } });
    }
  });
});
