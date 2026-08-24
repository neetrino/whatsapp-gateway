import { hashPassword } from '../../src/common/utils/password';
import { upsertSingletonAdmin } from '../../src/auth/upsert-admin';

describe('upsertSingletonAdmin', () => {
  it('creates the singleton Admin on first seed', async () => {
    const prisma = {
      admin: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'a1' }),
        update: jest.fn(),
      },
    };
    const result = await upsertSingletonAdmin(prisma as never, {
      email: 'admin@example.com',
      password: 'correct-horse-battery',
    });
    expect(result).toEqual({ created: true, sessionBumped: false });
    expect(prisma.admin.create).toHaveBeenCalled();
    expect(prisma.admin.update).not.toHaveBeenCalled();
  });

  it('does not rehash or bump sessionVersion when credentials are unchanged', async () => {
    const passwordHash = await hashPassword('correct-horse-battery');
    const prisma = {
      admin: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'a1',
          email: 'admin@example.com',
          passwordHash,
          isActive: true,
          sessionVersion: 4,
        }),
        create: jest.fn(),
        update: jest.fn(),
      },
    };
    const result = await upsertSingletonAdmin(prisma as never, {
      email: 'admin@example.com',
      password: 'correct-horse-battery',
    });
    expect(result).toEqual({ created: false, sessionBumped: false });
    expect(prisma.admin.update).not.toHaveBeenCalled();
  });

  it('increments sessionVersion when the password actually changes', async () => {
    const passwordHash = await hashPassword('old-password-12');
    const prisma = {
      admin: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'a1',
          email: 'admin@example.com',
          passwordHash,
          isActive: true,
          sessionVersion: 4,
        }),
        create: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const result = await upsertSingletonAdmin(prisma as never, {
      email: 'admin@example.com',
      password: 'new-password-12',
    });
    expect(result).toEqual({ created: false, sessionBumped: true });
    expect(prisma.admin.update.mock.calls[0]?.[0].data.sessionVersion).toEqual({ increment: 1 });
  });
});
