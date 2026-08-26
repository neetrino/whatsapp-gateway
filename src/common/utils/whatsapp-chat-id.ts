import { AppException } from '../errors/app.exception';
import { ERROR_CODES } from '../errors/error-codes';
import { CHAT_ID_REGEX } from '../../messages/dto/send-message.dto';

const INVALID_CHAT_ID_MESSAGE =
  'Invalid chatId format. Expected WhatsApp chatId ending with @c.us or @g.us.';

export const parseWhatsappChatId = (value: unknown): string => {
  if (typeof value !== 'string') {
    throw new AppException({
      code: ERROR_CODES.INVALID_CHAT_ID,
      message: INVALID_CHAT_ID_MESSAGE,
      status: 400,
    });
  }
  const chatId = value.trim();
  if (!CHAT_ID_REGEX.test(chatId)) {
    throw new AppException({
      code: ERROR_CODES.INVALID_CHAT_ID,
      message: INVALID_CHAT_ID_MESSAGE,
      status: 400,
    });
  }
  return chatId;
};
