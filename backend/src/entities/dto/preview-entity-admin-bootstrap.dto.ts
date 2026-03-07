import { IsObject } from 'class-validator';

export class PreviewEntityAdminBootstrapDto {
  @IsObject()
  entity!: Record<string, unknown>;
}
