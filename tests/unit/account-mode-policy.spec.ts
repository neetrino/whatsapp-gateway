import { WhatsappAccountMode } from '../../src/common/db-enums';
import { ERROR_CODES } from '../../src/common/errors/error-codes';
import { AccountModePolicyService } from '../../src/waha/account-mode-policy.service';

describe('AccountModePolicyService', () => {
  const config = {
    get: jest.fn((key: string) => {
      if (key === 'GATEWAY_INTERNAL_URL') return 'http://gateway:3000';
      if (key === 'WAHA_WEBHOOK_SECRET') return 'test-webhook-secret-32-characters!!';
      throw new Error(`unexpected key ${key}`);
    }),
  };

  it('rejects SEND_ONLY for messenger APIs', () => {
    const service = new AccountModePolicyService({} as never, config as never);
    expect(() => service.assertMessengerMode(WhatsappAccountMode.SEND_ONLY)).toThrow(
      expect.objectContaining({ code: ERROR_CODES.ACCOUNT_MODE_NOT_SUPPORTED }),
    );
  });

  it('applies session config through WAHA PUT with Store and webhooks', async () => {
    const client = {
      updateSession: jest.fn().mockResolvedValue(undefined),
    };
    const service = new AccountModePolicyService(client as never, config as never);
    await service.applySessionConfig('wa_test', WhatsappAccountMode.MESSENGER);
    expect(client.updateSession).toHaveBeenCalledWith(
      'wa_test',
      expect.objectContaining({
        config: expect.objectContaining({
          noweb: { store: { enabled: true, fullSync: false } },
          webhooks: [
            expect.objectContaining({
              url: 'http://gateway:3000/internal/waha/events',
              hmac: { key: 'test-webhook-secret-32-characters!!' },
            }),
          ],
        }),
      }),
    );
  });
});
