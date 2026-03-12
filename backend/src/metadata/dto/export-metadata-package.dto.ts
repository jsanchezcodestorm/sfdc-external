import { IsArray, IsOptional, IsString } from 'class-validator';

export class ExportMetadataPackageDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  sections?: string[];
}
