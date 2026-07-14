import { GroupApiOperationStatus, GroupApiOperationType, SessionStatus } from '@prisma/client';
import { GroupsService } from '../../src/groups/groups.service';
import { WahaApiError, WahaTransportError } from '../../src/waha/types/waha.types';
import { ERROR_CODES } from '../../src/common/errors/error-codes';

const accountCtx = {
  apiTokenId: 't1',
  whatsappAccountId: 'acc1',
  sessionName: 'wa_db',
};

const connectedAccount = {
  id: 'acc1',
  sessionName: 'wa_db',
  isActive: true,
  status: SessionStatus.CONNECTED,
};

describe('GroupsService', () => {
  const buildPrisma = () => ({
    whatsappAccount: {
      findUnique: jest.fn().mockResolvedValue(connectedAccount),
    },
    groupApiOperation: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({
        id: 'op1',
        whatsappAccountId: 'acc1',
        operationType: GroupApiOperationType.CREATE_GROUP,
        idempotencyKey: 'key-1',
        requestHash: 'hash',
        status: GroupApiOperationStatus.PROCESSING,
      }),
      update: jest.fn().mockResolvedValue(undefined),
    },
  });

  const wahaSvc = () => ({
    effectiveSessionName: jest.fn((a: { sessionName: string }) => a.sessionName),
  });

  it('lists groups with search by name and id', async () => {
    const prisma = buildPrisma();
    const wahaClient = {
      listGroups: jest.fn().mockResolvedValue([
        { id: '120363111111111111@g.us', subject: 'ACME Website' },
        { id: '120363222222222222@g.us', subject: 'Other' },
      ]),
    };
    const service = new GroupsService(prisma as never, wahaClient as never, wahaSvc() as never);
    const byName = await service.listGroups(accountCtx, { limit: 100, offset: 0, search: 'acme' });
    expect(byName.groups).toHaveLength(1);
    const byId = await service.listGroups(accountCtx, {
      limit: 100,
      offset: 0,
      search: '120363222',
    });
    expect(byId.groups[0]?.id).toBe('120363222222222222@g.us');
  });

  it('rejects disconnected account', async () => {
    const prisma = buildPrisma();
    prisma.whatsappAccount.findUnique.mockResolvedValue({
      ...connectedAccount,
      status: SessionStatus.DISCONNECTED,
    });
    const service = new GroupsService(
      prisma as never,
      { listGroups: jest.fn() } as never,
      wahaSvc() as never,
    );
    await expect(service.listGroups(accountCtx, { limit: 10, offset: 0 })).rejects.toMatchObject({
      code: ERROR_CODES.WHATSAPP_NOT_CONNECTED,
    });
  });

  it('maps WAHA unavailable on list', async () => {
    const service = new GroupsService(
      buildPrisma() as never,
      { listGroups: jest.fn().mockRejectedValue(new WahaTransportError('down')) } as never,
      wahaSvc() as never,
    );
    await expect(service.listGroups(accountCtx, { limit: 10, offset: 0 })).rejects.toMatchObject({
      code: ERROR_CODES.WAHA_UNAVAILABLE,
    });
  });

  it('creates group and deduplicates participants', async () => {
    const prisma = buildPrisma();
    const wahaClient = {
      createGroup: jest.fn().mockResolvedValue({
        id: '120363123456789012@g.us',
        subject: 'ACME Website',
      }),
    };
    const service = new GroupsService(prisma as never, wahaClient as never, wahaSvc() as never);
    const result = await service.createGroup(
      accountCtx,
      {
        name: 'ACME Website',
        participants: ['37499111111@c.us', '37499111111@c.us', '37499222222@c.us'],
      },
      'idem-create-1',
    );
    expect(result).toEqual({ id: '120363123456789012@g.us', name: 'ACME Website' });
    expect(wahaClient.createGroup).toHaveBeenCalledWith('wa_db', {
      name: 'ACME Website',
      participants: [{ id: '37499111111@c.us' }, { id: '37499222222@c.us' }],
    });
  });

  it('rejects invalid provider group id on create', async () => {
    const service = new GroupsService(
      buildPrisma() as never,
      { createGroup: jest.fn().mockResolvedValue({ id: 'bad' }) } as never,
      wahaSvc() as never,
    );
    await expect(
      service.createGroup(
        accountCtx,
        { name: 'X', participants: ['37499111111@c.us'] },
        'idem-bad-id',
      ),
    ).rejects.toMatchObject({ code: ERROR_CODES.GROUP_CREATE_INVALID_PROVIDER_RESPONSE });
  });

  it('marks create outcome unknown on transport timeout', async () => {
    const prisma = buildPrisma();
    const service = new GroupsService(
      prisma as never,
      { createGroup: jest.fn().mockRejectedValue(new WahaTransportError('timeout')) } as never,
      wahaSvc() as never,
    );
    await expect(
      service.createGroup(
        accountCtx,
        { name: 'X', participants: ['37499111111@c.us'] },
        'idem-timeout',
      ),
    ).rejects.toMatchObject({ code: ERROR_CODES.GROUP_CREATE_OUTCOME_UNKNOWN });
    expect(prisma.groupApiOperation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: GroupApiOperationStatus.OUTCOME_UNKNOWN }),
      }),
    );
  });

  it('replays successful create without calling WAHA', async () => {
    const prisma = buildPrisma();
    const stored = {
      id: '120363123456789012@g.us',
      name: 'ACME Website',
    };
    const { hashGroupRequestPayload } = await import('../../src/groups/idempotency');
    const requestHash = hashGroupRequestPayload({
      name: 'ACME Website',
      participants: ['37499111111@c.us'],
    });
    prisma.groupApiOperation.findUnique.mockResolvedValue({
      id: 'op1',
      requestHash,
      status: GroupApiOperationStatus.SUCCEEDED,
      normalizedResponse: stored,
      errorCode: null,
    });
    const createGroup = jest.fn();
    const service = new GroupsService(
      prisma as never,
      { createGroup } as never,
      wahaSvc() as never,
    );
    const result = await service.createGroup(
      accountCtx,
      { name: 'ACME Website', participants: ['37499111111@c.us'] },
      'idem-replay',
    );
    expect(result).toEqual(stored);
    expect(createGroup).not.toHaveBeenCalled();
  });

  it('rejects idempotency key reuse with different body', async () => {
    const prisma = buildPrisma();
    prisma.groupApiOperation.findUnique.mockResolvedValue({
      id: 'op1',
      requestHash: 'other-hash',
      status: GroupApiOperationStatus.SUCCEEDED,
      normalizedResponse: { id: '120363123456789012@g.us', name: 'X' },
      errorCode: null,
    });
    const service = new GroupsService(
      prisma as never,
      { createGroup: jest.fn() } as never,
      wahaSvc() as never,
    );
    await expect(
      service.createGroup(
        accountCtx,
        { name: 'Y', participants: ['37499111111@c.us'] },
        'idem-reuse',
      ),
    ).rejects.toMatchObject({ code: ERROR_CODES.IDEMPOTENCY_KEY_REUSED });
  });

  it('adds participants treating already members as no-op', async () => {
    const prisma = buildPrisma();
    const wahaClient = {
      listGroupParticipants: jest
        .fn()
        .mockResolvedValue([{ id: '37499111111@c.us', role: 'participant' }]),
      addGroupParticipants: jest.fn().mockResolvedValue({}),
    };
    const service = new GroupsService(prisma as never, wahaClient as never, wahaSvc() as never);
    const result = await service.addParticipants(
      accountCtx,
      '120363123456789012@g.us',
      ['37499111111@c.us', '37499222222@c.us'],
      'idem-add-1',
    );
    expect(result.alreadyMembers).toEqual(['37499111111@c.us']);
    expect(result.added).toEqual(['37499222222@c.us']);
    expect(wahaClient.addGroupParticipants).toHaveBeenCalledWith(
      'wa_db',
      '120363123456789012@g.us',
      { participants: [{ id: '37499222222@c.us' }] },
    );
  });

  it('returns invite link without logging secrets', async () => {
    const prisma = buildPrisma();
    const service = new GroupsService(
      prisma as never,
      { getGroupInviteCode: jest.fn().mockResolvedValue({ code: 'InviteCode12' }) } as never,
      wahaSvc() as never,
    );
    const result = await service.getInviteLink(accountCtx, '120363123456789012@g.us');
    expect(result.inviteUrl).toBe('https://chat.whatsapp.com/InviteCode12');
  });

  it('maps group not found on get', async () => {
    const service = new GroupsService(
      buildPrisma() as never,
      { getGroup: jest.fn().mockRejectedValue(new WahaApiError('missing', 404)) } as never,
      wahaSvc() as never,
    );
    await expect(service.getGroup(accountCtx, '120363123456789012@g.us')).rejects.toMatchObject({
      code: ERROR_CODES.GROUP_NOT_FOUND,
    });
  });
});
