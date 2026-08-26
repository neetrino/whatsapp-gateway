import { WhatsappAccountMode } from '@prisma/client';
import { ERROR_CODES } from '../../src/common/errors/error-codes';
import { AccountModePolicyService } from '../../src/waha/account-mode-policy.service';

describe('AccountModePolicyService', () => {
  it('rejects SEND_ONLY for messenger APIs', () => {
    const service = new AccountModePolicyService({} as never);
    expect(() => service.assertMessengerMode(WhatsappAccountMode.SEND_ONLY)).toThrow(
      expect.objectContaining({ code: ERROR_CODES.ACCOUNT_MODE_NOT_SUPPORTED }),
    );
  });

  it('applies session config through WAHA PUT', async () => {
    const client = {
      updateSession: jest.fn().mockResolvedValue(undefined),
    };
    const service = new AccountModePolicyService(client as never);
    await service.applySessionConfig('wa_test', WhatsappAccountMode.MESSENGER);
    expect(client.updateSession).toHaveBeenCalledWith(
      'wa_test',
      expect.objectContaining({
        config: { noweb: { store: { enabled: true, fullSync: false } } },
      }),
    );
  });
});
