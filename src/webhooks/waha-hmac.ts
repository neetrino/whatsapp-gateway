import { createHmac, timingSafeEqual } from 'node:crypto';

export const computeWahaWebhookHmac = (rawBody: Buffer, secret: string): string =>
  createHmac('sha512', secret).update(rawBody).digest('hex');

export const verifyWahaWebhookHmac = (
  rawBody: Buffer,
  secret: string,
  received: string | undefined,
  algorithm: string | undefined,
): boolean => {
  if (!received || algorithm?.toLowerCase() !== 'sha512') return false;
  const expected = computeWahaWebhookHmac(rawBody, secret);
  if (expected.length !== received.length) return false;
  return timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(received, 'utf8'));
};

/** Project outbound: HMAC-SHA512 over `${timestamp}.${rawBody}`. */
export const computeProjectWebhookSignature = (
  timestamp: string,
  rawBody: Buffer,
  signingKey: string,
): string => {
  const signedMaterial = `${timestamp}.${rawBody.toString('utf8')}`;
  return createHmac('sha512', signingKey).update(signedMaterial, 'utf8').digest('hex');
};

export const PROJECT_WEBHOOK_SIGNATURE_ALGORITHM = 'sha512';
