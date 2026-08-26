import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { Equals } from 'class-validator';
import { Transform } from 'class-transformer';
import { CHAT_ID_REGEX } from '../../messages/dto/send-message.dto';

class V1ChatIdDto {
  @IsString({ message: 'chatId is required.' })
  @IsNotEmpty({ message: 'chatId is required.' })
  @MaxLength(128)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @Matches(CHAT_ID_REGEX, {
    message: 'Invalid chatId format. Expected WhatsApp chatId ending with @c.us or @g.us.',
  })
  chatId!: string;
}

export class V1TextMessageDto extends V1ChatIdDto {
  @Equals('TEXT', { message: 'type must be TEXT, IMAGE, or VIDEO.' })
  type!: 'TEXT';

  @IsString({ message: 'text is required.' })
  @IsNotEmpty({ message: 'text is required.' })
  text!: string;
}

export class V1ImageMessageDto extends V1ChatIdDto {
  @Equals('IMAGE', { message: 'type must be TEXT, IMAGE, or VIDEO.' })
  type!: 'IMAGE';

  @IsString({ message: 'mediaUrl is required.' })
  @IsNotEmpty({ message: 'mediaUrl is required.' })
  @MaxLength(2048)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  mediaUrl!: string;

  @IsOptional()
  @IsString()
  caption?: string;
}

export class V1VideoMessageDto extends V1ChatIdDto {
  @Equals('VIDEO', { message: 'type must be TEXT, IMAGE, or VIDEO.' })
  type!: 'VIDEO';

  @IsString({ message: 'mediaUrl is required.' })
  @IsNotEmpty({ message: 'mediaUrl is required.' })
  @MaxLength(2048)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  mediaUrl!: string;

  @IsOptional()
  @IsString()
  caption?: string;
}

export type V1SendMessageDto = V1TextMessageDto | V1ImageMessageDto | V1VideoMessageDto;
