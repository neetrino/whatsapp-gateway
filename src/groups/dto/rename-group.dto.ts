import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class RenameGroupDto {
  @IsString({ message: 'name is required.' })
  @IsNotEmpty({ message: 'name is required.' })
  @MaxLength(100)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name!: string;
}
