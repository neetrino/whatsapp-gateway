import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ApiTokensService } from '../../src/api-tokens/api-tokens.service';
import { WahaClient } from '../../src/waha/waha.client';
import { SessionStatus, GroupApiOperationStatus } from '@prisma/client';
import { generateApiToken } from '../../src/common/utils/tokens';
import { hashGroupRequestPayload } from '../../src/groups/idempotency';

describe('Groups API (e2e)', () => {
  let app: INestApplication;
  const prefix = process.env.API_TOKEN_PREFIX ?? 'gw_test';

  const findValidByRaw = jest.fn();
  const touchLastUsed = jest.fn();
  const listGroups = jest.fn();
  const createGroup = jest.fn();
  const getGroup = jest.fn();
  const refreshGroups = jest.fn();
  const listGroupParticipants = jest.fn();
  const addGroupParticipants = jest.fn();
  const getGroupInviteCode = jest.fn();

  const groupApiOperation = {
    findUnique: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockImplementation(async ({ data }) => ({
      id: 'op1',
      ...data,
      status: GroupApiOperationStatus.PROCESSING,
    })),
    update: jest.fn().mockResolvedValue(undefined),
  };

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
    groupApiOperation,
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
        sendText: jest.fn(),
        sendImageByUrl: jest.fn(),
        sendVideoByUrl: jest.fn(),
        listGroups,
        createGroup,
        getGroup,
        refreshGroups,
        listGroupParticipants,
        addGroupParticipants,
        getGroupInviteCode,
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
    groupApiOperation.findUnique.mockResolvedValue(null);
  });

  const authHeaderForRaw = (raw: string): { Authorization: string } => ({
    Authorization: `Bearer ${raw}`,
  });

  const authed = (): { Authorization: string } => {
    const raw = generateApiToken(prefix).raw;
    findValidByRaw.mockResolvedValue({
      apiTokenId: 't1',
      whatsappAccountId: 'acc1',
      sessionName: 'wa_test',
      revoked: false,
    });
    return authHeaderForRaw(raw);
  };

  it('returns 401 without Bearer', async () => {
    const res = await request(app.getHttpServer()).get('/api/groups');
    expect(res.status).toBe(401);
  });

  it('returns auth error for invalid token', async () => {
    findValidByRaw.mockResolvedValue(null);
    const res = await request(app.getHttpServer())
      .get('/api/groups')
      .set(authHeaderForRaw(generateApiToken(prefix).raw));
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
  });

  it('lists groups with normalized response', async () => {
    listGroups.mockResolvedValue([
      { id: '120363123456789012@g.us', subject: 'ACME Website', participants: [1, 2, 3] },
    ]);
    const res = await request(app.getHttpServer()).get('/api/groups').set(authed());
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.groups[0]).toEqual({
      id: '120363123456789012@g.us',
      name: 'ACME Website',
      participantCount: 3,
      pictureUrl: null,
    });
  });

  it('rejects create without Idempotency-Key', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/groups')
      .set(authed())
      .send({ name: 'ACME', participants: ['37499111111@c.us'] });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
  });

  it('rejects invalid participant', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/groups')
      .set(authed())
      .set('Idempotency-Key', 'create-invalid-participant')
      .send({ name: 'ACME', participants: ['37499111111'] });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_GROUP_PARTICIPANT');
  });

  it('creates group successfully', async () => {
    createGroup.mockResolvedValue({ id: '120363123456789012@g.us', subject: 'ACME Website' });
    const res = await request(app.getHttpServer())
      .post('/api/groups')
      .set(authed())
      .set('Idempotency-Key', 'create-success-1')
      .send({
        name: 'ACME Website',
        participants: ['37499111111@c.us', '37499222222@c.us'],
      });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      id: '120363123456789012@g.us',
      name: 'ACME Website',
    });
    expect(createGroup).toHaveBeenCalledTimes(1);
  });

  it('replays create idempotency without second WAHA call', async () => {
    const stored = { id: '120363123456789012@g.us', name: 'ACME Website' };
    const requestHash = hashGroupRequestPayload({
      name: 'ACME Website',
      participants: ['37499111111@c.us'],
    });
    groupApiOperation.findUnique.mockResolvedValue({
      id: 'op1',
      requestHash,
      status: GroupApiOperationStatus.SUCCEEDED,
      normalizedResponse: stored,
      errorCode: null,
    });
    const res = await request(app.getHttpServer())
      .post('/api/groups')
      .set(authed())
      .set('Idempotency-Key', 'create-replay-1')
      .send({ name: 'ACME Website', participants: ['37499111111@c.us'] });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(stored);
    expect(createGroup).not.toHaveBeenCalled();
  });

  it('rejects invalid group id', async () => {
    const res = await request(app.getHttpServer()).get('/api/groups/not-a-group').set(authed());
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_GROUP_ID');
  });

  it('lists participants normalized', async () => {
    listGroupParticipants.mockResolvedValue([
      { id: '37499123456@c.us', role: 'admin' },
      { id: 'abc@lid', role: 'participant' },
    ]);
    const res = await request(app.getHttpServer())
      .get('/api/groups/120363123456789012%40g.us/participants')
      .set(authed());
    expect(res.status).toBe(200);
    expect(res.body.data.count).toBe(2);
    expect(res.body.data.participants[0]).toMatchObject({
      id: '37499123456@c.us',
      phone: '37499123456',
      role: 'admin',
      isAdmin: true,
    });
    expect(res.body.data.participants[1].phone).toBeNull();
  });

  it('adds participants with alreadyMembers', async () => {
    listGroupParticipants.mockResolvedValue([{ id: '37499111111@c.us', role: 'participant' }]);
    addGroupParticipants.mockResolvedValue({});
    const res = await request(app.getHttpServer())
      .post('/api/groups/120363123456789012%40g.us/participants')
      .set(authed())
      .set('Idempotency-Key', 'add-part-1')
      .send({ participants: ['37499111111@c.us', '37499222222@c.us'] });
    expect(res.status).toBe(200);
    expect(res.body.data.alreadyMembers).toEqual(['37499111111@c.us']);
    expect(res.body.data.added).toEqual(['37499222222@c.us']);
  });

  it('returns invite link', async () => {
    getGroupInviteCode.mockResolvedValue({ code: 'InviteCodeXY' });
    const res = await request(app.getHttpServer())
      .get('/api/groups/120363123456789012%40g.us/invite-link')
      .set(authed());
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      groupId: '120363123456789012@g.us',
      inviteUrl: 'https://chat.whatsapp.com/InviteCodeXY',
    });
  });
});
