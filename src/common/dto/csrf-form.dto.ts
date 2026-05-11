import { IsOptional, IsString } from 'class-validator';

/**
 * Dashboard HTML forms include a hidden `_csrf` field. Global ValidationPipe uses
 * `forbidNonWhitelisted`; subclasses allow `_csrf` without treating it as business data.
 * API message DTOs must not extend this class.
 */
export class CsrfFormDto {
  @IsOptional()
  @IsString()
  _csrf?: string;
}
