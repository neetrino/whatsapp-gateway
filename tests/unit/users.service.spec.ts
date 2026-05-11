import { Prisma, Role } from '@prisma/client';
import { UsersService } from '../../src/users/users.service';

describe('UsersService', () => {
  it('creates exactly one WhatsappAccount per new user', async () => {
    const createdUser = {
      id: 'u1',
      email: 'a@b.com',
      name: 'Alice',
      passwordHash: 'hash',
      role: Role.USER,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const txCalls: string[] = [];
    const prisma = {
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          user: {
            create: jest.fn(async ({ data }: { data: { email: string } }) => {
              txCalls.push(`user.create:${data.email}`);
              return createdUser;
            }),
          },
          whatsappAccount: {
            create: jest.fn(async ({ data }: { data: { userId: string } }) => {
              txCalls.push(`whatsappAccount.create:${data.userId}`);
              return { id: 'wa1', userId: data.userId };
            }),
          },
        };
        return fn(tx);
      }),
    };

    const service = new UsersService(prisma as never);
    const user = await service.createUserWithAccount({
      name: 'Alice',
      email: 'a@b.com',
      password: 'passwordpassword',
    });

    expect(user.id).toBe('u1');
    expect(txCalls).toEqual(['user.create:a@b.com', 'whatsappAccount.create:u1']);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('maps prisma unique violation to conflict', async () => {
    const prismaError = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: 'test',
      meta: { target: ['email'] },
    });
    const prisma = {
      $transaction: jest.fn().mockRejectedValue(prismaError),
    };
    const service = new UsersService(prisma as never);

    await expect(
      service.createUserWithAccount({
        name: 'Alice',
        email: 'a@b.com',
        password: 'passwordpassword',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});
