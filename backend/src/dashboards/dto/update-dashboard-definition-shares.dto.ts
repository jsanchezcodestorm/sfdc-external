import { IsArray } from 'class-validator';

export class UpdateDashboardDefinitionSharesDto {
  @IsArray()
  shares!: unknown[];
}
