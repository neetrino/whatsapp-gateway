import { SessionStatus } from '../../src/common/db-enums';
import { ERROR_CODES } from '../../src/common/errors/error-codes';
import { AppException } from '../../src/common/errors/app.exception';
import {
  isQrStillPending,
  toQrUnavailableException,
  toSessionMutationException,
} from '../../src/v1/v1-session-errors';

describe('v1 session errors', () => {
  it('treats missing QR as pending unless the session is connected or failed', () => {
    expect(isQrStillPending('WAHA_HTTP_404', SessionStatus.QR_REQUIRED)).toBe(true);
    expect(isQrStillPending(null, SessionStatus.CONNECTING)).toBe(true);
    expect(isQrStillPending('WAHA_HTTP_404', SessionStatus.CONNECTED)).toBe(false);
    expect(isQrStillPending('WAHA_HTTP_404', SessionStatus.ERROR)).toBe(false);
    expect(isQrStillPending('WAHA_HTTP_401', SessionStatus.QR_REQUIRED)).toBe(false);
  });

  it('maps a session conflict without leaking WAHA internals', () => {
    const error = toQrUnavailableException('WAHA_HTTP_409');
    expect(error).toMatchObject({
      code: ERROR_CODES.SESSION_CONFLICT,
    });
    expect(error.message).not.toMatch(/waha|api key|sessionName/i);
  });

  it('maps other QR failures to WAHA_UNAVAILABLE', () => {
    expect(toQrUnavailableException('WAHA_HTTP_401').code).toBe(ERROR_CODES.WAHA_UNAVAILABLE);
    expect(toQrUnavailableException('WAHA_HTTP_422').code).toBe(ERROR_CODES.WAHA_UNAVAILABLE);
  });

  it('preserves AppException on session mutations', () => {
    const original = new AppException({
      code: ERROR_CODES.NOT_FOUND,
      message: 'WhatsApp account not found.',
      status: 404,
    });
    expect(toSessionMutationException(original)).toBe(original);
    expect(toSessionMutationException(new Error('boom')).code).toBe(ERROR_CODES.WAHA_UNAVAILABLE);
  });
});
