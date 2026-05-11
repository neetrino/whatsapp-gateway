import { cookieSecureFromNodeEnv } from '../../src/common/utils/cookie-secure';

describe('cookieSecureFromNodeEnv', () => {
  it('is false for development', () => {
    expect(cookieSecureFromNodeEnv('development')).toBe(false);
  });

  it('is false for test', () => {
    expect(cookieSecureFromNodeEnv('test')).toBe(false);
  });

  it('is true for production', () => {
    expect(cookieSecureFromNodeEnv('production')).toBe(true);
  });
});
