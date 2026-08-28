import { ERROR_CODES } from '../../src/common/errors/error-codes';
import { AppException } from '../../src/common/errors/app.exception';
import { safeErrorSummary, toSendAppException } from '../../src/v1/v1-send-errors';
import { WahaApiError, WahaTransportError } from '../../src/waha/types/waha.types';

describe('toSendAppException', () => {
  it('passes AppException through', () => {
    const original = new AppException({
      code: ERROR_CODES.VALIDATION_ERROR,
      message: 'text is required.',
      status: 400,
    });
    expect(toSendAppException(original, 'TEXT')).toBe(original);
  });

  it('maps transport errors to MESSAGE_OUTCOME_UNKNOWN', () => {
    const error = toSendAppException(new WahaTransportError('timeout'), 'TEXT');
    expect(error.code).toBe(ERROR_CODES.MESSAGE_OUTCOME_UNKNOWN);
    expect(error.getStatus()).toBe(503);
  });

  it.each([
    ['TEXT', ERROR_CODES.MESSAGE_SEND_FAILED],
    ['IMAGE', ERROR_CODES.IMAGE_SEND_FAILED],
    ['VIDEO', ERROR_CODES.VIDEO_SEND_FAILED],
  ] as const)('maps WAHA API errors for %s', (kind, code) => {
    const error = toSendAppException(new WahaApiError('upstream body', 500), kind);
    expect(error.code).toBe(code);
    expect(error.getStatus()).toBe(502);
    expect(error.message).not.toMatch(/waha|upstream|stack/i);
  });

  it('falls back to MESSAGE_SEND_FAILED for unknown errors', () => {
    const error = toSendAppException(new Error('boom'), 'TEXT');
    expect(error.code).toBe(ERROR_CODES.MESSAGE_SEND_FAILED);
    expect(error.getStatus()).toBe(502);
  });
});

describe('safeErrorSummary', () => {
  it('never includes upstream text', () => {
    expect(safeErrorSummary(new WahaApiError('secret stack', 502))).toBe('WAHA_HTTP_502');
    expect(safeErrorSummary(new WahaTransportError('econnrefused'))).toBe('WAHA_TRANSPORT');
    expect(safeErrorSummary(new Error('boom'))).toBe(ERROR_CODES.INTERNAL_ERROR);
  });
});
