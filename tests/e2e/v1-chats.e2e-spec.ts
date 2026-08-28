import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { SessionStatus, WhatsappAccountMode } from '@prisma/client';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ApiTokensService } from '../../src/api-tokens/api-tokens.service';
import { WahaClient } from '../../src/waha/waha.client';
import { generateApiToken } from '../../src/common/utils/tokens';

describe('v1 chats API (e2e)', () => {
  let app: INestApplication;
  const prefix = process.env.API_TOKEN_PREFIX ?? 'gw_test';
  const findProjectByRaw = jest.fn();
  const listChats = jest.fn();
  const listChatMessages = jest.fn();
  const isNowebStoreEnabled = jest.fn();

  const messengerAccount = {
    id: 'acc-m',
    projectId: 'p1',
    label: 'Messenger',
    mode: WhatsappAccountMode.MESSENGER,
    sessionName: 'wa_m',
    status: SessionStatus.CONNECTED,
    phoneNumber: '37499111222',
    isActive: true,
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    updatedAt: new Date('2026-08-01T00:00:00.000Z'),
  };

  const sendOnlyAccount = {
    ...messengerAccount,
    id: 'acc-s',
    sessionName: 'wa_s',
    mode: WhatsappAccountMode.SEND_ONLY,
    label: 'Send only',
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
      findMany: jest.fn(),
      update: jest.fn(),
    },
    apiToken: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    outboundMessageLog: {
      create: jest.fn(),
      updateMany: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    outboundMessageIdempotency: { findUnique: jest.fn(), create: jest.fn(), updateMany: jest.fn() },
    groupApiOperation: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    $transaction: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .overrideProvider(ApiTokensService)
      .useValue({
        findProjectByRaw,
        findValidByRaw: jest.fn(),
        touchLastUsed: jest.fn(),
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
        getStatus: jest.fn(),
        getQr: jest.fn(),
        sendText: jest.fn(),
        sendImageByUrl: jest.fn(),
        sendVideoByUrl: jest.fn(),
        listChats,
        listChatMessages,
        isNowebStoreEnabled,
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
    isNowebStoreEnabled.mockResolvedValue(true);
    listChats.mockResolvedValue([
      { id: '37499111222@c.us', name: 'John', lastMessage: { timestamp: 1_727_745_026 } },
    ]);
    listChatMessages.mockResolvedValue([
      {
        id: 'm1',
        timestamp: 1_727_745_026,
        fromMe: false,
        body: 'Hello from store',
        hasMedia: false,
        ackName: 'READ',
        _data: { secret: true },
      },
    ]);
  });

  const auth = () => ({ Authorization: `Bearer ${generateApiToken(prefix).raw}` });

  it('returns 409 for SEND_ONLY accounts', async () => {
    prismaMock.whatsappAccount.findFirst.mockResolvedValue(sendOnlyAccount);
    const res = await request(app.getHttpServer()).get('/api/v1/accounts/acc-s/chats').set(auth());
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ACCOUNT_MODE_NOT_SUPPORTED');
    expect(listChats).not.toHaveBeenCalled();
  });

  it('returns 404 for cross-project account access', async () => {
    prismaMock.whatsappAccount.findFirst.mockResolvedValue(null);
    const res = await request(app.getHttpServer())
      .get('/api/v1/accounts/acc-other/chats')
      .set(auth());
    expect(res.status).toBe(404);
    expect(listChats).not.toHaveBeenCalled();
  });

  it('returns sanitized chats for MESSENGER accounts', async () => {
    prismaMock.whatsappAccount.findFirst.mockResolvedValue(messengerAccount);
    const res = await request(app.getHttpServer())
      .get('/api/v1/accounts/acc-m/chats?limit=10&offset=0')
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.items[0].id).toBe('37499111222@c.us');
    expect(JSON.stringify(res.body)).not.toContain('sessionName');
    expect(JSON.stringify(res.body)).not.toContain('_data');
    expect(listChats).toHaveBeenCalledWith(
      'wa_m',
      expect.objectContaining({ limit: 10, offset: 0 }),
    );
  });

  it('returns message bodies capped by MAX_TEXT_LENGTH', async () => {
    prismaMock.whatsappAccount.findFirst.mockResolvedValue(messengerAccount);
    const chatId = encodeURIComponent('37499111222@c.us');
    const res = await request(app.getHttpServer())
      .get(`/api/v1/accounts/acc-m/chats/${chatId}/messages`)
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.items[0].body).toBe('Hello from store');
    expect(listChatMessages).toHaveBeenCalledWith('wa_m', '37499111222@c.us', {
      limit: 100,
      offset: 0,
    });
  });

  it('returns STORE_NOT_READY when WAHA store is disabled', async () => {
    prismaMock.whatsappAccount.findFirst.mockResolvedValue(messengerAccount);
    isNowebStoreEnabled.mockResolvedValue(false);
    const res = await request(app.getHttpServer()).get('/api/v1/accounts/acc-m/chats').set(auth());
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('STORE_NOT_READY');
  });

  it('returns 409 when the account is disconnected', async () => {
    prismaMock.whatsappAccount.findFirst.mockResolvedValue({
      ...messengerAccount,
      status: SessionStatus.DISCONNECTED,
    });
    const res = await request(app.getHttpServer()).get('/api/v1/accounts/acc-m/chats').set(auth());
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('WHATSAPP_NOT_CONNECTED');
  });
});
