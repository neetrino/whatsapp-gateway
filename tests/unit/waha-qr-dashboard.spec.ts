import type { WhatsappAccount } from '@prisma/client';
import { WahaService } from '../../src/waha/waha.service';
import { WahaApiError } from '../../src/waha/types/waha.types';

const account = { id: 'a1', sessionName: 'wa_old' } as WhatsappAccount;

describe('WahaService getQrForDashboard / effectiveSessionName', () => {
  it('calls WAHA getQr with WAHA_SESSION_NAME when configured', async () => {
    const client = { getQr: jest.fn().mockResolvedValue({ mimeType: 'image/png', data: 'QQ==' }) };
    const config = {
      get: jest.fn((k: string) => (k === 'WAHA_SESSION_NAME' ? 'default' : undefined)),
    };
    const svc = new WahaService({} as never, client as never, config as never);
    await svc.getQrForDashboard(account, { requestId: 'req_1', accountId: account.id });
    expect(client.getQr).toHaveBeenCalledWith('default');
    expect(config.get).toHaveBeenCalledWith('WAHA_SESSION_NAME', { infer: true });
  });

  it('normalizes PNG payload to a data URL', async () => {
    const client = {
      getQr: jest.fn().mockResolvedValue({ mimeType: 'image/png', data: 'YmFi' }),
    };
    const config = { get: jest.fn() };
    const svc = new WahaService({} as never, client as never, config as never);
    const r = await svc.getQrForDashboard(account, { requestId: 'req_2', accountId: account.id });
    expect(r.dataUrl).toBe('data:image/png;base64,YmFi');
    expect(r.errorCode).toBeNull();
  });

  it('maps WAHA Core only-default-session 422 to a safe QrViewModel', async () => {
    const client = {
      getQr: jest
        .fn()
        .mockRejectedValue(
          new WahaApiError(
            "WAHA Core support only 'default' session. You tried to access 'wa_x'.",
            422,
            'x',
          ),
        ),
    };
    const config = { get: jest.fn() };
    const svc = new WahaService({} as never, client as never, config as never);
    const r = await svc.getQrForDashboard(account, { requestId: 'req_3', accountId: account.id });
    expect(r.dataUrl).toBeNull();
    expect(r.errorCode).toBe('WAHA_CORE_DEFAULT_SESSION_ONLY');
    expect(r.errorSummary).toContain('default');
  });
});
