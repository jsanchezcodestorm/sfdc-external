import { IsOptional, IsString } from 'class-validator';

export class GetEntityFormDto {
  @IsOptional()
  @IsString()
  recordTypeDeveloperName?: string;
}
