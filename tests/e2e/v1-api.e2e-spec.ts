import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { SessionStatus, WhatsappAccountMode } from '../../src/common/db-enums';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ApiTokensService } from '../../src/api-tokens/api-tokens.service';
import { WahaClient } from '../../src/waha/waha.client';
import { generateApiToken } from '../../src/common/utils/tokens';
import { WahaApiError, WahaTransportError } from '../../src/waha/types/waha.types';
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
  };

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
    getStatus.mockResolvedValue({ status: 'WORKING', me: { id: '37499111222@c.us' } });
    sendText.mockResolvedValue({ id: 'wmsg1' });
    sendImageByUrl.mockResolvedValue({ id: 'wimg1' });
    sendVideoByUrl.mockResolvedValue({ id: 'wvid1' });
  });

  const auth = () => ({ Authorization: `Bearer ${generateApiToken(prefix).raw}` });

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
      .send({ type: 'TEXT', chatId: '37499111222@c.us', text: 'Hi' });
    expect(inactiveAccount.status).toBe(409);
    expect(inactiveAccount.body.error.code).toBe('ACCOUNT_INACTIVE');
  });

  it('sends SEND_ONLY TEXT through the account sessionName without Idempotency-Key', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/accounts/acc-a/messages')
      .set(auth())
      .send({ type: 'TEXT', chatId: '37499111222@c.us', text: 'Hello v1' });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(expect.objectContaining({ messageId: 'wmsg1', status: 'sent' }));
    expect(sendText).toHaveBeenCalledWith('wa_aaa', '37499111222@c.us', 'Hello v1');
  });

  it('sends IMAGE and VIDEO through WAHA', async () => {
    const image = await request(app.getHttpServer())
      .post('/api/v1/accounts/acc-a/messages')
      .set(auth())
      .send({
        type: 'IMAGE',
        chatId: '37499111222@c.us',
        mediaUrl: 'https://cdn.example.com/photo.jpg',
      });
    expect(image.status).toBe(200);
    expect(image.body.data).toEqual(expect.objectContaining({ messageId: 'wimg1', status: 'sent' }));
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
      .send({
        type: 'VIDEO',
        chatId: '37499111222@c.us',
        mediaUrl: 'https://cdn.example.com/clip.mp4',
        caption: 'clip',
      });
    expect(video.status).toBe(200);
    expect(sendVideoByUrl).toHaveBeenCalled();
    expect(video.body.data.messageId).toBe('wvid1');
  });

  it('rejects unknown DTO fields', async () => {
    const extra = await request(app.getHttpServer())
      .post('/api/v1/accounts/acc-a/messages')
      .set(auth())
      .send({ type: 'TEXT', chatId: '37499111222@c.us', text: 'Hi', extra: true });
    expect(extra.status).toBe(400);
    expect(extra.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 404 for a cross-project account before calling WAHA', async () => {
    prismaMock.whatsappAccount.findFirst.mockResolvedValue(null);
    const res = await request(app.getHttpServer())
      .post('/api/v1/accounts/acc-from-b/messages')
      .set(auth())
      .send({ type: 'TEXT', chatId: '37499111222@c.us', text: 'Hi' });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(sendText).not.toHaveBeenCalled();
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
      .send({ type: 'TEXT', chatId: '37499111222@c.us', text: 'Hi' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('TOKEN_REVOKED');
    expect(sendText).not.toHaveBeenCalled();
  });

  it('rejects a phone field on v1 send', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/accounts/acc-a/messages')
      .set(auth())
      .send({ type: 'TEXT', chatId: '37499111222@c.us', text: 'Hi', phone: '+37499111222' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('PHONE_NOT_SUPPORTED');
    expect(sendText).not.toHaveBeenCalled();
  });

  it('returns WHATSAPP_NOT_CONNECTED when the account is disconnected', async () => {
    prismaMock.whatsappAccount.findFirst.mockResolvedValue({
      ...accountA,
      status: SessionStatus.DISCONNECTED,
    });
    const res = await request(app.getHttpServer())
      .post('/api/v1/accounts/acc-a/messages')
      .set(auth())
      .send({ type: 'TEXT', chatId: '37499111222@c.us', text: 'Hello v1' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('WHATSAPP_NOT_CONNECTED');
    expect(sendText).not.toHaveBeenCalled();
  });

  it('maps WAHA transport errors to WAHA_UNAVAILABLE', async () => {
    sendText.mockRejectedValueOnce(new WahaTransportError('timeout'));
    const res = await request(app.getHttpServer())
      .post('/api/v1/accounts/acc-a/messages')
      .set(auth())
      .send({ type: 'TEXT', chatId: '37499111222@c.us', text: 'Hi' });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('WAHA_UNAVAILABLE');
  });

  it('maps WAHA API errors to MESSAGE_SEND_FAILED', async () => {
    sendText.mockRejectedValueOnce(new WahaApiError('bad', 500));
    const res = await request(app.getHttpServer())
      .post('/api/v1/accounts/acc-a/messages')
      .set(auth())
      .send({ type: 'TEXT', chatId: '37499111222@c.us', text: 'Hi' });
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('MESSAGE_SEND_FAILED');
  });
});
