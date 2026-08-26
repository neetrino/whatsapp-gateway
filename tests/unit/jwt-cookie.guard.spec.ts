import { JwtCookieGuard } from '../../src/common/guards/jwt-cookie.guard';
import { ERROR_CODES } from '../../src/common/errors/error-codes';

describe('JwtCookieGuard', () => {
  const reflector = { getAllAndOverride: jest.fn().mockReturnValue(false) };
  const jwtService = { verify: jest.fn() };
  const authService = { loadActiveAdmin: jest.fn() };

  const contextFor = (token?: string) => {
    const request: { signedCookies?: Record<string, string>; admin?: unknown } = {
      signedCookies: token ? { gw_session: token } : {},
    };
    return {
      request,
      context: {
        switchToHttp: () => ({ getRequest: () => request }),
        getHandler: () => ({}),
        getClass: () => ({}),
      },
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    reflector.getAllAndOverride.mockReturnValue(false);
  });

  it('revalidates Admin from the database on each request', async () => {
    jwtService.verify.mockReturnValue({ sub: 'admin1', sv: 1 });
    authService.loadActiveAdmin.mockResolvedValue({ id: 'admin1', email: 'a@b.com' });
    const guard = new JwtCookieGuard(jwtService as never, reflector as never, authService as never);
    const { context, request } = contextFor('jwt');
    await expect(guard.canActivate(context as never)).resolves.toBe(true);
    expect(authService.loadActiveAdmin).toHaveBeenCalledWith('admin1', 1);
    expect(request.admin).toEqual({ id: 'admin1', email: 'a@b.com' });
  });

  it('rejects a previously issued JWT when Admin is inactive', async () => {
    jwtService.verify.mockReturnValue({ sub: 'admin1', sv: 1 });
    authService.loadActiveAdmin.mockRejectedValue({ code: ERROR_CODES.UNAUTHORIZED });
    const guard = new JwtCookieGuard(jwtService as never, reflector as never, authService as never);
    const { context } = contextFor('jwt');
    await expect(guard.canActivate(context as never)).rejects.toMatchObject({
      code: ERROR_CODES.UNAUTHORIZED,
    });
  });

  it('ignores an unsigned gw_session cookie', async () => {
    const request = { cookies: { gw_session: 'unsigned-jwt' }, signedCookies: {} };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => ({}),
      getClass: () => ({}),
    };
    const guard = new JwtCookieGuard(jwtService as never, reflector as never, authService as never);
    await expect(guard.canActivate(context as never)).rejects.toMatchObject({
      code: ERROR_CODES.UNAUTHORIZED,
    });
    expect(jwtService.verify).not.toHaveBeenCalled();
  });
});
