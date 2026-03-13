import { IsArray, IsOptional } from 'class-validator';

export class RunDashboardDto {
  @IsOptional()
  @IsArray()
  filters?: unknown[];
}
