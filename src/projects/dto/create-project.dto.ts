import { IsString, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { CsrfFormDto } from '../../common/dto/csrf-form.dto';

export class CreateProjectDto extends CsrfFormDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(64)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  slug!: string;
}
