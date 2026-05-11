import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

export const CHAT_ID_REGEX = /^[A-Za-z0-9._-]+@(c\.us|g\.us)$/;

export class SendMessageDto {
  @IsString({ message: 'chatId is required.' })
  @IsNotEmpty({ message: 'chatId is required.' })
  @MaxLength(128)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @Matches(CHAT_ID_REGEX, {
    message: 'Invalid chatId format. Expected WhatsApp chatId ending with @c.us or @g.us.',
  })
  chatId!: string;

  @IsString({ message: 'text is required.' })
  @IsNotEmpty({ message: 'text is required.' })
  text!: string;
}
