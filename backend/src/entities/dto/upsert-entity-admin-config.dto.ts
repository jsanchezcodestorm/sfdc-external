import { IsObject } from 'class-validator';

export class UpsertEntityAdminConfigDto {
  @IsObject()
  entity!: Record<string, unknown>;
}
