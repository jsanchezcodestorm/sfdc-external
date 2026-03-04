import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AclResource } from '../common/decorators/acl-resource.decorator';
import { AclGuard } from '../common/guards/acl.guard';

import { RawQueryDto } from './dto/raw-query.dto';
import { SalesforceService } from './salesforce.service';

@Controller('salesforce')
@UseGuards(JwtAuthGuard, AclGuard)
export class SalesforceController {
  constructor(private readonly salesforceService: SalesforceService) {}

  @Get('objects')
  @AclResource('rest:salesforce-objects')
  listObjects(): Promise<unknown> {
    return this.salesforceService.describeGlobalObjects();
  }

  @Get('objects/:objectApiName')
  @AclResource('rest:salesforce-objects')
  describeObject(@Param('objectApiName') objectApiName: string): Promise<unknown> {
    return this.salesforceService.describeObject(objectApiName);
  }

  @Get('objects/:objectApiName/fields')
  @AclResource('rest:salesforce-objects')
  describeFields(@Param('objectApiName') objectApiName: string): Promise<unknown> {
    return this.salesforceService.describeObjectFields(objectApiName);
  }

  @Post('query')
  @AclResource('rest:salesforce-raw-query')
  runRawQuery(@Body() dto: RawQueryDto): Promise<unknown> {
    return this.salesforceService.executeRawQuery(dto.soql);
  }
}
