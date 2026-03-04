import { IsObject, IsOptional } from 'class-validator';

export class ExecuteTemplateDto {
  @IsOptional()
  @IsObject()
  params?: Record<string, string | number | boolean>;
}
