import { IsBoolean, IsOptional, IsUrl, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { CsrfFormDto } from '../../common/dto/csrf-form.dto';

export class UpdateProjectWebhookDto extends CsrfFormDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsUrl({ require_protocol: true, protocols: ['https'] })
  @MaxLength(2048)
  webhookUrl?: string;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === 'on')
  @IsBoolean()
  webhookEnabled?: boolean;
}
