import { IsObject } from 'class-validator';

export class UpsertReportDefinitionDto {
  @IsObject()
  report!: Record<string, unknown>;
}
