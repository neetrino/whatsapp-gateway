/** WhatsApp pairing-code API expects digits only, country code included, no `+`. */
export const PAIRING_PHONE_MIN_DIGITS = 8;
export const PAIRING_PHONE_MAX_DIGITS = 15;

export const normalizePairingPhone = (raw: unknown): string => {
  if (typeof raw !== 'string') return '';
  return raw.replace(/\D/g, '');
};

export const isValidPairingPhone = (digits: string): boolean =>
  digits.length >= PAIRING_PHONE_MIN_DIGITS && digits.length <= PAIRING_PHONE_MAX_DIGITS;
