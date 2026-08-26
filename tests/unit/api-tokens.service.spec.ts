import { ApiTokensService } from '../../src/api-tokens/api-tokens.service';
import { hashApiToken } from '../../src/common/utils/tokens';
import { AppException } from '../../src/common/errors/app.exception';
import { ERROR_CODES } from '../../src/common/errors/error-codes';

interface PrismaStub {
  apiToken: {
    create: jest.Mock;
    findUnique: jest.Mock;
    findFirst: jest.Mock;
    update: jest.Mock;
    findMany: jest.Mock;
  };
  project: {
    findUnique: jest.Mock;
  };
  whatsappAccount: {
    findMany: jest.Mock;
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
    findFirst: jest.fn(),
    update: jest.fn(),
    findMany: jest.fn(),
  },
  project: {
    findUnique: jest.fn(),
  },
  whatsappAccount: {
    findMany: jest.fn().mockResolvedValue([]),
  },
});

describe('ApiTokensService', () => {
  it('create stores only hash + prefix + last4 and returns raw exactly once', async () => {
    const prisma = buildPrisma();
    prisma.project.findUnique.mockResolvedValue({ id: 'p1' });
    prisma.apiToken.create.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'tok1',
        projectId: 'p1',
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
    const issued = await service.create('p1', 'My token');
    expect(issued.raw.startsWith(`${PREFIX}_`)).toBe(true);
    const created = prisma.apiToken.create.mock.calls[0]?.[0].data as Record<string, unknown>;
    expect(created.tokenHash).toBe(hashApiToken(issued.raw, PEPPER));
    expect(created).not.toHaveProperty('raw');
    expect(created.projectId).toBe('p1');
    expect(created.tokenPrefix).toBe(PREFIX);
    expect(created.last4).toHaveLength(4);
  });

  it('findProjectByRaw does not load WhatsApp accounts', async () => {
    const prisma = buildPrisma();
    prisma.apiToken.findUnique.mockResolvedValue({
      id: 'tok1',
      revokedAt: null,
      project: { id: 'p1', isActive: true },
    });
    const service = new ApiTokensService(prisma as never, buildConfig() as never);
    const result = await service.findProjectByRaw(`${PREFIX}_abcdef`);
    expect(result).toEqual({
      apiTokenId: 'tok1',
      projectId: 'p1',
      projectIsActive: true,
      revoked: false,
    });
    expect(prisma.whatsappAccount.findMany).not.toHaveBeenCalled();
  });

  it('findValidByRaw returns null when no row matches the hash', async () => {
    const prisma = buildPrisma();
    prisma.apiToken.findUnique.mockResolvedValue(null);
    const service = new ApiTokensService(prisma as never, buildConfig() as never);
    await expect(service.findValidByRaw('does-not-exist')).resolves.toBeNull();
  });

  it('findValidByRaw flags revoked tokens and includes project accounts', async () => {
    const prisma = buildPrisma();
    prisma.apiToken.findUnique.mockResolvedValue({
      id: 'tok1',
      revokedAt: new Date(),
      project: {
        id: 'p1',
        isActive: true,
      },
    });
    prisma.whatsappAccount.findMany.mockResolvedValue([{ id: 'acc1', sessionName: 'wa_x' }]);
    const service = new ApiTokensService(prisma as never, buildConfig() as never);
    const result = await service.findValidByRaw(`${PREFIX}_abcdef`);
    expect(result?.revoked).toBe(true);
    expect(result?.projectId).toBe('p1');
    expect(result?.activeAccounts).toEqual([{ id: 'acc1', sessionName: 'wa_x' }]);
  });

  it('regenerate issues a new raw and clears revokedAt', async () => {
    const prisma = buildPrisma();
    prisma.apiToken.findFirst.mockResolvedValue({
      id: 'tok1',
      projectId: 'p1',
      revokedAt: new Date(),
    });
    prisma.apiToken.update.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'tok1',
        projectId: 'p1',
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
    const issued = await service.regenerate('p1', 'tok1');
    expect(issued.raw.startsWith(`${PREFIX}_`)).toBe(true);
    expect(prisma.apiToken.update.mock.calls[0]?.[0].data.revokedAt).toBeNull();
  });

  it('cannot manage a token that belongs to another project', async () => {
    const prisma = buildPrisma();
    prisma.apiToken.findFirst.mockResolvedValue(null);
    const service = new ApiTokensService(prisma as never, buildConfig() as never);
    try {
      await service.revoke('project-a', 'tok-from-b');
      throw new Error('expected revoke to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(AppException);
      expect((error as AppException).code).toBe(ERROR_CODES.NOT_FOUND);
    }
  });
});
