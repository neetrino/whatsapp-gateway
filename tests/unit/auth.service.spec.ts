import { hashPassword, verifyPassword } from '../../src/common/utils/password';
import { AuthService } from '../../src/auth/auth.service';
import { ERROR_CODES } from '../../src/common/errors/error-codes';
import { AppException } from '../../src/common/errors/app.exception';

const adminRow = {
  id: 'admin1',
  email: 'admin@example.com',
  passwordHash: '',
  isActive: true,
  sessionVersion: 3,
};

describe('AuthService', () => {
  const jwtService = { signAsync: jest.fn().mockResolvedValue('jwt-token') };
  const configService = { get: jest.fn().mockReturnValue('test') };

  beforeEach(() => {
    jest.clearAllMocks();
    jwtService.signAsync.mockResolvedValue('jwt-token');
  });

  it('logs in the singleton Admin with a valid password', async () => {
    const passwordHash = await hashPassword('correct-horse-battery');
    const prisma = {
      admin: {
        findUnique: jest.fn().mockResolvedValue({ ...adminRow, passwordHash }),
      },
    };
    const service = new AuthService(prisma as never, jwtService as never, configService as never);
    const session = await service.authenticate('Admin@example.com', 'correct-horse-battery');
    expect(session.admin).toEqual({ id: 'admin1', email: 'admin@example.com' });
    expect(jwtService.signAsync).toHaveBeenCalledWith({ sub: 'admin1', sv: 3 });
  });

  it('returns a generic error for invalid credentials', async () => {
    const prisma = { admin: { findUnique: jest.fn().mockResolvedValue(null) } };
    const service = new AuthService(prisma as never, jwtService as never, configService as never);
    await expect(service.authenticate('nobody@example.com', 'whatever12')).rejects.toMatchObject({
      code: ERROR_CODES.UNAUTHORIZED,
      message: 'Invalid email or password.',
    });
  });

  it('rejects inactive Admin at login', async () => {
    const passwordHash = await hashPassword('correct-horse-battery');
    const prisma = {
      admin: {
        findUnique: jest.fn().mockResolvedValue({
          ...adminRow,
          passwordHash,
          isActive: false,
        }),
      },
    };
    const service = new AuthService(prisma as never, jwtService as never, configService as never);
    await expect(
      service.authenticate('admin@example.com', 'correct-horse-battery'),
    ).rejects.toMatchObject({
      code: ERROR_CODES.UNAUTHORIZED,
    });
    expect(jwtService.signAsync).not.toHaveBeenCalled();
  });

  it('rejects a previously issued JWT when Admin is inactive', async () => {
    const prisma = {
      admin: {
        findUnique: jest.fn().mockResolvedValue({ ...adminRow, isActive: false }),
      },
    };
    const service = new AuthService(prisma as never, jwtService as never, configService as never);
    await expect(service.loadActiveAdmin('admin1', 3)).rejects.toBeInstanceOf(AppException);
  });

  it('rejects a JWT when sessionVersion does not match', async () => {
    const prisma = {
      admin: { findUnique: jest.fn().mockResolvedValue({ ...adminRow, isActive: true }) },
    };
    const service = new AuthService(prisma as never, jwtService as never, configService as never);
    await expect(service.loadActiveAdmin('admin1', 2)).rejects.toMatchObject({
      code: ERROR_CODES.UNAUTHORIZED,
    });
  });
});

describe('password hashing (seed + login compatibility)', () => {
  it('verifyPassword accepts hash from hashPassword', async () => {
    const hash = await hashPassword('admin12345678');
    await expect(verifyPassword(hash, 'admin12345678')).resolves.toBe(true);
  });
});
