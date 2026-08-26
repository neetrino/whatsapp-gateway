import { IsEnum, IsString, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { WhatsappAccountMode } from '@prisma/client';
import { CsrfFormDto } from '../../common/dto/csrf-form.dto';

export class CreateWhatsappAccountDto extends CsrfFormDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  label!: string;

  @IsEnum(WhatsappAccountMode)
  mode!: WhatsappAccountMode;
}
