import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested
} from 'class-validator';

class AuthProviderAdminInputDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  label?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  sortOrder?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  clientId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4096)
  clientSecret?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  tenantId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  domain?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  issuer?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(128, { each: true })
  scopes?: string[];
}

export class UpdateAuthProviderAdminDto {
  @ValidateNested()
  @Type(() => AuthProviderAdminInputDto)
  provider!: AuthProviderAdminInputDto;
}
