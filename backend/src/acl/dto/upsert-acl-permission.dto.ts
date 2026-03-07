import { IsObject } from 'class-validator';

export class UpsertAclPermissionDto {
  @IsObject()
  permission!: Record<string, unknown>;
}
