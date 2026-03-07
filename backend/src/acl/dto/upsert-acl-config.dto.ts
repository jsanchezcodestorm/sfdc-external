import { IsArray } from 'class-validator';

export class UpsertAclConfigDto {
  @IsArray()
  permissions!: unknown[];

  @IsArray()
  defaultPermissions!: unknown[];

  @IsArray()
  resources!: unknown[];
}
