import {
  TOKEN_REVEAL_COOKIE,
  consumeTokenRevealCookie,
  setTokenRevealCookie,
} from '../../src/auth/token-reveal';

const packedFor = (projectId: string, raw: string): string =>
  JSON.stringify({ projectId, raw });

describe('token reveal cookie', () => {
  it('stores a project-bound payload in a signed cookie, not a URL', () => {
    const res = { cookie: jest.fn(), clearCookie: jest.fn() };
    setTokenRevealCookie(res as never, { projectId: 'p1', raw: 'gw_live_secretvalue' }, false);
    expect(res.cookie).toHaveBeenCalledWith(
      TOKEN_REVEAL_COOKIE,
      packedFor('p1', 'gw_live_secretvalue'),
      expect.objectContaining({ httpOnly: true, signed: true, secure: false, maxAge: 120000 }),
    );
    expect(String(res.cookie.mock.calls[0]?.[1])).not.toContain('?revealed=');
  });

  it('sets Secure in production', () => {
    const res = { cookie: jest.fn(), clearCookie: jest.fn() };
    setTokenRevealCookie(res as never, { projectId: 'p1', raw: 'gw_live_secretvalue' }, true);
    expect(res.cookie.mock.calls[0]?.[2]).toEqual(expect.objectContaining({ secure: true }));
  });

  it('reveals and consumes once for the issuing project', () => {
    const req: { signedCookies: Record<string, string> } = {
      signedCookies: { [TOKEN_REVEAL_COOKIE]: packedFor('p1', 'gw_live_secretvalue') },
    };
    const res = { clearCookie: jest.fn() };
    const first = consumeTokenRevealCookie(req as never, res as never, false, 'p1');
    expect(first).toBe('gw_live_secretvalue');
    expect(res.clearCookie).toHaveBeenCalledTimes(1);
    req.signedCookies = {};
    const second = consumeTokenRevealCookie(req as never, res as never, false, 'p1');
    expect(second).toBeUndefined();
  });

  it('does not render or consume a token issued for another project', () => {
    const req = {
      signedCookies: { [TOKEN_REVEAL_COOKIE]: packedFor('p1', 'gw_live_secretvalue') },
    };
    const res = { clearCookie: jest.fn() };
    const raw = consumeTokenRevealCookie(req as never, res as never, false, 'p2');
    expect(raw).toBeUndefined();
    expect(res.clearCookie).not.toHaveBeenCalled();
  });
});
