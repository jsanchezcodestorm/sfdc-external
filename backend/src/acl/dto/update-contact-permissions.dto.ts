import { IsArray } from 'class-validator';

export class UpdateContactPermissionsDto {
  @IsArray()
  permissionCodes!: unknown[];
}
