import { IsObject } from 'class-validator';

export class UpsertVisibilityRuleDto {
  @IsObject()
  rule!: Record<string, unknown>;
}
