import {
  computeProjectWebhookSignature,
  computeWahaWebhookHmac,
  verifyWahaWebhookHmac,
} from '../../src/webhooks/waha-hmac';

describe('waha-hmac', () => {
  const secret = 'my-secret-key';
  const body = Buffer.from(
    JSON.stringify({ event: 'message', session: 'default', engine: 'NOWEB' }),
    'utf8',
  );

  it('matches WAHA docs example algorithm', () => {
    const digest = computeWahaWebhookHmac(body, secret);
    expect(digest).toHaveLength(128);
    expect(verifyWahaWebhookHmac(body, secret, digest, 'sha512')).toBe(true);
  });

  it('rejects invalid signatures', () => {
    expect(verifyWahaWebhookHmac(body, secret, 'deadbeef', 'sha512')).toBe(false);
    expect(
      verifyWahaWebhookHmac(body, secret, computeWahaWebhookHmac(body, secret), 'sha256'),
    ).toBe(false);
  });

  it('signs Project webhooks as timestamp dot raw body', () => {
    const payload = Buffer.from('{"eventId":"evt_1"}', 'utf8');
    const timestamp = '1700000000000';
    const sig = computeProjectWebhookSignature(timestamp, payload, secret);
    expect(sig).toHaveLength(128);
    expect(sig).not.toBe(computeWahaWebhookHmac(payload, secret));
    expect(computeProjectWebhookSignature(timestamp, payload, secret)).toBe(sig);
  });
});
