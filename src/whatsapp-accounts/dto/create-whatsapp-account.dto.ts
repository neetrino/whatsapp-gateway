import { IsString, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { CsrfFormDto } from '../../common/dto/csrf-form.dto';

export class CreateWhatsappAccountDto extends CsrfFormDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  label!: string;
}

export class AdminCreateWhatsappAccountDto extends CreateWhatsappAccountDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  userId!: string;
}
