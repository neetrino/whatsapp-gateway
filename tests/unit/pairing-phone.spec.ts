import { isValidPairingPhone, normalizePairingPhone } from '../../src/common/utils/pairing-phone';

describe('pairing phone', () => {
  it('strips formatting and keeps country-code digits', () => {
    expect(normalizePairingPhone('+374 99 111 222')).toBe('37499111222');
    expect(normalizePairingPhone('1-213-213-2130')).toBe('12132132130');
  });

  it('rejects empty or too-short values', () => {
    expect(normalizePairingPhone('')).toBe('');
    expect(normalizePairingPhone(12)).toBe('');
    expect(isValidPairingPhone('1234567')).toBe(false);
    expect(isValidPairingPhone('12345678')).toBe(true);
  });
});
