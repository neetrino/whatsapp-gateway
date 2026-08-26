import { Injectable, PipeTransform } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AppException } from '../common/errors/app.exception';
import { ERROR_CODES } from '../common/errors/error-codes';
import { throwFromValidationErrors } from '../common/pipes/validation.factory';
import {
  V1ImageMessageDto,
  V1TextMessageDto,
  V1VideoMessageDto,
  type V1SendMessageDto,
} from './dto/send-v1-message.dto';

const BY_TYPE = {
  TEXT: V1TextMessageDto,
  IMAGE: V1ImageMessageDto,
  VIDEO: V1VideoMessageDto,
} as const;

@Injectable()
export class V1SendMessagePipe implements PipeTransform {
  async transform(value: unknown): Promise<V1SendMessageDto> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new AppException({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: 'Request body must be an object.',
        status: 400,
      });
    }
    const type = (value as { type?: unknown }).type;
    if (typeof type !== 'string' || !(type in BY_TYPE)) {
      throw new AppException({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: 'type must be TEXT, IMAGE, or VIDEO.',
        status: 400,
      });
    }
    const instance =
      type === 'TEXT'
        ? plainToInstance(V1TextMessageDto, value)
        : type === 'IMAGE'
          ? plainToInstance(V1ImageMessageDto, value)
          : plainToInstance(V1VideoMessageDto, value);
    const errors = await validate(instance, {
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
    });
    if (errors.length > 0) throw throwFromValidationErrors(errors);
    return instance as V1SendMessageDto;
  }
}
