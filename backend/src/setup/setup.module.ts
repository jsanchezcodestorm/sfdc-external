import { forwardRef, Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';

import { SetupSecretsService } from './setup-secrets.service';
import { SetupController } from './setup.controller';
import { SetupRepository } from './setup.repository';
import { SetupService } from './setup.service';

@Module({
  imports: [forwardRef(() => AuthModule)],
  controllers: [SetupController],
  providers: [SetupRepository, SetupSecretsService, SetupService],
  exports: [SetupService],
})
export class SetupModule {}
