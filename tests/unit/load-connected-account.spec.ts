import { SessionStatus } from '@prisma/client';
import { loadConnectedAccount } from '../../src/whatsapp-accounts/load-connected-account';
import { ERROR_CODES } from '../../src/common/errors/error-codes';

describe('loadConnectedAccount', () => {
  it('loads by account id and projectId together', async () => {
    const prisma = {
      whatsappAccount: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'acc1',
          sessionName: 'wa_a',
          isActive: true,
          status: SessionStatus.CONNECTED,
        }),
      },
    };
    await expect(loadConnectedAccount(prisma as never, 'p1', 'acc1')).resolves.toEqual({
      id: 'acc1',
      sessionName: 'wa_a',
    });
    expect(prisma.whatsappAccount.findFirst).toHaveBeenCalledWith({
      where: { id: 'acc1', projectId: 'p1' },
      select: { id: true, sessionName: true, isActive: true, status: true },
    });
  });

  it('fails closed when the account belongs to another project', async () => {
    const prisma = { whatsappAccount: { findFirst: jest.fn().mockResolvedValue(null) } };
    await expect(loadConnectedAccount(prisma as never, 'project-b', 'acc-a')).rejects.toMatchObject({
      code: ERROR_CODES.NOT_FOUND,
    });
  });
});
