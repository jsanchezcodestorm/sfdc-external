import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const DECISIONS = ['ALLOW', 'DENY'] as const;
const APP_STATUSES = ['PENDING', 'SUCCESS', 'FAILURE'] as const;

export class ListAuditBaseDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  from?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  to?: string;

  @IsOptional()
  @IsString()
  @MaxLength(18)
  contactId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  requestId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class ListSecurityAuditDto extends ListAuditBaseDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  eventType?: string;

  @IsOptional()
  @IsString()
  @IsIn(DECISIONS)
  decision?: (typeof DECISIONS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(64)
  reasonCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  endpoint?: string;
}

export class ListVisibilityAuditDto extends ListAuditBaseDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  objectApiName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  queryKind?: string;

  @IsOptional()
  @IsString()
  @IsIn(DECISIONS)
  decision?: (typeof DECISIONS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(64)
  reasonCode?: string;
}

export class ListApplicationAuditDto extends ListAuditBaseDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  action?: string;

  @IsOptional()
  @IsString()
  @IsIn(APP_STATUSES)
  status?: (typeof APP_STATUSES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(64)
  targetType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  objectApiName?: string;
}
