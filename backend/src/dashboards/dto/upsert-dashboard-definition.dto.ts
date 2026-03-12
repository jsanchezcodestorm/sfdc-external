import { IsObject } from 'class-validator';

export class UpsertDashboardDefinitionDto {
  @IsObject()
  dashboard!: Record<string, unknown>;
}
