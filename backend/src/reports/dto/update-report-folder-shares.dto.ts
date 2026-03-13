import { IsArray } from 'class-validator';

export class UpdateReportFolderSharesDto {
  @IsArray()
  shares!: unknown[];
}
