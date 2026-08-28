import { Logger } from '@nestjs/common';
import { AppException } from '../common/errors/app.exception';
import { ERROR_CODES } from '../common/errors/error-codes';
import { WahaApiError, WahaTransportError } from '../waha/types/waha.types';
import { GROUP_ID_REGEX } from './constants/group.constants';

const logger = new Logger('GroupsService');

export const assertGroupId = (groupId: string): void => {
  if (!GROUP_ID_REGEX.test(groupId)) {
    throw new AppException({
      code: ERROR_CODES.INVALID_GROUP_ID,
      message: 'Invalid groupId format. Expected WhatsApp group id ending with @g.us.',
      status: 400,
    });
  }
};

export const mapGroupProviderError = (
  error: unknown,
  code: string,
  message: string,
): AppException => {
  if (error instanceof AppException) return error;
  if (error instanceof WahaTransportError) {
    return new AppException({
      code: ERROR_CODES.WAHA_UNAVAILABLE,
      message: 'WAHA service is currently unavailable.',
      status: 503,
    });
  }
  if (error instanceof WahaApiError && error.status === 404) {
    return new AppException({
      code: ERROR_CODES.GROUP_NOT_FOUND,
      message: 'WhatsApp group not found.',
      status: 404,
    });
  }
  logger.warn({
    msg: 'group_provider_error',
    code,
    error: error instanceof Error ? error.message : 'unknown',
  });
  return new AppException({
    code: code as typeof ERROR_CODES.GROUP_LIST_FAILED,
    message,
    status: 502,
  });
};
