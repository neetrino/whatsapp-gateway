import { createHash, randomBytes } from 'node:crypto';
import { hashApiToken } from '../common/utils/tokens';

export const WEBHOOK_SECRET_PREFIX = 'whsec';

export interface GeneratedWebhookSecret {
  /** One-time display value; same bytes used as outbound HMAC key and stored hash. */
  signingKey: string;
  tokenPrefix: string;
  last4: string;
  secretHash: string;
}

export const generateWebhookSecret = (pepper: string): GeneratedWebhookSecret => {
  const random = randomBytes(24).toString('base64url');
  const raw = `${WEBHOOK_SECRET_PREFIX}_${random}`;
  const secretHash = hashApiToken(raw, pepper);
  return {
    signingKey: secretHash,
    tokenPrefix: secretHash.slice(0, 6),
    last4: secretHash.slice(-4),
    secretHash,
  };
};

export const hashWebhookPayload = (payloadJson: string): string =>
  createHash('sha256').update(payloadJson, 'utf8').digest('hex');
