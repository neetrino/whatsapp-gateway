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
import { memoryApiIdempotency } from '../helpers/memory-api-idempotency';

const GROUP_ID = '120363123456789012@g.us';

describe('group mutations (e2e)', () => {
  let app: INestApplication;
  const prefix = process.env.API_TOKEN_PREFIX ?? 'gw_test';
  const findValidByRaw = jest.fn();
  const touchLastUsed = jest.fn();
  const setGroupSubject = jest.fn();
  const removeGroupParticipants = jest.fn();
  const leaveGroup = jest.fn();
  const listGroupParticipants = jest.fn();

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
    apiIdempotency: memoryApiIdempotency(),
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
        setGroupSubject,
        removeGroupParticipants,
        leaveGroup,
        listGroupParticipants,
      })
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const authHeaders = (raw: string, key: string) => ({
    Authorization: `Bearer ${raw}`,
    'Idempotency-Key': key,
  });

  it('renames a group', async () => {
    const raw = generateApiToken(prefix).raw;
    findValidByRaw.mockResolvedValue({ ...validResolvedToken });
    setGroupSubject.mockResolvedValue(true);
    const res = await request(app.getHttpServer())
      .put(`/api/groups/${encodeURIComponent(GROUP_ID)}`)
      .set(authHeaders(raw, 'rename-1'))
      .send({ name: 'New Title' });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ id: GROUP_ID, name: 'New Title' });
    expect(setGroupSubject).toHaveBeenCalledWith('wa_test', GROUP_ID, 'New Title');
  });

  it('removes members and treats already-absent as success', async () => {
    const raw = generateApiToken(prefix).raw;
    findValidByRaw.mockResolvedValue({ ...validResolvedToken });
    listGroupParticipants.mockResolvedValue([{ id: '37499111111@c.us', role: 'participant' }]);
    removeGroupParticipants.mockResolvedValue(true);
    const res = await request(app.getHttpServer())
      .post(`/api/groups/${encodeURIComponent(GROUP_ID)}/participants/remove`)
      .set(authHeaders(raw, 'remove-1'))
      .send({ participants: ['37499111111@c.us', '37499222222@c.us'] });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      groupId: GROUP_ID,
      status: 'completed',
      removed: ['37499111111@c.us'],
      alreadyAbsent: ['37499222222@c.us'],
      failed: [],
    });
  });

  it('leaves a group', async () => {
    const raw = generateApiToken(prefix).raw;
    findValidByRaw.mockResolvedValue({ ...validResolvedToken });
    leaveGroup.mockResolvedValue(true);
    const res = await request(app.getHttpServer())
      .post(`/api/groups/${encodeURIComponent(GROUP_ID)}/leave`)
      .set(authHeaders(raw, 'leave-group-1'))
      .send();
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ groupId: GROUP_ID, left: true });
    expect(leaveGroup).toHaveBeenCalledWith('wa_test', GROUP_ID);
  });
});
