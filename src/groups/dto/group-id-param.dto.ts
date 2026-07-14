import { IsString, Matches, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { GROUP_ID_REGEX } from '../constants/group.constants';

export class GroupIdParamDto {
  @IsString({ message: 'groupId is required.' })
  @MaxLength(128)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @Matches(GROUP_ID_REGEX, {
    message: 'Invalid groupId format. Expected WhatsApp group id ending with @g.us.',
  })
  groupId!: string;
}
