import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ApiTokensService } from '../../src/api-tokens/api-tokens.service';
import { WahaClient } from '../../src/waha/waha.client';
import { generateApiToken } from '../../src/common/utils/tokens';

describe('v1 token rate limiting (e2e)', () => {
  let app: INestApplication;
  const previousSend = process.env.RATE_LIMIT_SEND;
  const previousV1Send = process.env.RATE_LIMIT_V1_SEND;
  const previousV1Read = process.env.RATE_LIMIT_V1_READ;
  const findProjectByRaw = jest.fn().mockResolvedValue({
    apiTokenId: 't1',
    projectId: 'p1',
    projectIsActive: true,
    revoked: false,
  });

  beforeAll(async () => {
    process.env.RATE_LIMIT_SEND = '1';
    process.env.RATE_LIMIT_V1_SEND = '2';
    process.env.RATE_LIMIT_V1_READ = '10';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({
        onModuleInit: async () => {},
        onModuleDestroy: async () => {},
        $connect: jest.fn(),
        $disconnect: jest.fn(),
        $queryRaw: jest.fn().mockResolvedValue([{ ok: 1 }]),
        admin: { findUnique: jest.fn() },
        project: {
          count: jest.fn().mockResolvedValue(0),
          findUnique: jest.fn(),
          findMany: jest.fn(),
        },
        whatsappAccount: {
          findFirst: jest.fn().mockResolvedValue(null),
          findMany: jest.fn().mockResolvedValue([]),
        },
        apiToken: { findMany: jest.fn(), findUnique: jest.fn() },
      })
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
      })
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    process.env.RATE_LIMIT_SEND = previousSend;
    process.env.RATE_LIMIT_V1_SEND = previousV1Send;
    process.env.RATE_LIMIT_V1_READ = previousV1Read;
    await app.close();
  });

  const prefix = process.env.API_TOKEN_PREFIX ?? 'gw_test';

  const send = (raw: string) =>
    request(app.getHttpServer())
      .post('/api/v1/accounts/acc-a/messages')
      .set({ Authorization: `Bearer ${raw}` })
      .send({ type: 'TEXT', chatId: '37499111222@c.us', text: 'Hi' });

  it('returns RATE_LIMITED after the v1 send budget is exhausted for a token', async () => {
    const raw = generateApiToken(prefix).raw;
    const first = await send(raw);
    const second = await send(raw);
    const third = await send(raw);
    expect(first.status).not.toBe(429);
    expect(second.status).not.toBe(429);
    expect(third.status).toBe(429);
    expect(third.body.error.code).toBe('RATE_LIMITED');
  });

  it('does not apply RATE_LIMIT_SEND to v1 reads', async () => {
    const raw = generateApiToken(prefix).raw;
    const headers = { Authorization: `Bearer ${raw}` };
    const one = await request(app.getHttpServer()).get('/api/v1/accounts').set(headers);
    const two = await request(app.getHttpServer()).get('/api/v1/accounts').set(headers);
    const three = await request(app.getHttpServer()).get('/api/v1/accounts').set(headers);
    expect(one.status).not.toBe(429);
    expect(two.status).not.toBe(429);
    expect(three.status).not.toBe(429);
  });

  it('keeps send and read budgets independent and tokens isolated', async () => {
    const sendToken = generateApiToken(prefix).raw;
    await send(sendToken);
    await send(sendToken);
    const sendBlocked = await send(sendToken);
    expect(sendBlocked.status).toBe(429);
    const readOk = await request(app.getHttpServer())
      .get('/api/v1/accounts')
      .set({ Authorization: `Bearer ${sendToken}` });
    expect(readOk.status).not.toBe(429);
    const other = generateApiToken(prefix).raw;
    const otherFirst = await send(other);
    expect(otherFirst.status).not.toBe(429);
  });
});
