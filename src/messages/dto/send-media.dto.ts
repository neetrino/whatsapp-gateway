import { IsIn, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { CHAT_ID_REGEX } from './send-message.dto';

export class SendMediaDto {
  @IsString({ message: 'chatId is required.' })
  @IsNotEmpty({ message: 'chatId is required.' })
  @MaxLength(128)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @Matches(CHAT_ID_REGEX, {
    message: 'Invalid chatId format. Expected WhatsApp chatId ending with @c.us or @g.us.',
  })
  chatId!: string;

  @IsString({ message: 'mediaType is required.' })
  @IsIn(['IMAGE', 'VIDEO'], {
    message: 'mediaType must be IMAGE or VIDEO.',
  })
  mediaType!: 'IMAGE' | 'VIDEO';

  @IsString({ message: 'mediaUrl is required.' })
  @IsNotEmpty({ message: 'mediaUrl is required.' })
  @MaxLength(2048)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  mediaUrl!: string;

  @IsOptional()
  @IsString()
  caption?: string;
}
