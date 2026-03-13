import { IsString } from 'class-validator';

export class CreateEntityRecordDto {
  @IsString()
  recordTypeDeveloperName!: string;
}
