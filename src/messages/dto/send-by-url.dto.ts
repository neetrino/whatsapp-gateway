import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, Matches } from 'class-validator';
import { CHAT_ID_REGEX } from './send-message.dto';

export class SendByUrlDto {
  @IsString({ message: 'token is required.' })
  @IsNotEmpty({ message: 'token is required.' })
  @Matches(/^[A-Za-z0-9_\-.]{8,256}$/, {
    message: 'Invalid API token.',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  token!: string;

  @IsString({ message: 'chatId is required.' })
  @IsNotEmpty({ message: 'chatId is required.' })
  @Matches(CHAT_ID_REGEX, {
    message: 'Invalid chatId format. Expected WhatsApp chatId ending with @c.us or @g.us.',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  chatId!: string;

  @IsString({ message: 'text is required.' })
  @IsNotEmpty({ message: 'text is required.' })
  text!: string;
}
