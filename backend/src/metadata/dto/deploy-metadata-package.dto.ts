import { IsString } from 'class-validator';

export class DeployMetadataPackageDto {
  @IsString()
  packageHash!: string;

  @IsString()
  targetFingerprint!: string;
}
