import { WhatsappAccountMode, SessionStatus } from '../../src/common/db-enums';
import { WhatsappAccountsService } from '../../src/whatsapp-accounts/whatsapp-accounts.service';
import { ERROR_CODES } from '../../src/common/errors/error-codes';

describe('WhatsappAccountsService', () => {
  it('creates multiple accounts under the same project with generated session names', async () => {
    const prisma = {
      project: { findUnique: jest.fn().mockResolvedValue({ id: 'p1' }) },
      whatsappAccount: {
        create: jest
          .fn()
          .mockImplementation(
            async ({ data }: { data: { sessionName: string; mode: string } }) => ({
              id: data.sessionName,
              projectId: 'p1',
              label: 'A',
              mode: data.mode,
              sessionName: data.sessionName,
              status: SessionStatus.QR_REQUIRED,
              isActive: true,
            }),
          ),
        findFirst: jest.fn(),
      },
    };
    const waha = {};
    const service = new WhatsappAccountsService(prisma as never, waha as never, {} as never);
    const first = await service.createForProject('p1', 'Send', WhatsappAccountMode.SEND_ONLY);
    const second = await service.createForProject('p1', 'Chat', WhatsappAccountMode.MESSENGER);
    expect(first.projectId).toBe('p1');
    expect(second.projectId).toBe('p1');
    expect(first.mode).toBe(WhatsappAccountMode.SEND_ONLY);
    expect(second.mode).toBe(WhatsappAccountMode.MESSENGER);
    expect(first.sessionName).toMatch(/^wa_/);
    expect(second.sessionName).not.toBe(first.sessionName);
  });

  it('does not return an account from another project', async () => {
    const prisma = {
      project: { findUnique: jest.fn() },
      whatsappAccount: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn() },
    };
    const service = new WhatsappAccountsService(prisma as never, {} as never, {} as never);
    await expect(service.getByIdForProject('project-a', 'acc-from-b')).rejects.toMatchObject({
      code: ERROR_CODES.NOT_FOUND,
    });
    expect(prisma.whatsappAccount.findFirst).toHaveBeenCalledWith({
      where: { id: 'acc-from-b', projectId: 'project-a' },
    });
  });

  it('activates and deactivates an account only inside its project', async () => {
    const account = {
      id: 'acc1',
      projectId: 'p1',
      label: 'A',
      isActive: true,
    };
    const prisma = {
      project: { findUnique: jest.fn() },
      whatsappAccount: {
        findFirst: jest.fn().mockResolvedValue(account),
        create: jest.fn(),
        update: jest.fn().mockResolvedValue({ ...account, isActive: false }),
      },
    };
    const service = new WhatsappAccountsService(prisma as never, {} as never, {} as never);
    await expect(service.setActiveForProject('p1', 'acc1', false)).resolves.toMatchObject({
      isActive: false,
    });
    expect(prisma.whatsappAccount.findFirst).toHaveBeenCalledWith({
      where: { id: 'acc1', projectId: 'p1' },
    });
    expect(prisma.whatsappAccount.update).toHaveBeenCalledWith({
      where: { id: 'acc1' },
      data: { isActive: false },
    });
  });

  it('updates DB only when WAHA session does not exist', async () => {
    const account = {
      id: 'acc1',
      projectId: 'p1',
      label: 'A',
      mode: WhatsappAccountMode.SEND_ONLY,
      sessionName: 'wa_1',
      isActive: true,
    };
    const prisma = {
      project: { findUnique: jest.fn() },
      whatsappAccount: {
        findFirst: jest.fn().mockResolvedValue(account),
        update: jest.fn().mockResolvedValue({ ...account, mode: WhatsappAccountMode.MESSENGER }),
      },
    };
    const modePolicy = {
      sessionExists: jest.fn().mockResolvedValue(false),
      applySessionConfig: jest.fn(),
    };
    const service = new WhatsappAccountsService(prisma as never, {} as never, modePolicy as never);
    const result = await service.switchModeForProject('p1', 'acc1', WhatsappAccountMode.MESSENGER);
    expect(result.applied).toBe(true);
    expect(modePolicy.applySessionConfig).not.toHaveBeenCalled();
    expect(prisma.whatsappAccount.update).toHaveBeenCalledWith({
      where: { id: 'acc1' },
      data: { mode: WhatsappAccountMode.MESSENGER },
    });
  });

  it('keeps the previous mode when WAHA PUT fails', async () => {
    const account = {
      id: 'acc1',
      projectId: 'p1',
      label: 'A',
      mode: WhatsappAccountMode.SEND_ONLY,
      sessionName: 'wa_1',
      isActive: true,
    };
    const prisma = {
      project: { findUnique: jest.fn() },
      whatsappAccount: {
        findFirst: jest.fn().mockResolvedValue(account),
        update: jest.fn(),
      },
    };
    const modePolicy = {
      sessionExists: jest.fn().mockResolvedValue(true),
      applySessionConfig: jest.fn().mockRejectedValue(new Error('waha down')),
    };
    const service = new WhatsappAccountsService(prisma as never, {} as never, modePolicy as never);
    const result = await service.switchModeForProject('p1', 'acc1', WhatsappAccountMode.MESSENGER);
    expect(result.applied).toBe(false);
    expect(result.account.mode).toBe(WhatsappAccountMode.SEND_ONLY);
    expect(prisma.whatsappAccount.update).not.toHaveBeenCalled();
  });
});
