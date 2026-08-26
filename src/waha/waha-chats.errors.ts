import { AppException } from '../common/errors/app.exception';
import { ERROR_CODES } from '../common/errors/error-codes';
import { WahaApiError, WahaTransportError } from './types/waha.types';

const storeHint = (error: unknown): boolean => {
  const text =
    error instanceof WahaApiError
      ? `${error.message} ${error.upstreamCode ?? ''}`
      : error instanceof Error
        ? error.message
        : '';
  return /store/i.test(text) || /enable noweb store/i.test(text);
};

export const toChatsListException = (error: unknown): AppException => {
  if (error instanceof AppException) return error;
  if (storeHint(error)) {
    return new AppException({
      code: ERROR_CODES.STORE_NOT_READY,
      message: 'NOWEB Store is not ready for this session yet.',
      status: 503,
    });
  }
  if (error instanceof WahaTransportError || error instanceof WahaApiError) {
    return new AppException({
      code: ERROR_CODES.CHATS_LIST_FAILED,
      message: 'Failed to list chats from WhatsApp Store.',
      status: 502,
    });
  }
  return new AppException({
    code: ERROR_CODES.CHATS_LIST_FAILED,
    message: 'Failed to list chats from WhatsApp Store.',
    status: 502,
  });
};

export const toChatMessagesException = (error: unknown): AppException => {
  if (error instanceof AppException) return error;
  if (storeHint(error)) {
    return new AppException({
      code: ERROR_CODES.STORE_NOT_READY,
      message: 'NOWEB Store is not ready for this session yet.',
      status: 503,
    });
  }
  if (error instanceof WahaTransportError || error instanceof WahaApiError) {
    return new AppException({
      code: ERROR_CODES.CHAT_MESSAGES_FAILED,
      message: 'Failed to list chat messages from WhatsApp Store.',
      status: 502,
    });
  }
  return new AppException({
    code: ERROR_CODES.CHAT_MESSAGES_FAILED,
    message: 'Failed to list chat messages from WhatsApp Store.',
    status: 502,
  });
};

export const storeNotReadyException = (): AppException =>
  new AppException({
    code: ERROR_CODES.STORE_NOT_READY,
    message: 'NOWEB Store is not ready for this session yet.',
    status: 503,
  });
