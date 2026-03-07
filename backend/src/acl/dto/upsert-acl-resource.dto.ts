import { IsObject } from 'class-validator';

export class UpsertAclResourceDto {
  @IsObject()
  resource!: Record<string, unknown>;
}
