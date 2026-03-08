import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class GetEntityListDto {
  @IsOptional()
  @IsString()
  viewId?: string;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2000)
  pageSize?: number;

  @IsOptional()
  @IsString()
  search?: string;
}
