import { IsString } from 'class-validator';

export class GetEntityDto {
  @IsString()
  entityId!: string;
}
