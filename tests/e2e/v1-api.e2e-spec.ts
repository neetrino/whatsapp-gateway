import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  SessionStatus,
  WhatsappAccountMode,
  OutboundIdempotencyStatus,
  MessageStatus,
} from '@prisma/client';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ApiTokensService } from '../../src/api-tokens/api-tokens.service';
import { WahaClient } from '../../src/waha/waha.client';
import { generateApiToken } from '../../src/common/utils/tokens';
import { hashV1SendRequest } from '../../src/v1/request-hash';
import dns from 'node:dns/promises';
import type { LookupAddress, LookupOptions } from 'node:dns';

describe('v1 account-scoped API (e2e)', () => {
  let app: INestApplication;
  const prefix = process.env.API_TOKEN_PREFIX ?? 'gw_test';
  const findProjectByRaw = jest.fn();
  const touchLastUsed = jest.fn();
  const sendText = jest.fn();
  const sendImageByUrl = jest.fn();
  const sendVideoByUrl = jest.fn();
  const getStatus = jest.fn();

  const accountA = {
    id: 'acc-a',
    projectId: 'p1',
    label: 'A',
    mode: WhatsappAccountMode.SEND_ONLY,
    sessionName: 'wa_aaa',
    status: SessionStatus.CONNECTED,
    phoneNumber: '37499111222',
    isActive: true,
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    updatedAt: new Date('2026-08-01T00:00:00.000Z'),
  };

  const prismaMock = {
    onModuleInit: async () => {},
    onModuleDestroy: async () => {},
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    $queryRaw: jest.fn().mockResolvedValue([{ ok: 1 }]),
    admin: { findUnique: jest.fn() },
    project: { count: jest.fn().mockResolvedValue(0), findUnique: jest.fn(), findMany: jest.fn() },
    whatsappAccount: {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([accountA]),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        ...accountA,
        ...data,
      })),
    },
    apiToken: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    outboundMessageLog: {
      create: jest.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'log1',
        ...data,
      })),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
    outboundMessageIdempotency: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'idemp1',
        ...data,
        status: OutboundIdempotencyStatus.PROCESSING,
        updatedAt: new Date(),
      })),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    groupApiOperation: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    $transaction: jest.fn(),
  };
  (prismaMock as { $transaction: jest.Mock }).$transaction.mockImplementation(
    async (fn: (tx: typeof prismaMock) => unknown) => fn(prismaMock),
  );

  beforeAll(async () => {
    jest.spyOn(dns, 'resolve4').mockResolvedValue(['8.8.8.8']);
    jest.spyOn(dns, 'resolve6').mockRejectedValue(new Error('ENODATA'));
    jest.spyOn(dns, 'lookup').mockImplementation((async (
      _hostname: string,
      opts?: LookupOptions,
    ): Promise<LookupAddress | LookupAddress[]> => {
      if (opts && typeof opts === 'object' && 'all' in opts && opts.all === true) {
        return [{ address: '8.8.8.8', family: 4 }];
      }
      return { address: '8.8.8.8', family: 4 };
    }) as typeof dns.lookup);

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .overrideProvider(ApiTokensService)
      .useValue({
        findProjectByRaw,
        findValidByRaw: jest.fn(),
        touchLastUsed,
        create: jest.fn(),
        listForProject: jest.fn(),
        revoke: jest.fn(),
        regenerate: jest.fn(),
      })
      .overrideProvider(WahaClient)
      .useValue({
        healthCheck: jest.fn().mockResolvedValue(true),
        startSession: jest.fn(),
        stopSession: jest.fn(),
        restartSession: jest.fn(),
        getStatus,
        getQr: jest.fn(),
        sendText,
        sendImageByUrl,
        sendVideoByUrl,
      })
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    findProjectByRaw.mockResolvedValue({
      apiTokenId: 't1',
      projectId: 'p1',
      projectIsActive: true,
      revoked: false,
    });
    prismaMock.whatsappAccount.findFirst.mockResolvedValue(accountA);
    prismaMock.whatsappAccount.findMany.mockResolvedValue([accountA]);
    prismaMock.outboundMessageIdempotency.findUnique.mockResolvedValue(null);
    prismaMock.outboundMessageLog.findFirst.mockResolvedValue(null);
    prismaMock.outboundMessageLog.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.outboundMessageIdempotency.updateMany.mockResolvedValue({ count: 1 });
    getStatus.mockResolvedValue({ status: 'WORKING', me: { id: '37499111222@c.us' } });
    sendText.mockResolvedValue({ id: 'wmsg1' });
    sendImageByUrl.mockResolvedValue({ id: 'wimg1' });
    sendVideoByUrl.mockResolvedValue({ id: 'wvid1' });
  });

  const auth = () => ({ Authorization: `Bearer ${generateApiToken(prefix).raw}` });
  const idem = (key = 'idem-key-1234') => ({ 'Idempotency-Key': key });

  it('lists only safe account metadata for the authenticated project', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/accounts').set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data[0]).toMatchObject({
      id: 'acc-a',
      label: 'A',
      mode: 'SEND_ONLY',
      isActive: true,
      phoneNumber: '•••••••1222',
    });
    expect(JSON.stringify(res.body)).not.toContain('wa_aaa');
    expect(JSON.stringify(res.body)).not.toContain('waha');
  });

  it('returns 404 for a cross-project account id', async () => {
    prismaMock.whatsappAccount.findFirst.mockResolvedValueOnce(null);
    const res = await request(app.getHttpServer())
      .get('/api/v1/accounts/acc-from-b/status')
      .set(auth());
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('rejects inactive projects and inactive accounts', async () => {
    findProjectByRaw.mockResolvedValueOnce({
      apiTokenId: 't1',
      projectId: 'p1',
      projectIsActive: false,
      revoked: false,
    });
    const inactiveProject = await request(app.getHttpServer()).get('/api/v1/accounts').set(auth());
    expect(inactiveProject.status).toBe(403);
    expect(inactiveProject.body.error.code).toBe('PROJECT_INACTIVE');

    prismaMock.whatsappAccount.findFirst.mockResolvedValueOnce({ ...accountA, isActive: false });
    const inactiveAccount = await request(app.getHttpServer())
      .post('/api/v1/accounts/acc-a/messages')
      .set(auth())
      .set(idem())
      .send({ type: 'TEXT', chatId: '37499111222@c.us', text: 'Hi' });
    expect(inactiveAccount.status).toBe(409);
    expect(inactiveAccount.body.error.code).toBe('ACCOUNT_INACTIVE');
  });

  it('sends SEND_ONLY TEXT through the account sessionName', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/accounts/acc-a/messages')
      .set(auth())
      .set(idem('idem-text-0001'))
      .send({ type: 'TEXT', chatId: '37499111222@c.us', text: 'Hello v1' });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(expect.objectContaining({ messageId: 'wmsg1', status: 'sent' }));
    expect(sendText).toHaveBeenCalledWith('wa_aaa', '37499111222@c.us', 'Hello v1');
  });

  it('sends IMAGE and VIDEO without storing mediaUrl', async () => {
    const image = await request(app.getHttpServer())
      .post('/api/v1/accounts/acc-a/messages')
      .set(auth())
      .set(idem('idem-image-0001'))
      .send({
        type: 'IMAGE',
        chatId: '37499111222@c.us',
        mediaUrl: 'https://cdn.example.com/photo.jpg',
      });
    expect(image.status).toBe(200);
    expect(sendImageByUrl).toHaveBeenCalledWith(
      'wa_aaa',
      '37499111222@c.us',
      'https://cdn.example.com/photo.jpg',
      expect.any(Object),
      undefined,
    );
    const video = await request(app.getHttpServer())
      .post('/api/v1/accounts/acc-a/messages')
      .set(auth())
      .set(idem('idem-video-0001'))
      .send({
        type: 'VIDEO',
        chatId: '37499111222@c.us',
        mediaUrl: 'https://cdn.example.com/clip.mp4',
        caption: 'clip',
      });
    expect(video.status).toBe(200);
    const created = prismaMock.outboundMessageLog.create.mock.calls.map(
      (call) => call[0].data as Record<string, unknown>,
    );
    for (const row of created) {
      expect(row).not.toHaveProperty('mediaUrl');
      expect(row).not.toHaveProperty('caption');
      expect(row).not.toHaveProperty('text');
    }
  });

  it('replays the same Idempotency-Key and rejects a conflicting body', async () => {
    prismaMock.outboundMessageIdempotency.findUnique.mockResolvedValueOnce({
      id: 'idemp1',
      requestHash: 'will-not-match',
      status: OutboundIdempotencyStatus.SUCCEEDED,
      requestId: 'req_old',
      messageId: 'w_old',
      sentAt: new Date('2026-08-24T10:00:00.000Z'),
      updatedAt: new Date(),
    });
    const conflict = await request(app.getHttpServer())
      .post('/api/v1/accounts/acc-a/messages')
      .set(auth())
      .set(idem('idem-conflict'))
      .send({ type: 'TEXT', chatId: '37499111222@c.us', text: 'Hello v1' });
    expect(conflict.status).toBe(409);
    expect(conflict.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
    expect(sendText).not.toHaveBeenCalled();
  });

  it('requires Idempotency-Key and rejects unknown DTO fields', async () => {
    const missing = await request(app.getHttpServer())
      .post('/api/v1/accounts/acc-a/messages')
      .set(auth())
      .send({ type: 'TEXT', chatId: '37499111222@c.us', text: 'Hi' });
    expect(missing.status).toBe(400);
    expect(missing.body.error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
    const extra = await request(app.getHttpServer())
      .post('/api/v1/accounts/acc-a/messages')
      .set(auth())
      .set(idem())
      .send({ type: 'TEXT', chatId: '37499111222@c.us', text: 'Hi', extra: true });
    expect(extra.status).toBe(400);
    expect(extra.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('replays the same key without a second WAHA call', async () => {
    const body = { type: 'TEXT' as const, chatId: '37499111222@c.us', text: 'Hello v1' };
    const first = await request(app.getHttpServer())
      .post('/api/v1/accounts/acc-a/messages')
      .set(auth())
      .set(idem('idem-replay-ok'))
      .send(body);
    expect(first.status).toBe(200);
    expect(sendText).toHaveBeenCalledTimes(1);
    prismaMock.outboundMessageIdempotency.findUnique.mockResolvedValue({
      id: 'idemp1',
      whatsappAccountId: 'acc-a',
      requestHash: hashV1SendRequest(body),
      status: OutboundIdempotencyStatus.SUCCEEDED,
      requestId: first.body.data.requestId,
      messageId: 'wmsg1',
      sentAt: new Date('2026-08-24T10:00:00.000Z'),
      updatedAt: new Date(),
    });
    const second = await request(app.getHttpServer())
      .post('/api/v1/accounts/acc-a/messages')
      .set(auth())
      .set(idem('idem-replay-ok'))
      .send(body);
    expect(second.status).toBe(200);
    expect(second.body.data.messageId).toBe('wmsg1');
    expect(sendText).toHaveBeenCalledTimes(1);
  });

  it('replays SUCCEEDED when the account is now disconnected', async () => {
    const body = { type: 'TEXT' as const, chatId: '37499111222@c.us', text: 'Hello v1' };
    prismaMock.whatsappAccount.findFirst.mockResolvedValue({
      ...accountA,
      status: SessionStatus.DISCONNECTED,
    });
    prismaMock.outboundMessageIdempotency.findUnique.mockResolvedValue({
      id: 'idemp1',
      whatsappAccountId: 'acc-a',
      requestHash: hashV1SendRequest(body),
      status: OutboundIdempotencyStatus.SUCCEEDED,
      requestId: 'req_old',
      messageId: 'w_old',
      sentAt: new Date('2026-08-24T10:00:00.000Z'),
      updatedAt: new Date(),
    });
    const res = await request(app.getHttpServer())
      .post('/api/v1/accounts/acc-a/messages')
      .set(auth())
      .set(idem('idem-disc'))
      .send(body);
    expect(res.status).toBe(200);
    expect(res.body.data.messageId).toBe('w_old');
    expect(sendText).not.toHaveBeenCalled();
  });

  it('returns 404 for a cross-project account before revealing idempotency state', async () => {
    prismaMock.whatsappAccount.findFirst.mockResolvedValue(null);
    prismaMock.outboundMessageIdempotency.findUnique.mockImplementation(() => {
      throw new Error('idempotency must not be read for a foreign account');
    });
    const res = await request(app.getHttpServer())
      .post('/api/v1/accounts/acc-from-b/messages')
      .set(auth())
      .set(idem('idem-cross'))
      .send({ type: 'TEXT', chatId: '37499111222@c.us', text: 'Hi' });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('rejects a revoked Project token', async () => {
    findProjectByRaw.mockResolvedValueOnce({
      apiTokenId: 't1',
      projectId: 'p1',
      projectIsActive: true,
      revoked: true,
    });
    const res = await request(app.getHttpServer())
      .post('/api/v1/accounts/acc-a/messages')
      .set(auth())
      .set(idem('idem-revoked'))
      .send({ type: 'TEXT', chatId: '37499111222@c.us', text: 'Hi' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('TOKEN_REVOKED');
    expect(sendText).not.toHaveBeenCalled();
  });

  it('rejects a phone field on v1 send', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/accounts/acc-a/messages')
      .set(auth())
      .set(idem('idem-phone'))
      .send({ type: 'TEXT', chatId: '37499111222@c.us', text: 'Hi', phone: '+37499111222' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('PHONE_NOT_SUPPORTED');
    expect(sendText).not.toHaveBeenCalled();
  });

  it('replays FAILED with the stored error code and never calls WAHA', async () => {
    const body = { type: 'TEXT' as const, chatId: '37499111222@c.us', text: 'Hello v1' };
    const hash = hashV1SendRequest(body);
    prismaMock.outboundMessageIdempotency.findUnique.mockResolvedValueOnce({
      id: 'idemp1',
      whatsappAccountId: 'acc-a',
      requestHash: hash,
      status: OutboundIdempotencyStatus.FAILED,
      errorCode: 'ACCOUNT_INACTIVE',
      updatedAt: new Date(),
    });
    const inactive = await request(app.getHttpServer())
      .post('/api/v1/accounts/acc-a/messages')
      .set(auth())
      .set(idem('idem-failed-inactive'))
      .send(body);
    expect(inactive.status).toBe(409);
    expect(inactive.body.error.code).toBe('ACCOUNT_INACTIVE');
    prismaMock.outboundMessageIdempotency.findUnique.mockResolvedValueOnce({
      id: 'idemp1',
      whatsappAccountId: 'acc-a',
      requestHash: hash,
      status: OutboundIdempotencyStatus.FAILED,
      errorCode: 'MESSAGE_SEND_FAILED',
      updatedAt: new Date(),
    });
    const failed = await request(app.getHttpServer())
      .post('/api/v1/accounts/acc-a/messages')
      .set(auth())
      .set(idem('idem-failed'))
      .send(body);
    expect(failed.status).toBe(502);
    expect(failed.body.error.code).toBe('MESSAGE_SEND_FAILED');
    prismaMock.outboundMessageIdempotency.findUnique.mockResolvedValueOnce({
      id: 'idemp1',
      whatsappAccountId: 'acc-a',
      requestHash: hash,
      status: OutboundIdempotencyStatus.OUTCOME_UNKNOWN,
      updatedAt: new Date(),
    });
    const unknown = await request(app.getHttpServer())
      .post('/api/v1/accounts/acc-a/messages')
      .set(auth())
      .set(idem('idem-unknown'))
      .send(body);
    expect(unknown.status).toBe(503);
    expect(unknown.body.error.code).toBe('MESSAGE_OUTCOME_UNKNOWN');
    expect(sendText).not.toHaveBeenCalled();
  });

  it('reconciles a SENT operational log into a stored result', async () => {
    const body = { type: 'TEXT' as const, chatId: '37499111222@c.us', text: 'Hello v1' };
    prismaMock.outboundMessageIdempotency.findUnique.mockResolvedValue({
      id: 'idemp1',
      whatsappAccountId: 'acc-a',
      idempotencyKey: 'idem-recon',
      requestHash: hashV1SendRequest(body),
      status: OutboundIdempotencyStatus.PROCESSING,
      updatedAt: new Date(Date.now() - 200_000),
    });
    prismaMock.outboundMessageLog.findFirst.mockResolvedValue({
      id: 'log1',
      requestId: 'req_1',
      wahaMessageId: 'waha-recon',
      updatedAt: new Date('2026-08-24T12:00:00.000Z'),
      status: MessageStatus.SENT,
    });
    const res = await request(app.getHttpServer())
      .post('/api/v1/accounts/acc-a/messages')
      .set(auth())
      .set(idem('idem-recon'))
      .send(body);
    expect(res.status).toBe(200);
    expect(res.body.data.messageId).toBe('waha-recon');
    expect(sendText).not.toHaveBeenCalled();
  });

  it('returns OUTCOME_UNKNOWN when persistence fails after WAHA success', async () => {
    prismaMock.outboundMessageLog.updateMany.mockRejectedValueOnce(new Error('db down'));
    const res = await request(app.getHttpServer())
      .post('/api/v1/accounts/acc-a/messages')
      .set(auth())
      .set(idem('idem-persist'))
      .send({ type: 'TEXT', chatId: '37499111222@c.us', text: 'Hi' });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('MESSAGE_OUTCOME_UNKNOWN');
    expect(sendText).toHaveBeenCalled();
  });

  it('returns OUTCOME_UNKNOWN when the post-WAHA transaction rolls back', async () => {
    const tx = (prismaMock as { $transaction: jest.Mock }).$transaction;
    const originalTx = tx.getMockImplementation();
    let txCalls = 0;
    tx.mockImplementation(async (fn: (client: typeof prismaMock) => unknown) => {
      txCalls += 1;
      if (txCalls === 1) return fn(prismaMock);
      throw new Error('tx rollback');
    });
    try {
      const res = await request(app.getHttpServer())
        .post('/api/v1/accounts/acc-a/messages')
        .set(auth())
        .set(idem('idem-tx-rollback'))
        .send({ type: 'TEXT', chatId: '37499111222@c.us', text: 'Hi' });
      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe('MESSAGE_OUTCOME_UNKNOWN');
      expect(sendText).toHaveBeenCalled();
      const failedWrites = prismaMock.outboundMessageLog.updateMany.mock.calls.filter(
        (call) => (call[0] as { data?: { status?: string } }).data?.status === 'FAILED',
      );
      expect(failedWrites).toHaveLength(0);
    } finally {
      if (originalTx) tx.mockImplementation(originalTx);
    }
  });

  it('replays SUCCEEDED without re-checking media URL or current caption limit', async () => {
    const body = {
      type: 'IMAGE' as const,
      chatId: '37499111222@c.us',
      mediaUrl: 'http://127.0.0.1/gone.jpg',
      caption: 'x'.repeat(5000),
    };
    prismaMock.outboundMessageIdempotency.findUnique.mockResolvedValue({
      id: 'idemp1',
      whatsappAccountId: 'acc-a',
      requestHash: hashV1SendRequest(body),
      status: OutboundIdempotencyStatus.SUCCEEDED,
      requestId: 'req_old',
      messageId: 'w_old',
      sentAt: new Date('2026-08-24T10:00:00.000Z'),
      updatedAt: new Date(),
    });
    const res = await request(app.getHttpServer())
      .post('/api/v1/accounts/acc-a/messages')
      .set(auth())
      .set(idem('idem-media-replay'))
      .send(body);
    expect(res.status).toBe(200);
    expect(res.body.data.messageId).toBe('w_old');
    expect(sendImageByUrl).not.toHaveBeenCalled();
  });
});
