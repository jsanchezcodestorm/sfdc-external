import { Module } from '@nestjs/common';

import { SalesforceModule } from '../salesforce/salesforce.module';

import { HealthController } from './health.controller';
import { HealthService } from './health.service';

@Module({
  imports: [SalesforceModule],
  controllers: [HealthController],
  providers: [HealthService]
})
export class HealthModule {}
