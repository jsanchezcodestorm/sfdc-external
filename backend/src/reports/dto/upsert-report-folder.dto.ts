import { IsObject } from 'class-validator';

export class UpsertReportFolderDto {
  @IsObject()
  folder!: Record<string, unknown>;
}
