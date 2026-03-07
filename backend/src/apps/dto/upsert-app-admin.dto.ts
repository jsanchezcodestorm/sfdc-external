import { IsObject } from 'class-validator';

export class UpsertAppAdminDto {
  @IsObject()
  app!: Record<string, unknown>;
}
