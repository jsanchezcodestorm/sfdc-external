import { IsDefined, IsObject } from 'class-validator';

export class TestSetupSalesforceDto {
  @IsDefined()
  @IsObject()
  salesforce!: Record<string, unknown>;
}
