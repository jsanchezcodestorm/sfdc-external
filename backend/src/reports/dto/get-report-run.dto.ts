import { IsOptional, IsString } from 'class-validator';

export class GetReportRunDto {
  @IsOptional()
  @IsString()
  cursor?: string;
}
