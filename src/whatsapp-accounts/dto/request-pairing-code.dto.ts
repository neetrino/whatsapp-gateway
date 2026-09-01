import { Matches } from 'class-validator';
import { Transform } from 'class-transformer';
import { CsrfFormDto } from '../../common/dto/csrf-form.dto';
import {
  PAIRING_PHONE_MAX_DIGITS,
  PAIRING_PHONE_MIN_DIGITS,
  normalizePairingPhone,
} from '../../common/utils/pairing-phone';

export class RequestPairingCodeDto extends CsrfFormDto {
  @Transform(({ value }) => normalizePairingPhone(value))
  @Matches(new RegExp(`^\\d{${PAIRING_PHONE_MIN_DIGITS},${PAIRING_PHONE_MAX_DIGITS}}$`), {
    message: 'phoneNumber must be 8–15 digits including country code (no +).',
  })
  phoneNumber!: string;
}
