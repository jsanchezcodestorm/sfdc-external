import { IsArray } from 'class-validator';

export class UpdateDashboardFolderSharesDto {
  @IsArray()
  shares!: unknown[];
}
