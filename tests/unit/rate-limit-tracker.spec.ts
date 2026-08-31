import { hashApiToken } from '../../src/common/utils/tokens';
import {
  classifyV1Throttle,
  isV1ReadPath,
  isV1SendPath,
  rateLimitTrackerKey,
  requestPath,
} from '../../src/common/utils/rate-limit-tracker';

const pepper = '0123456789abcdef0123456789abcdef';

describe('rate-limit tracker', () => {
  it('keys by token hash, never the raw token', () => {
    const raw = 'gw_test_abcdefgh';
    const key = rateLimitTrackerKey({ headers: { authorization: `Bearer ${raw}` } }, pepper);
    expect(key).toBe(`token:${hashApiToken(raw, pepper)}`);
    expect(key).not.toContain(raw);
  });

  it('falls back to IP when no Bearer token is present', () => {
    expect(rateLimitTrackerKey({ ip: '203.0.113.10' }, pepper)).toBe('ip:203.0.113.10');
  });

  it('classifies v1 send and read paths', () => {
    expect(isV1SendPath('/api/v1/accounts/acc1/messages', 'POST')).toBe(true);
    expect(isV1ReadPath('/api/v1/accounts', 'GET')).toBe(true);
    expect(isV1ReadPath('/api/v1/accounts/acc1/status', 'GET')).toBe(true);
    expect(isV1ReadPath('/api/v1/accounts/acc1/qr', 'GET')).toBe(true);
    expect(isV1ReadPath('/api/v1/accounts/acc1/chats', 'GET')).toBe(true);
    expect(isV1ReadPath('/api/v1/accounts/acc1/chats/37499111222@c.us/messages', 'GET')).toBe(true);
    expect(isV1SendPath('/api/messages/send', 'POST')).toBe(false);
    expect(isV1ReadPath('/api/v1/accounts', 'POST')).toBe(false);
    expect(classifyV1Throttle('/api/v1/accounts/acc1/messages', 'POST')).toBe('send');
    expect(classifyV1Throttle('/api/v1/accounts/acc1/session/restart', 'POST')).toBe('send');
    expect(classifyV1Throttle('/api/v1/accounts/acc1/session/logout', 'POST')).toBe('send');
    expect(classifyV1Throttle('/api/v1/accounts/acc1/qr', 'GET')).toBe('read');
    expect(classifyV1Throttle('/api/v1/accounts', 'GET')).toBe('read');
    expect(classifyV1Throttle('/api/messages/send', 'POST')).toBeUndefined();
  });

  it('strips query strings from request paths', () => {
    expect(requestPath({ originalUrl: '/api/v1/accounts?x=1', method: 'GET' })).toEqual({
      path: '/api/v1/accounts',
      method: 'GET',
    });
  });
});
