import { IsArray } from 'class-validator';

export class UpdateReportDefinitionSharesDto {
  @IsArray()
  shares!: unknown[];
}
