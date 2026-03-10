import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';

import { CsrfGuard } from '../auth/guards/csrf.guard';

import { CompleteSetupDto } from './dto/complete-setup.dto';
import { TestSetupSalesforceDto } from './dto/test-setup-salesforce.dto';
import { SetupService } from './setup.service';
import type {
  SetupSalesforceTestResponse,
  SetupStatusResponse,
} from './setup.types';

@Controller('setup')
@UseGuards(CsrfGuard)
export class SetupController {
  constructor(private readonly setupService: SetupService) {}

  @Get('status')
  getStatus(): Promise<SetupStatusResponse> {
    return this.setupService.getStatus();
  }

  @Post('salesforce-test')
  testSalesforce(
    @Body() dto: TestSetupSalesforceDto
  ): Promise<SetupSalesforceTestResponse> {
    return this.setupService.testSalesforceConfig(dto.salesforce);
  }

  @Post('complete')
  completeSetup(@Body() dto: CompleteSetupDto): Promise<SetupStatusResponse> {
    return this.setupService.completeSetup(dto);
  }
}
