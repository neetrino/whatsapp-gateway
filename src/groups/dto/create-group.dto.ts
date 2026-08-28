import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import {
  MAX_GROUP_PARTICIPANTS_PER_REQUEST,
  PARTICIPANT_JID_REGEX,
} from '../constants/group.constants';

export class CreateGroupDto {
  @IsString({ message: 'name is required.' })
  @IsNotEmpty({ message: 'name is required.' })
  @MaxLength(100)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name!: string;

  @IsArray({ message: 'participants must be an array.' })
  @ArrayMinSize(1, { message: 'participants must contain at least one participant.' })
  @ArrayMaxSize(MAX_GROUP_PARTICIPANTS_PER_REQUEST, {
    message: `participants must contain at most ${MAX_GROUP_PARTICIPANTS_PER_REQUEST} items.`,
  })
  @IsString({ each: true, message: 'Each participant must be a string.' })
  @Matches(PARTICIPANT_JID_REGEX, {
    each: true,
    message: 'Invalid participant format. Expected digits@c.us (for example 37499123456@c.us).',
  })
  @Transform(({ value }) => {
    if (!Array.isArray(value)) return value;
    return value.map((item) => (typeof item === 'string' ? item.trim() : item));
  })
  participants!: string[];
}
