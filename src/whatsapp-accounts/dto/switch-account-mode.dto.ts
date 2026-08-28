import { IsEnum } from 'class-validator';
import { WhatsappAccountMode } from '../../common/db-enums';
import { CsrfFormDto } from '../../common/dto/csrf-form.dto';

export class SwitchAccountModeDto extends CsrfFormDto {
  @IsEnum(WhatsappAccountMode)
  mode!: WhatsappAccountMode;
}
