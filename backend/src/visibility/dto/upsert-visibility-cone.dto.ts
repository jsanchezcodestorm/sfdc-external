import { IsObject } from 'class-validator';

export class UpsertVisibilityConeDto {
  @IsObject()
  cone!: Record<string, unknown>;
}
