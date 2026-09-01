import type { WhatsappAccount } from '@prisma/client';
import { WahaService } from '../../src/waha/waha.service';
import { WahaApiError } from '../../src/waha/types/waha.types';

const account = { id: 'a1', sessionName: 'wa_old' } as WhatsappAccount;

describe('WahaService requestPairingCodeForDashboard', () => {
  it('skips WAHA when the account is already connected', async () => {
    const client = { requestPairingCode: jest.fn() };
    const svc = new WahaService({} as never, client as never, {} as never);
    const connected = { ...account, status: 'CONNECTED' } as WhatsappAccount;
    const r = await svc.requestPairingCodeForDashboard(connected, '37499111222', {
      requestId: 'req_connected',
      accountId: 'a1',
    });
    expect(client.requestPairingCode).not.toHaveBeenCalled();
    expect(r.code).toBeNull();
    expect(r.errorCode).toBe('WAHA_ALREADY_CONNECTED');
  });

  it('returns the pairing code without logging it in the result shape extras', async () => {
    const client = { requestPairingCode: jest.fn().mockResolvedValue('ABCD-ABCD') };
    const svc = new WahaService({} as never, client as never, {} as never);
    const r = await svc.requestPairingCodeForDashboard(account, '37499111222', {
      requestId: 'req_1',
      accountId: account.id,
    });
    expect(client.requestPairingCode).toHaveBeenCalledWith('wa_old', '37499111222');
    expect(r).toEqual({ code: 'ABCD-ABCD', errorCode: null, errorSummary: null });
  });

  it('maps session conflict to a safe view model', async () => {
    const client = {
      requestPairingCode: jest.fn().mockRejectedValue(new WahaApiError('conflict', 409)),
    };
    const svc = new WahaService({} as never, client as never, {} as never);
    const r = await svc.requestPairingCodeForDashboard(account, '37499111222', {
      requestId: 'req_2',
      accountId: account.id,
    });
    expect(r.code).toBeNull();
    expect(r.errorCode).toBe('WAHA_HTTP_409');
  });
});
