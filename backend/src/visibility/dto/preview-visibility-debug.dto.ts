import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export class PreviewVisibilityDebugDto {
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

  @IsArray()
  @ArrayNotEmpty()
  requestedFields!: string[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(25)
  limit?: number;
}
