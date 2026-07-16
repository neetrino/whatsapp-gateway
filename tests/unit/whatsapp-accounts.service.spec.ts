import { Role, SessionStatus } from '@prisma/client';
import { WhatsappAccountsService } from '../../src/whatsapp-accounts/whatsapp-accounts.service';
import { AppException } from '../../src/common/errors/app.exception';

describe('WhatsappAccountsService multi-account', () => {
  it('allows creating multiple accounts for the same user', async () => {
    const creates: Array<{ userId: string; label: string }> = [];
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: 'u1', email: 'a@b.com' }),
      },
      whatsappAccount: {
        create: jest.fn(async ({ data }: { data: { userId: string; label: string } }) => {
          creates.push({ userId: data.userId, label: data.label });
          return {
            id: `wa${creates.length}`,
            userId: data.userId,
            label: data.label,
            sessionName: `wa_sess_${creates.length}`,
            status: SessionStatus.QR_REQUIRED,
            phoneNumber: null,
            isActive: true,
            lastConnectedAt: null,
            lastDisconnectedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
        }),
      },
    };
    const waha = {} as never;
    const service = new WhatsappAccountsService(prisma as never, waha);

    await service.createForUser('u1', 'Line A');
    await service.createForUser('u1', 'Line B');

    expect(creates).toEqual([
      { userId: 'u1', label: 'Line A' },
      { userId: 'u1', label: 'Line B' },
    ]);
    expect(prisma.whatsappAccount.create).toHaveBeenCalledTimes(2);
  });

  it('rejects create when user does not exist', async () => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(null) },
      whatsappAccount: { create: jest.fn() },
    };
    const service = new WhatsappAccountsService(prisma as never, {} as never);

    await expect(service.createForUser('missing', 'X')).rejects.toBeInstanceOf(AppException);
    expect(prisma.whatsappAccount.create).not.toHaveBeenCalled();
  });

  it('lists accounts for a user', async () => {
    const rows = [
      {
        id: 'wa1',
        userId: 'u1',
        label: 'A',
        user: { id: 'u1', name: 'A', email: 'a@b.com', role: Role.USER, isActive: true },
      },
    ];
    const prisma = {
      whatsappAccount: {
        findMany: jest.fn().mockResolvedValue(rows),
      },
    };
    const service = new WhatsappAccountsService(prisma as never, {} as never);
    const list = await service.listForUser('u1');
    expect(list).toEqual(rows);
    expect(prisma.whatsappAccount.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u1' } }),
    );
  });
});
