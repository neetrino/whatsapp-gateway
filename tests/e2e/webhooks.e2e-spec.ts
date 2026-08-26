import { Test } from '@nestjs/testing';

import { ConfigService } from '@nestjs/config';

import type { NestExpressApplication } from '@nestjs/platform-express';

import request from 'supertest';

import { WhatsappAccountMode } from '@prisma/client';

import { AppModule } from '../../src/app.module';

import type { EnvironmentVariables } from '../../src/config/env.validation';

import { attachGatewayMiddleware } from '../../src/common/http/body-parser';

import { PrismaService } from '../../src/prisma/prisma.service';

import { computeWahaWebhookHmac } from '../../src/webhooks/waha-hmac';



describe('WAHA inbound + project webhooks (e2e)', () => {

  let app: NestExpressApplication;

  let wahaWebhookSecret: string;



  const prismaMock = {

    onModuleInit: async () => {},

    onModuleDestroy: async () => {},

    $connect: jest.fn(),

    $disconnect: jest.fn(),

    $queryRaw: jest.fn().mockResolvedValue([{ ok: 1 }]),

    admin: { findUnique: jest.fn() },

    project: {

      count: jest.fn().mockResolvedValue(0),

      findUnique: jest.fn().mockResolvedValue({

        webhookEnabled: false,

        webhookUrl: null,

        webhookSecretHash: null,

        isActive: true,

      }),

      findMany: jest.fn(),

    },

    whatsappAccount: { findFirst: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },

    apiToken: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },

    outboundMessageLog: { create: jest.fn(), updateMany: jest.fn(), findFirst: jest.fn(), findMany: jest.fn() },

    outboundMessageIdempotency: { findUnique: jest.fn(), create: jest.fn(), updateMany: jest.fn() },

    groupApiOperation: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },

    projectWebhookDelivery: {

      create: jest.fn().mockResolvedValue({ id: 'd1' }),

      update: jest.fn(),

      findMany: jest.fn().mockResolvedValue([]),

      findUnique: jest.fn(),

      groupBy: jest.fn().mockResolvedValue([]),

    },

    $transaction: jest.fn(),

  };



  beforeAll(async () => {

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })

      .overrideProvider(PrismaService)

      .useValue(prismaMock)

      .compile();

    app = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false });

    attachGatewayMiddleware(app);

    await app.init();

    wahaWebhookSecret = app

      .get<ConfigService<EnvironmentVariables, true>>(ConfigService)

      .get('WAHA_WEBHOOK_SECRET', { infer: true });

  });



  afterAll(async () => {

    await app.close();

  });



  beforeEach(() => {

    jest.clearAllMocks();

    prismaMock.whatsappAccount.findUnique.mockResolvedValue({

      id: 'acc_m',

      projectId: 'p1',

      mode: WhatsappAccountMode.MESSENGER,

      isActive: true,

    });

  });



  const postEvent = (body: Record<string, unknown>) => {

    const rawString = JSON.stringify(body);

    const rawBody = Buffer.from(rawString, 'utf8');

    return request(app.getHttpServer())

      .post('/internal/waha/events')

      .set('X-Webhook-Hmac', computeWahaWebhookHmac(rawBody, wahaWebhookSecret))

      .set('X-Webhook-Hmac-Algorithm', 'sha512')

      .set('X-Webhook-Request-Id', 'waha_req_1')

      .set('X-Webhook-Timestamp', String(Date.now()))

      .set('Content-Type', 'application/json')

      .send(rawString);

  };



  it('accepts signed WAHA events for known MESSENGER sessions', async () => {

    const res = await postEvent({

      event: 'message',

      session: 'wa_m',

      payload: {

        id: 'm1',

        timestamp: 1_727_745_026,

        from: '37499111222@c.us',

        fromMe: false,

        body: 'Hello',

      },

    });

    expect(res.status).toBe(200);

    expect(res.body.received).toBe(true);

    expect(prismaMock.projectWebhookDelivery.create).toHaveBeenCalled();

  });



  it('rejects invalid HMAC', async () => {

    const res = await request(app.getHttpServer())

      .post('/internal/waha/events')

      .set('X-Webhook-Hmac', 'invalid')

      .set('X-Webhook-Hmac-Algorithm', 'sha512')

      .set('X-Webhook-Timestamp', String(Date.now()))

      .send({ event: 'message', session: 'wa_m', payload: {} });

    expect(res.status).toBe(401);

  });



  it('drops unknown sessions with 200', async () => {

    prismaMock.whatsappAccount.findUnique.mockResolvedValue(null);

    const res = await postEvent({ event: 'message', session: 'missing', payload: {} });

    expect(res.status).toBe(200);

    expect(prismaMock.projectWebhookDelivery.create).not.toHaveBeenCalled();

  });



  it('drops SEND_ONLY sessions with 200', async () => {

    prismaMock.whatsappAccount.findUnique.mockResolvedValue({

      id: 'acc_s',

      projectId: 'p1',

      mode: WhatsappAccountMode.SEND_ONLY,

      isActive: true,

    });

    const res = await postEvent({ event: 'message', session: 'wa_s', payload: { id: 'm1' } });

    expect(res.status).toBe(200);

    expect(prismaMock.projectWebhookDelivery.create).not.toHaveBeenCalled();

  });



  it('skips RATE_LIMIT_SEND throttling', async () => {
    for (let i = 0; i < 80; i += 1) {
      const res = await postEvent({
        event: 'message',
        session: 'wa_m',
        payload: { id: `m${i}`, from: '37499111222@c.us' },
      });
      expect(res.status).toBe(200);
    }
  });
});

