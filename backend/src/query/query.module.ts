import { Module } from '@nestjs/common';

import { AclModule } from '../acl/acl.module';
import { AuthModule } from '../auth/auth.module';
import { SalesforceModule } from '../salesforce/salesforce.module';
import { VisibilityModule } from '../visibility/visibility.module';

import { QueryController } from './query.controller';
import { QueryService } from './query.service';

@Module({
  imports: [AuthModule, AclModule, VisibilityModule, SalesforceModule],
  controllers: [QueryController],
  providers: [QueryService],
  exports: [QueryService]
})
export class QueryModule {}
