import { IsArray } from 'class-validator';

export class UpdateDefaultPermissionsDto {
  @IsArray()
  permissionCodes!: unknown[];
}
