import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { WahaClient } from '../../src/waha/waha.client';
import { ApiTokensService } from '../../src/api-tokens/api-tokens.service';

describe('Dashboard route safety (e2e)', () => {
  let app: INestApplication;

  const prismaMock = {
    onModuleInit: async () => {},
    onModuleDestroy: async () => {},
    $connect: jest.fn().mockResolvedValue(undefined),
    $disconnect: jest.fn().mockResolvedValue(undefined),
    $queryRaw: jest.fn().mockResolvedValue([{ ok: 1 }]),
    admin: { findUnique: jest.fn(), count: jest.fn() },
    project: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
    },
    whatsappAccount: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
    },
    apiToken: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn() },
    outboundMessageLog: { findMany: jest.fn() },
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
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
      .overrideProvider(ApiTokensService)
      .useValue({
        findValidByRaw: jest.fn(),
        touchLastUsed: jest.fn(),
        create: jest.fn(),
        listForProject: jest.fn().mockResolvedValue([]),
        revoke: jest.fn(),
        regenerate: jest.fn(),
      })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const removedPaths = ['/users', '/me', '/tokens', '/accounts', '/settings'];
  const forbiddenPaths = [
    '/chats',
    '/messages',
    '/groups',
    '/webhooks',
    '/events',
    '/payloads',
    '/media',
    '/images',
    '/videos',
  ];

  it.each(removedPaths)('returns 404 for removed %s', async (path) => {
    const res = await request(app.getHttpServer()).get(path).set('Accept', 'application/json');
    expect(res.status).toBe(404);
  });

  it.each(forbiddenPaths)('returns 404 for %s', async (path) => {
    const res = await request(app.getHttpServer()).get(path).set('Accept', 'application/json');
    expect(res.status).toBe(404);
  });

  it.each(['/dashboard', '/projects', '/system'])('requires Admin session for %s', async (path) => {
    const res = await request(app.getHttpServer()).get(path).set('Accept', 'application/json');
    expect(res.status).toBe(401);
  });

  it('protects QR routes with Admin session', async () => {
    const res = await request(app.getHttpServer())
      .get('/projects/p1/accounts/a1/qr')
      .set('Accept', 'application/json');
    expect(res.status).toBe(401);
  });
});
