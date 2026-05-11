import { IsEmail, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';
import { CsrfFormDto } from '../../common/dto/csrf-form.dto';

export class LoginDto extends CsrfFormDto {
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(255)
  password!: string;
}
