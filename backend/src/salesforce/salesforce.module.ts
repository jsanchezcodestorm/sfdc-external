import { forwardRef, Module } from '@nestjs/common';

import { AclModule } from '../acl/acl.module';
import { AuthModule } from '../auth/auth.module';
import { SetupModule } from '../setup/setup.module';

import { SalesforceController } from './salesforce.controller';
import { SalesforceService } from './salesforce.service';

@Module({
  imports: [forwardRef(() => AuthModule), forwardRef(() => AclModule), SetupModule],
  controllers: [SalesforceController],
  providers: [SalesforceService],
  exports: [SalesforceService]
})
export class SalesforceModule {}
