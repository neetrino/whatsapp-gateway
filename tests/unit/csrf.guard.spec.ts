import { CsrfGuard } from '../../src/common/guards/csrf.guard';
import { AppException } from '../../src/common/errors/app.exception';
import { ERROR_CODES } from '../../src/common/errors/error-codes';

describe('CsrfGuard', () => {
  const guard = new CsrfGuard();

  const contextFor = (method: string, path: string, cookie?: string, bodyToken?: string) => {
    const request = {
      method,
      path,
      header: (name: string) => (name.toLowerCase() === 'x-csrf-token' ? undefined : undefined),
      cookies: cookie ? { gw_csrf: cookie } : {},
      body: bodyToken ? { _csrf: bodyToken } : {},
    };
    return {
      switchToHttp: () => ({ getRequest: () => request }),
    };
  };

  it('allows API routes without CSRF', () => {
    expect(guard.canActivate(contextFor('POST', '/api/messages/send') as never)).toBe(true);
  });

  it('rejects dashboard mutations without a matching CSRF token', () => {
    try {
      guard.canActivate(contextFor('POST', '/projects') as never);
      throw new Error('expected CSRF rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(AppException);
      expect((error as AppException).code).toBe(ERROR_CODES.CSRF_INVALID);
    }
  });

  it('accepts dashboard mutations with a matching CSRF token', () => {
    expect(guard.canActivate(contextFor('POST', '/projects', 'abc', 'abc') as never)).toBe(true);
  });
});
