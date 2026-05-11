import { ValidationError, ValidationPipeOptions } from '@nestjs/common';
import { AppException } from '../errors/app.exception';
import { ERROR_CODES, type ErrorCode } from '../errors/error-codes';

const collectMessages = (errors: ValidationError[], path: string[] = []): string[] => {
  const messages: string[] = [];
  for (const err of errors) {
    const fullPath = [...path, err.property];
    if (err.constraints) {
      for (const message of Object.values(err.constraints)) {
        messages.push(message);
      }
    }
    if (err.children?.length) {
      messages.push(...collectMessages(err.children, fullPath));
    }
  }
  return messages;
};

const inferCode = (messages: string[]): ErrorCode => {
  if (messages.some((m) => m.includes('Invalid chatId format'))) {
    return ERROR_CODES.INVALID_CHAT_ID;
  }
  if (messages.some((m) => m.toLowerCase().includes('mediatype'))) {
    return ERROR_CODES.INVALID_MEDIA_TYPE;
  }
  return ERROR_CODES.VALIDATION_ERROR;
};

export const VALIDATION_PIPE_OPTIONS: ValidationPipeOptions = {
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: false },
  exceptionFactory: (errors: ValidationError[]) => {
    const messages = collectMessages(errors);
    const code = inferCode(messages);
    return new AppException({
      code,
      message: messages[0] ?? 'Validation failed.',
      status: 400,
    });
  },
};
