import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ApiTokensService } from '../../src/api-tokens/api-tokens.service';
import { WahaClient } from '../../src/waha/waha.client';
import { SessionStatus } from '../../src/common/db-enums';
import { generateApiToken } from '../../src/common/utils/tokens';
import { validResolvedToken } from '../helpers/resolved-token';

describe('GET /api/groups (e2e)', () => {
  let app: INestApplication;
  const pepper = process.env.TOKEN_PEPPER ?? '';
  const prefix = process.env.API_TOKEN_PREFIX ?? 'gw_test';
  const findValidByRaw = jest.fn();
  const touchLastUsed = jest.fn();
  const listGroups = jest.fn();

  const prismaMock = {
    onModuleInit: async () => {},
    onModuleDestroy: async () => {},
    $connect: jest.fn().mockResolvedValue(undefined),
    $disconnect: jest.fn().mockResolvedValue(undefined),
    $queryRaw: jest.fn().mockResolvedValue([{ ok: 1 }]),
    admin: { findUnique: jest.fn() },
    project: { count: jest.fn().mockResolvedValue(0), findUnique: jest.fn(), findMany: jest.fn() },
    whatsappAccount: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'acc1',
        sessionName: 'wa_test',
        isActive: true,
        status: SessionStatus.CONNECTED,
      }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    apiToken: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn() },
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .overrideProvider(ApiTokensService)
      .useValue({ findValidByRaw, touchLastUsed })
      .overrideProvider(WahaClient)
      .useValue({
        healthCheck: jest.fn().mockResolvedValue(true),
        listGroups,
      })
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('lists groups for the project token', async () => {
    const raw = generateApiToken(prefix).raw;
    findValidByRaw.mockResolvedValue({ ...validResolvedToken });
    listGroups.mockResolvedValue({
      groups: [{ id: '120363123456789012@g.us', subject: 'Product' }],
    });
    const res = await request(app.getHttpServer())
      .get('/api/groups?limit=1&offset=0')
      .set('Authorization', `Bearer ${raw}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.groups).toHaveLength(1);
    expect(listGroups).toHaveBeenCalledWith(
      'wa_test',
      expect.objectContaining({ limit: 1, offset: 0 }),
    );
  });
});
