import { generateApiToken, hashApiToken } from '../../src/common/utils/tokens';

describe('tokens util', () => {
  it('generateApiToken produces a token with the requested prefix and a 4-char last4', () => {
    const t = generateApiToken('gw_live');
    expect(t.raw.startsWith('gw_live_')).toBe(true);
    expect(t.tokenPrefix).toBe('gw_live');
    expect(t.last4).toHaveLength(4);
    expect(t.raw.endsWith(t.last4)).toBe(true);
  });

  it('different generations produce different tokens', () => {
    const a = generateApiToken('gw_live');
    const b = generateApiToken('gw_live');
    expect(a.raw).not.toBe(b.raw);
  });

  it('hashApiToken is deterministic with the same pepper and changes when pepper changes', () => {
    const raw = 'gw_live_abcdefghijklmnopqrstuvwxyz';
    const h1 = hashApiToken(raw, 'pepper-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
    const h2 = hashApiToken(raw, 'pepper-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
    const h3 = hashApiToken(raw, 'pepper-BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB');
    expect(h1).toBe(h2);
    expect(h1).not.toBe(h3);
    expect(h1).toHaveLength(64); // sha256 hex
  });

  it('produces different hashes for different raw inputs', () => {
    const pepper = 'pepper-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    expect(hashApiToken('a', pepper)).not.toBe(hashApiToken('b', pepper));
  });
});
