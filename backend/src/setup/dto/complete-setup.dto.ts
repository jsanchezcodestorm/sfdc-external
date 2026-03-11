import { IsDefined, IsObject, IsString, MaxLength } from 'class-validator';

export class CompleteSetupDto {
  @IsString()
  @MaxLength(128)
  siteName!: string;

  @IsString()
  @MaxLength(320)
  adminEmail!: string;

  @IsString()
  @MaxLength(512)
  bootstrapPassword!: string;

  @IsDefined()
  @IsObject()
  salesforce!: Record<string, unknown>;
}
