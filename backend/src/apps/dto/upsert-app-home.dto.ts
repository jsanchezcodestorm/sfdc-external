import { IsObject } from 'class-validator';

export class UpsertAppHomeDto {
  @IsObject()
  home!: Record<string, unknown>;
}
