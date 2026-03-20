import { IsOptional, IsString } from 'class-validator';

export class CreateEntityRecordDto {
  @IsOptional()
  @IsString()
  recordTypeDeveloperName?: string;
}
