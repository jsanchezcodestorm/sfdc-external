import { IsString, MinLength } from 'class-validator';

export class RawQueryDto {
  @IsString()
  @MinLength(15)
  soql!: string;
}
