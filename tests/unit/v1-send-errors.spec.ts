import { ERROR_CODES } from '../../src/common/errors/error-codes';
import { exceptionFromStoredFailure } from '../../src/v1/v1-send-errors';

describe('exceptionFromStoredFailure', () => {
  it.each([
    [ERROR_CODES.ACCOUNT_INACTIVE, 409],
    [ERROR_CODES.WHATSAPP_NOT_CONNECTED, 409],
    [ERROR_CODES.VALIDATION_ERROR, 400],
    [ERROR_CODES.INVALID_MEDIA_URL, 400],
    [ERROR_CODES.IMAGE_SEND_FAILED, 502],
    [ERROR_CODES.VIDEO_SEND_FAILED, 502],
    [ERROR_CODES.MESSAGE_SEND_FAILED, 502],
    [ERROR_CODES.MESSAGE_OUTCOME_UNKNOWN, 503],
  ] as const)('maps %s to HTTP %s', (code, status) => {
    const error = exceptionFromStoredFailure(code);
    expect(error.code).toBe(code);
    expect(error.getStatus()).toBe(status);
    expect(error.message).not.toMatch(/waha|upstream|stack/i);
  });

  it('falls back to MESSAGE_SEND_FAILED for unknown codes', () => {
    const error = exceptionFromStoredFailure('SOME_PROVIDER_TEXT');
    expect(error.code).toBe(ERROR_CODES.MESSAGE_SEND_FAILED);
    expect(error.getStatus()).toBe(502);
  });
});
