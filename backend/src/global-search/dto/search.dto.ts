import { IsString, MinLength } from 'class-validator';

export class SearchDto {
  @IsString()
  @MinLength(2)
  q!: string;
}
