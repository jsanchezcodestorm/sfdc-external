import { IsObject } from 'class-validator';

export class UpsertVisibilityAssignmentDto {
  @IsObject()
  assignment!: Record<string, unknown>;
}
