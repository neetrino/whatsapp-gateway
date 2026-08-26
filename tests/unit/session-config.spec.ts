import { WhatsappAccountMode } from '@prisma/client';
import { buildSessionConfig, isNowebStoreEnabled } from '../../src/waha/session-config';

describe('session-config', () => {
  it('disables NOWEB Store for SEND_ONLY', () => {
    const payload = buildSessionConfig('wa_test', WhatsappAccountMode.SEND_ONLY);
    expect(payload.config.noweb.store).toEqual({ enabled: false, fullSync: false });
  });

  it('enables NOWEB Store for MESSENGER with fullSync false', () => {
    const payload = buildSessionConfig('wa_test', WhatsappAccountMode.MESSENGER);
    expect(payload.config.noweb.store).toEqual({ enabled: true, fullSync: false });
  });

  it('reads store.enabled from WAHA session config', () => {
    expect(isNowebStoreEnabled({ noweb: { store: { enabled: true } } })).toBe(true);
    expect(isNowebStoreEnabled({ noweb: { store: { enabled: false } } })).toBe(false);
    expect(isNowebStoreEnabled(null)).toBe(false);
  });
});
