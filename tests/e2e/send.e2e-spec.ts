import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ApiTokensService } from '../../src/api-tokens/api-tokens.service';
import { WahaClient } from '../../src/waha/waha.client';
import { SessionStatus } from '@prisma/client';
import { generateApiToken, hashApiToken } from '../../src/common/utils/tokens';

describe('POST /api/messages/send (e2e)', () => {
  let app: INestApplication;
  const pepper = process.env.TOKEN_PEPPER ?? '';
  const prefix = process.env.API_TOKEN_PREFIX ?? 'gw_test';

  const findValidByRaw = jest.fn();
  const touchLastUsed = jest.fn();
  const sendText = jest.fn();

  const prismaMock = {
    onModuleInit: async () => {},
    onModuleDestroy: async () => {},
    $connect: jest.fn().mockResolvedValue(undefined),
    $disconnect: jest.fn().mockResolvedValue(undefined),
    $queryRaw: jest.fn().mockResolvedValue([{ ok: 1 }]),
    user: { count: jest.fn().mockResolvedValue(0) },
    whatsappAccount: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'acc1',
        sessionName: 'wa_test',
        isActive: true,
        status: SessionStatus.CONNECTED,
      }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    apiToken: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    outboundMessageLog: {
      create: jest.fn().mockResolvedValue({ id: 'log1' }),
      update: jest.fn().mockResolvedValue(undefined),
    },
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .overrideProvider(ApiTokensService)
      .useValue({
        findValidByRaw,
        touchLastUsed,
        create: jest.fn(),
        listAll: jest.fn(),
        listForAccount: jest.fn(),
        revoke: jest.fn(),
        regenerate: jest.fn(),
      })
      .overrideProvider(WahaClient)
      .useValue({
        healthCheck: jest.fn().mockResolvedValue(true),
        startSession: jest.fn(),
        stopSession: jest.fn(),
        restartSession: jest.fn(),
        getStatus: jest.fn(),
        getQr: jest.fn(),
        sendText,
        sendImageByUrl: jest.fn(),
        sendVideoByUrl: jest.fn(),
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
    prismaMock.whatsappAccount.findUnique.mockResolvedValue({
      id: 'acc1',
      sessionName: 'wa_test',
      isActive: true,
      status: SessionStatus.CONNECTED,
    });
  });

  const authHeaderForRaw = (raw: string): { Authorization: string } => ({
    Authorization: `Bearer ${raw}`,
  });

  it('returns 401 when Authorization header is missing', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/messages/send')
      .send({ chatId: '37499111222@c.us', text: 'Hi' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 401 for invalid token', async () => {
    findValidByRaw.mockResolvedValueOnce(null);
    const res = await request(app.getHttpServer())
      .post('/api/messages/send')
      .set(authHeaderForRaw(`${prefix}_invalid`))
      .send({ chatId: '37499111222@c.us', text: 'Hi' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
  });

  it('returns 403 for revoked token', async () => {
    findValidByRaw.mockResolvedValueOnce({
      apiTokenId: 't1',
      whatsappAccountId: 'acc1',
      sessionName: 'wa_test',
      revoked: true,
    });
    const res = await request(app.getHttpServer())
      .post('/api/messages/send')
      .set(authHeaderForRaw(`${prefix}_revoked`))
      .send({ chatId: '37499111222@c.us', text: 'Hi' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('TOKEN_REVOKED');
  });

  it('returns PHONE_NOT_SUPPORTED when phone is present', async () => {
    const raw = generateApiToken(prefix).raw;
    findValidByRaw.mockResolvedValue({
      apiTokenId: 't1',
      whatsappAccountId: 'acc1',
      sessionName: 'wa_test',
      revoked: false,
    });

    const res = await request(app.getHttpServer())
      .post('/api/messages/send')
      .set(authHeaderForRaw(raw))
      .send({ phone: '+37499111222', chatId: '37499111222@c.us', text: 'Hi' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('PHONE_NOT_SUPPORTED');
  });

  it('returns INVALID_CHAT_ID for bad suffix', async () => {
    const raw = generateApiToken(prefix).raw;
    findValidByRaw.mockResolvedValue({
      apiTokenId: 't1',
      whatsappAccountId: 'acc1',
      sessionName: 'wa_test',
      revoked: false,
    });

    const res = await request(app.getHttpServer())
      .post('/api/messages/send')
      .set(authHeaderForRaw(raw))
      .send({ chatId: '37499111222@bad.us', text: 'Hi' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_CHAT_ID');
  });

  it('returns 200 and sends text unchanged on success', async () => {
    const raw = generateApiToken(prefix).raw;
    findValidByRaw.mockImplementation(async (token: string) => {
      const expectedHash = hashApiToken(raw, pepper);
      const actualHash = hashApiToken(token, pepper);
      if (actualHash !== expectedHash) return null;
      return {
        apiTokenId: 't1',
        whatsappAccountId: 'acc1',
        sessionName: 'wa_test',
        revoked: false,
      };
    });
    sendText.mockResolvedValue({ id: 'wmsg1' });

    const res = await request(app.getHttpServer())
      .post('/api/messages/send')
      .set(authHeaderForRaw(raw))
      .send({ chatId: '37499111222@c.us', text: 'Name: should not be added' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('sent');
    expect(sendText).toHaveBeenCalledWith(
      'wa_test',
      '37499111222@c.us',
      'Name: should not be added',
    );
  });

  it('accepts @g.us group chatId', async () => {
    const raw = generateApiToken(prefix).raw;
    findValidByRaw.mockResolvedValue({
      apiTokenId: 't1',
      whatsappAccountId: 'acc1',
      sessionName: 'wa_test',
      revoked: false,
    });
    sendText.mockResolvedValue({ id: 'wmsg2' });

    const res = await request(app.getHttpServer())
      .post('/api/messages/send')
      .set(authHeaderForRaw(raw))
      .send({ chatId: '120363123456789012@g.us', text: 'Hello all' });

    expect(res.status).toBe(200);
    expect(sendText).toHaveBeenCalledWith('wa_test', '120363123456789012@g.us', 'Hello all');
  });

  it('returns WHATSAPP_NOT_CONNECTED when session is not CONNECTED', async () => {
    const raw = generateApiToken(prefix).raw;
    findValidByRaw.mockResolvedValue({
      apiTokenId: 't1',
      whatsappAccountId: 'acc1',
      sessionName: 'wa_test',
      revoked: false,
    });
    prismaMock.whatsappAccount.findUnique.mockResolvedValueOnce({
      id: 'acc1',
      sessionName: 'wa_test',
      isActive: true,
      status: SessionStatus.QR_REQUIRED,
    });

    const res = await request(app.getHttpServer())
      .post('/api/messages/send')
      .set(authHeaderForRaw(raw))
      .send({ chatId: '37499111222@c.us', text: 'Hi' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('WHATSAPP_NOT_CONNECTED');
  });
});
