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

describe('GET /api/chats (e2e)', () => {
  let app: INestApplication;
  const prefix = process.env.API_TOKEN_PREFIX ?? 'gw_test';
  const findValidByRaw = jest.fn();
  const touchLastUsed = jest.fn();
  const listGroups = jest.fn();
  const listChats = jest.fn();
  const getGroup = jest.fn();

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
        listChats,
        getGroup,
      })
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('lists recent direct and group chats with type', async () => {
    const raw = generateApiToken(prefix).raw;
    findValidByRaw.mockResolvedValue({ ...validResolvedToken });
    listGroups.mockResolvedValue({
      '120363111111111111@g.us': { id: '120363111111111111@g.us', subject: '$Old' },
      '120363222222222222@g.us': { id: '120363222222222222@g.us', subject: 'Qualitech' },
    });
    listChats.mockResolvedValue([
      { id: '37499111222@c.us', name: 'Armen' },
      { id: '120363222222222222@g.us', name: 'Qualitech' },
    ]);
    const res = await request(app.getHttpServer())
      .get('/api/chats?limit=20&offset=0')
      .set('Authorization', `Bearer ${raw}`);
    expect(res.status).toBe(200);
    expect(res.body.data.items).toEqual([
      expect.objectContaining({ id: '37499111222@c.us', type: 'direct', name: 'Armen' }),
      expect.objectContaining({ id: '120363222222222222@g.us', type: 'group', name: 'Qualitech' }),
      expect.objectContaining({ id: '120363111111111111@g.us', type: 'group', name: '$Old' }),
    ]);
  });

  it('searches directs that are not on the first group page', async () => {
    const raw = generateApiToken(prefix).raw;
    findValidByRaw.mockResolvedValue({ ...validResolvedToken });
    listGroups.mockResolvedValue({
      '120363111111111111@g.us': { id: '120363111111111111@g.us', subject: '$Old' },
    });
    listChats.mockResolvedValue([{ id: '37499111222@c.us', name: 'Armen' }]);
    const res = await request(app.getHttpServer())
      .get('/api/chats?limit=20&offset=0&search=Armen')
      .set('Authorization', `Bearer ${raw}`);
    expect(res.status).toBe(200);
    expect(res.body.data.items).toEqual([
      expect.objectContaining({ type: 'direct', name: 'Armen' }),
    ]);
  });

  it('still returns groups when listChats fails', async () => {
    const raw = generateApiToken(prefix).raw;
    findValidByRaw.mockResolvedValue({ ...validResolvedToken });
    listGroups.mockResolvedValue({
      groups: [{ id: '120363123456789012@g.us', subject: 'Product' }],
    });
    listChats.mockRejectedValue(new Error('store down'));
    const res = await request(app.getHttpServer())
      .get('/api/chats?limit=20&offset=0')
      .set('Authorization', `Bearer ${raw}`);
    expect(res.status).toBe(200);
    expect(res.body.data.items).toEqual([
      expect.objectContaining({ type: 'group', name: 'Product' }),
    ]);
  });

  it('hydrates an empty group name from get-by-id', async () => {
    const raw = generateApiToken(prefix).raw;
    findValidByRaw.mockResolvedValue({ ...validResolvedToken });
    listGroups.mockResolvedValue({
      '120363111111111111@g.us': { id: '120363111111111111@g.us' },
    });
    listChats.mockResolvedValue([]);
    getGroup.mockResolvedValue({ id: '120363111111111111@g.us', subject: 'Hydrated' });
    const res = await request(app.getHttpServer())
      .get('/api/chats?limit=20&offset=0')
      .set('Authorization', `Bearer ${raw}`);
    expect(res.status).toBe(200);
    expect(res.body.data.items).toEqual([
      expect.objectContaining({ type: 'group', name: 'Hydrated' }),
    ]);
    expect(getGroup).toHaveBeenCalledWith('wa_test', '120363111111111111@g.us');
  });
});
