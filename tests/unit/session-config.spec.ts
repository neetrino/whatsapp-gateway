import { WhatsappAccountMode } from '@prisma/client';
import { buildSessionConfig, isNowebStoreEnabled } from '../../src/waha/session-config';

const options = {
  inboundWebhookUrl: 'http://gateway:3000',
  inboundWebhookSecret: 'test-webhook-secret-32-characters!!',
};

describe('session-config', () => {
  it('disables NOWEB Store for SEND_ONLY without webhooks', () => {
    const payload = buildSessionConfig('wa_test', WhatsappAccountMode.SEND_ONLY, options);
    expect(payload.config.noweb.store).toEqual({ enabled: false, fullSync: false });
    expect(payload.config.webhooks).toBeUndefined();
  });

  it('enables NOWEB Store and inbound webhooks for MESSENGER', () => {
    const payload = buildSessionConfig('wa_test', WhatsappAccountMode.MESSENGER, options);
    expect(payload.config.noweb.store).toEqual({ enabled: true, fullSync: false });
    expect(payload.config.webhooks?.[0]).toMatchObject({
      url: 'http://gateway:3000/internal/waha/events',
      hmac: { key: options.inboundWebhookSecret },
      events: expect.arrayContaining(['message', 'session.status']),
    });
  });

  it('reads store.enabled from WAHA session config', () => {
    expect(isNowebStoreEnabled({ noweb: { store: { enabled: true } } })).toBe(true);
    expect(isNowebStoreEnabled({ noweb: { store: { enabled: false } } })).toBe(false);
    expect(isNowebStoreEnabled(null)).toBe(false);
  });
});
