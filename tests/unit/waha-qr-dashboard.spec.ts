import type { WhatsappAccount } from '@prisma/client';
import { WahaService } from '../../src/waha/waha.service';
import { WahaApiError } from '../../src/waha/types/waha.types';

const account = { id: 'a1', sessionName: 'wa_old' } as WhatsappAccount;

describe('WahaService getQrForDashboard / effectiveSessionName', () => {
  it('skips QR call when account is already connected', async () => {
    const client = { getQr: jest.fn() };
    const config = { get: jest.fn(() => 'default') };
    const svc = new WahaService({} as never, client as never, config as never);
    const connected = { ...account, status: 'CONNECTED' } as WhatsappAccount;
    const r = await svc.getQrForDashboard(connected, {
      requestId: 'req_connected',
      accountId: 'a1',
    });
    expect(client.getQr).not.toHaveBeenCalled();
    expect(r.errorCode).toBe('WAHA_ALREADY_CONNECTED');
    expect(r.errorSummary).toBe('Session is already connected. QR is not required.');
  });

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

  it('maps WAHA 422 already-connected to WAHA_ALREADY_CONNECTED', async () => {
    const client = {
      getQr: jest
        .fn()
        .mockRejectedValue(new WahaApiError('Session is already connected and WORKING', 422)),
    };
    const config = { get: jest.fn() };
    const svc = new WahaService({} as never, client as never, config as never);
    const r = await svc.getQrForDashboard(account, { requestId: 'req_4', accountId: account.id });
    expect(r.dataUrl).toBeNull();
    expect(r.errorCode).toBe('WAHA_ALREADY_CONNECTED');
    expect(r.errorSummary).toBe('Session is already connected. QR is not required.');
  });
});
