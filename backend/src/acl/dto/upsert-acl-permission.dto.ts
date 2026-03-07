import { IsArray, IsObject } from 'class-validator';

export class UpsertAclPermissionDto {
  @IsObject()
  permission!: Record<string, unknown>;

  @IsArray()
  appIds!: unknown[];
}
