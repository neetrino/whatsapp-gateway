import { SessionStatus, WhatsappAccountMode } from '../../src/common/db-enums';
import { ERROR_CODES } from '../../src/common/errors/error-codes';
import { V1AccountsService } from '../../src/v1/v1-accounts.service';

const project = { apiTokenId: 't1', projectId: 'p1' };

const account = {
  id: 'acc-a',
  projectId: 'p1',
  label: 'Outbound',
  mode: WhatsappAccountMode.SEND_ONLY,
  sessionName: 'wa_secret',
  status: SessionStatus.QR_REQUIRED,
  phoneNumber: null,
  isActive: true,
  createdAt: new Date('2026-08-01T00:00:00.000Z'),
  updatedAt: new Date('2026-08-01T00:00:00.000Z'),
};

const connected = {
  ...account,
  status: SessionStatus.CONNECTED,
  phoneNumber: '37499111222',
};

describe('V1AccountsService session QR', () => {
  const accountsService = {
    getByIdForProject: jest.fn(),
    startOrEnsureSession: jest.fn(),
    refreshStatus: jest.fn(),
    getQrForPage: jest.fn(),
    restart: jest.fn(),
    unlink: jest.fn(),
  };

  const service = new V1AccountsService(accountsService as never);

  beforeEach(() => {
    jest.clearAllMocks();
    accountsService.getByIdForProject.mockResolvedValue(account);
    accountsService.startOrEnsureSession.mockResolvedValue(undefined);
    accountsService.refreshStatus.mockResolvedValue(account);
    accountsService.getQrForPage.mockResolvedValue({
      dataUrl: 'data:image/png;base64,abc',
      errorCode: null,
      errorSummary: null,
    });
  });

  it('returns a QR image and never exposes sessionName', async () => {
    const result = await service.getQr(project, 'acc-a', 'req_1');
    expect(result).toEqual({
      id: 'acc-a',
      status: SessionStatus.QR_REQUIRED,
      phoneNumber: null,
      qrDataUrl: 'data:image/png;base64,abc',
    });
    expect(JSON.stringify(result)).not.toContain('wa_secret');
    expect(accountsService.startOrEnsureSession).toHaveBeenCalledWith(account);
  });

  it('returns no QR when the session is already connected', async () => {
    accountsService.refreshStatus.mockResolvedValue(connected);
    const result = await service.getQr(project, 'acc-a', 'req_1');
    expect(result.qrDataUrl).toBeNull();
    expect(result.status).toBe(SessionStatus.CONNECTED);
    expect(result.phoneNumber).toBe('•••••••1222');
    expect(accountsService.getQrForPage).not.toHaveBeenCalled();
  });

  it('returns a pending QR when WAHA has not issued one yet', async () => {
    accountsService.getQrForPage.mockResolvedValue({
      dataUrl: null,
      errorCode: 'WAHA_HTTP_404',
      errorSummary: 'hidden',
    });
    const result = await service.getQr(project, 'acc-a', 'req_1');
    expect(result.qrDataUrl).toBeNull();
    expect(result.status).toBe(SessionStatus.QR_REQUIRED);
  });

  it('maps a session conflict without leaking provider text', async () => {
    accountsService.getQrForPage.mockResolvedValue({
      dataUrl: null,
      errorCode: 'WAHA_HTTP_409',
      errorSummary: 'WAHA returned 409 (session conflict). Try “Restart session”.',
    });
    await expect(service.getQr(project, 'acc-a', 'req_1')).rejects.toMatchObject({
      code: ERROR_CODES.SESSION_CONFLICT,
    });
  });

  it('logs out then returns refreshed status', async () => {
    accountsService.refreshStatus.mockResolvedValue({
      ...account,
      status: SessionStatus.DISCONNECTED,
    });
    const result = await service.logout(project, 'acc-a');
    expect(accountsService.unlink).toHaveBeenCalledWith(account);
    expect(result.status).toBe(SessionStatus.DISCONNECTED);
    expect(JSON.stringify(result)).not.toContain('wa_secret');
  });

  it('restarts then returns refreshed status', async () => {
    accountsService.refreshStatus.mockResolvedValue(account);
    const result = await service.restart(project, 'acc-a');
    expect(accountsService.restart).toHaveBeenCalledWith(account);
    expect(result.id).toBe('acc-a');
  });

  it('maps session mutation failures to WAHA_UNAVAILABLE', async () => {
    accountsService.unlink.mockRejectedValueOnce(new Error('upstream'));
    await expect(service.logout(project, 'acc-a')).rejects.toMatchObject({
      code: ERROR_CODES.WAHA_UNAVAILABLE,
    });
  });
});
