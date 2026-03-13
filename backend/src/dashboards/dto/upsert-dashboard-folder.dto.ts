import { IsObject } from 'class-validator';

export class UpsertDashboardFolderDto {
  @IsObject()
  folder!: Record<string, unknown>;
}
