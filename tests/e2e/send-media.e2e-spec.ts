import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ApiTokensService } from '../../src/api-tokens/api-tokens.service';
import { WahaClient } from '../../src/waha/waha.client';
import { SessionStatus } from '@prisma/client';
import { generateApiToken } from '../../src/common/utils/tokens';
import { WahaApiError, WahaTransportError } from '../../src/waha/types/waha.types';
import dns from 'node:dns/promises';
import type { LookupAddress, LookupOptions } from 'node:dns';

describe('POST /api/messages/send-media (e2e)', () => {
  let app: INestApplication;
  const prefix = process.env.API_TOKEN_PREFIX ?? 'gw_test';

  const findValidByRaw = jest.fn();
  const touchLastUsed = jest.fn();
  const sendText = jest.fn();
  const sendImageByUrl = jest.fn();
  const sendVideoByUrl = jest.fn();

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

  const validBody = {
    chatId: '37499111222@c.us',
    mediaType: 'IMAGE' as const,
    mediaUrl: 'https://cdn.example.com/photo.jpg',
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
        sendImageByUrl,
        sendVideoByUrl,
      })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    jest.restoreAllMocks();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    findValidByRaw.mockResolvedValue({
      apiTokenId: 't1',
      whatsappAccountId: 'acc1',
      sessionName: 'wa_test',
      revoked: false,
    });
    prismaMock.whatsappAccount.findUnique.mockResolvedValue({
      id: 'acc1',
      sessionName: 'wa_test',
      isActive: true,
      status: SessionStatus.CONNECTED,
    });
    sendImageByUrl.mockResolvedValue({ id: 'wimg1' });
    sendVideoByUrl.mockResolvedValue({ id: 'wvid1' });
  });

  const auth = (raw: string) => ({ Authorization: `Bearer ${raw}` });

  it('rejects missing chatId', async () => {
    const raw = generateApiToken(prefix).raw;
    const res = await request(app.getHttpServer())
      .post('/api/messages/send-media')
      .set(auth(raw))
      .send({ mediaType: 'IMAGE', mediaUrl: 'https://cdn.example.com/a.jpg' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_CHAT_ID');
  });

  it('rejects missing mediaType', async () => {
    const raw = generateApiToken(prefix).raw;
    const res = await request(app.getHttpServer())
      .post('/api/messages/send-media')
      .set(auth(raw))
      .send({ chatId: '37499111222@c.us', mediaUrl: 'https://cdn.example.com/a.jpg' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_MEDIA_TYPE');
  });

  it('rejects invalid mediaType', async () => {
    const raw = generateApiToken(prefix).raw;
    const res = await request(app.getHttpServer())
      .post('/api/messages/send-media')
      .set(auth(raw))
      .send({
        chatId: '37499111222@c.us',
        mediaType: 'AUDIO',
        mediaUrl: 'https://cdn.example.com/a.jpg',
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_MEDIA_TYPE');
  });

  it('rejects phone', async () => {
    const raw = generateApiToken(prefix).raw;
    const res = await request(app.getHttpServer())
      .post('/api/messages/send-media')
      .set(auth(raw))
      .send({ ...validBody, phone: '+1' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('PHONE_NOT_SUPPORTED');
  });

  it('rejects invalid chatId', async () => {
    const raw = generateApiToken(prefix).raw;
    const res = await request(app.getHttpServer())
      .post('/api/messages/send-media')
      .set(auth(raw))
      .send({
        chatId: 'x@bad.us',
        mediaType: 'IMAGE',
        mediaUrl: 'https://cdn.example.com/a.jpg',
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_CHAT_ID');
  });

  it.each([
    ['http://example.com/a.jpg'],
    ['file:///C:/a.jpg'],
    ['https://localhost/a.jpg'],
    ['https://127.0.0.1/a.jpg'],
    ['https://10.0.0.1/a.jpg'],
    ['https://192.168.1.1/a.jpg'],
    ['https://host.docker.internal/a.jpg'],
  ])('rejects bad mediaUrl %s', async (mediaUrl) => {
    const raw = generateApiToken(prefix).raw;
    const res = await request(app.getHttpServer())
      .post('/api/messages/send-media')
      .set(auth(raw))
      .send({ ...validBody, mediaUrl });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_MEDIA_URL');
  });

  it('sends IMAGE via sendImageByUrl with caption unchanged', async () => {
    const raw = generateApiToken(prefix).raw;
    const res = await request(app.getHttpServer())
      .post('/api/messages/send-media')
      .set(auth(raw))
      .send({
        ...validBody,
        caption: 'Name: no prefix',
      });
    expect(res.status).toBe(200);
    expect(sendImageByUrl).toHaveBeenCalledWith(
      'wa_test',
      '37499111222@c.us',
      'https://cdn.example.com/photo.jpg',
      expect.objectContaining({ mimetype: 'image/jpeg' }),
      'Name: no prefix',
    );
    expect(sendText).not.toHaveBeenCalled();
  });

  it('sends VIDEO via sendVideoByUrl', async () => {
    const raw = generateApiToken(prefix).raw;
    const res = await request(app.getHttpServer())
      .post('/api/messages/send-media')
      .set(auth(raw))
      .send({
        chatId: '120363123456789012@g.us',
        mediaType: 'VIDEO',
        mediaUrl: 'https://cdn.example.com/v.mp4',
      });
    expect(res.status).toBe(200);
    expect(sendVideoByUrl).toHaveBeenCalled();
    expect(sendText).not.toHaveBeenCalled();
  });

  it('returns WHATSAPP_NOT_CONNECTED when disconnected', async () => {
    const raw = generateApiToken(prefix).raw;
    prismaMock.whatsappAccount.findUnique.mockResolvedValueOnce({
      id: 'acc1',
      sessionName: 'wa_test',
      isActive: true,
      status: SessionStatus.DISCONNECTED,
    });
    const res = await request(app.getHttpServer())
      .post('/api/messages/send-media')
      .set(auth(raw))
      .send(validBody);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('WHATSAPP_NOT_CONNECTED');
  });

  it('returns WAHA_UNAVAILABLE on transport error', async () => {
    const raw = generateApiToken(prefix).raw;
    sendImageByUrl.mockRejectedValueOnce(new WahaTransportError('econnrefused'));
    const res = await request(app.getHttpServer())
      .post('/api/messages/send-media')
      .set(auth(raw))
      .send(validBody);
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('WAHA_UNAVAILABLE');
  });

  it('returns IMAGE_SEND_FAILED on WAHA API error', async () => {
    const raw = generateApiToken(prefix).raw;
    sendImageByUrl.mockRejectedValueOnce(new WahaApiError('bad', 500));
    const res = await request(app.getHttpServer())
      .post('/api/messages/send-media')
      .set(auth(raw))
      .send(validBody);
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('IMAGE_SEND_FAILED');
  });

  it('returns VIDEO_SEND_FAILED for video WAHA API error', async () => {
    const raw = generateApiToken(prefix).raw;
    sendVideoByUrl.mockRejectedValueOnce(new WahaApiError('bad', 500));
    const res = await request(app.getHttpServer())
      .post('/api/messages/send-media')
      .set(auth(raw))
      .send({
        chatId: '37499111222@c.us',
        mediaType: 'VIDEO',
        mediaUrl: 'https://cdn.example.com/v.mp4',
      });
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('VIDEO_SEND_FAILED');
  });

  it('stores messageType in log, not mediaUrl', async () => {
    const raw = generateApiToken(prefix).raw;
    await request(app.getHttpServer())
      .post('/api/messages/send-media')
      .set(auth(raw))
      .send(validBody);
    expect(prismaMock.outboundMessageLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        messageType: 'IMAGE',
        chatId: '37499111222@c.us',
      }),
    });
    const data = prismaMock.outboundMessageLog.create.mock.calls[0][0].data;
    expect(data).not.toHaveProperty('mediaUrl');
    expect(data).not.toHaveProperty('caption');
  });

  it('rejects missing mediaUrl', async () => {
    const raw = generateApiToken(prefix).raw;
    const res = await request(app.getHttpServer())
      .post('/api/messages/send-media')
      .set(auth(raw))
      .send({ chatId: '37499111222@c.us', mediaType: 'IMAGE' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('uses sessionName from database row for token whatsappAccountId', async () => {
    const raw = generateApiToken(prefix).raw;
    findValidByRaw.mockResolvedValue({
      apiTokenId: 't1',
      whatsappAccountId: 'acc1',
      sessionName: 'ignored_from_token',
      revoked: false,
    });
    prismaMock.whatsappAccount.findUnique.mockResolvedValue({
      id: 'acc1',
      sessionName: 'from_db_session',
      isActive: true,
      status: SessionStatus.CONNECTED,
    });
    await request(app.getHttpServer())
      .post('/api/messages/send-media')
      .set(auth(raw))
      .send(validBody);
    expect(sendImageByUrl).toHaveBeenCalledWith(
      'from_db_session',
      '37499111222@c.us',
      expect.any(String),
      expect.any(Object),
      undefined,
    );
  });
});
