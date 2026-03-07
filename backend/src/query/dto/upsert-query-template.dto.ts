import { IsInt, IsObject, IsOptional, IsString, Min } from 'class-validator';

export class UpsertQueryTemplateDto {
  @IsString()
  id!: string;

  @IsString()
  objectApiName!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  soql!: string;

  @IsOptional()
  @IsObject()
  defaultParams?: Record<string, unknown>;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxLimit?: number;
}
