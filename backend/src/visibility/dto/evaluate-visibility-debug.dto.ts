import {
  IsArray,
  IsObject,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class EvaluateVisibilityDebugDto {
  @IsString()
  @MinLength(2)
  objectApiName!: string;

  @IsString()
  @MinLength(15)
  contactId!: string;

  @IsArray()
  permissions!: string[];

  @IsOptional()
  @IsString()
  recordType?: string;

  @IsOptional()
  @IsString()
  baseWhere?: string;

  @IsOptional()
  @IsArray()
  requestedFields?: string[];
}
