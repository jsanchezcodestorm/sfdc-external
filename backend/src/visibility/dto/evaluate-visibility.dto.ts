import { IsString, MinLength } from 'class-validator';

export class EvaluateVisibilityDto {
  @IsString()
  @MinLength(2)
  objectApiName!: string;
}
