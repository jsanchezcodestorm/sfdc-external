import { Type } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength, ValidateNested } from 'class-validator';

class UpsertLocalCredentialInputDto {
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(200)
  password?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class UpsertLocalCredentialDto {
  @ValidateNested()
  @Type(() => UpsertLocalCredentialInputDto)
  credential!: UpsertLocalCredentialInputDto;
}
