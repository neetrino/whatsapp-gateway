import { ApiTokensService } from '../../src/api-tokens/api-tokens.service';
import { hashApiToken } from '../../src/common/utils/tokens';
import { Role } from '@prisma/client';
import { AppException } from '../../src/common/errors/app.exception';
import { ERROR_CODES } from '../../src/common/errors/error-codes';

interface PrismaStub {
  apiToken: {
    create: jest.Mock;
    findUnique: jest.Mock;
    update: jest.Mock;
    findMany: jest.Mock;
  };
  whatsappAccount: {
    findUnique: jest.Mock;
  };
}

const PEPPER = 'pepper-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
const PREFIX = 'gw_live';

const buildConfig = (): { get: jest.Mock } => ({
  get: jest.fn((key: string) => (key === 'API_TOKEN_PREFIX' ? PREFIX : PEPPER)),
});

const buildPrisma = (): PrismaStub => ({
  apiToken: {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    findMany: jest.fn(),
  },
  whatsappAccount: {
    findUnique: jest.fn(),
  },
});

describe('ApiTokensService', () => {
  it('create stores only hash + prefix + last4 and returns raw exactly once', async () => {
    const prisma = buildPrisma();
    prisma.whatsappAccount.findUnique.mockResolvedValue({ id: 'acc1' });
    prisma.apiToken.create.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'tok1',
        whatsappAccountId: 'acc1',
        name: data.name,
        tokenHash: data.tokenHash,
        tokenPrefix: data.tokenPrefix,
        last4: data.last4,
        lastUsedAt: null,
        revokedAt: null,
        createdAt: new Date(),
      }),
    );
    const service = new ApiTokensService(prisma as never, buildConfig() as never);

    const issued = await service.create('acc1', 'My token');

    expect(issued.raw.startsWith(`${PREFIX}_`)).toBe(true);
    const created = prisma.apiToken.create.mock.calls[0][0].data;
    expect(created.tokenHash).toBe(hashApiToken(issued.raw, PEPPER));
    expect(created).not.toHaveProperty('raw');
    expect(created.tokenPrefix).toBe(PREFIX);
    expect(created.last4).toHaveLength(4);
  });

  it('findValidByRaw returns null when no row matches the hash', async () => {
    const prisma = buildPrisma();
    prisma.apiToken.findUnique.mockResolvedValue(null);
    const service = new ApiTokensService(prisma as never, buildConfig() as never);
    const result = await service.findValidByRaw('does-not-exist');
    expect(result).toBeNull();
  });

  it('findValidByRaw flags revoked tokens', async () => {
    const prisma = buildPrisma();
    prisma.apiToken.findUnique.mockResolvedValue({
      id: 'tok1',
      revokedAt: new Date(),
      whatsappAccount: { id: 'acc1', sessionName: 'wa_x' },
    });
    const service = new ApiTokensService(prisma as never, buildConfig() as never);
    const result = await service.findValidByRaw(`${PREFIX}_abcdef`);
    expect(result?.revoked).toBe(true);
  });

  it('regenerate issues a new raw and clears revokedAt', async () => {
    const prisma = buildPrisma();
    prisma.apiToken.findUnique.mockResolvedValue({
      id: 'tok1',
      whatsappAccount: { id: 'acc1', userId: 'u1' },
      revokedAt: new Date(),
    });
    prisma.apiToken.update.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'tok1',
        whatsappAccountId: 'acc1',
        name: 'My token',
        tokenHash: data.tokenHash,
        tokenPrefix: data.tokenPrefix,
        last4: data.last4,
        lastUsedAt: null,
        revokedAt: data.revokedAt,
        createdAt: new Date(),
      }),
    );
    const service = new ApiTokensService(prisma as never, buildConfig() as never);

    const issued = await service.regenerate('tok1', {
      id: 'admin',
      email: 'a@b',
      role: Role.ADMIN,
      name: 'A',
    });

    expect(issued.raw.startsWith(`${PREFIX}_`)).toBe(true);
    expect(prisma.apiToken.update.mock.calls[0][0].data.revokedAt).toBeNull();
  });

  it("non-admin actor cannot manage another user's token", async () => {
    const prisma = buildPrisma();
    prisma.apiToken.findUnique.mockResolvedValue({
      id: 'tok1',
      whatsappAccount: { id: 'acc1', userId: 'u2' },
      revokedAt: null,
    });
    const service = new ApiTokensService(prisma as never, buildConfig() as never);

    try {
      await service.revoke('tok1', { id: 'u1', email: 'a@b', role: Role.USER, name: 'A' });
      throw new Error('expected revoke to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(AppException);
      expect((error as AppException).code).toBe(ERROR_CODES.FORBIDDEN);
    }
  });
});
