import { forwardRef, Module } from '@nestjs/common';

import { AclModule } from '../acl/acl.module';
import { SalesforceModule } from '../salesforce/salesforce.module';
import { SetupModule } from '../setup/setup.module';

import { AuthProviderAdminRepository } from './auth-provider-admin.repository';
import { AuthProviderAdminService } from './auth-provider-admin.service';
import { AuthProviderRegistryService } from './auth-provider-registry.service';
import { AuthPublicOriginService } from './auth-public-origin.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { CsrfService } from './csrf.service';
import { CsrfGuard } from './guards/csrf.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { LocalCredentialAdminService } from './local-credential-admin.service';
import { LocalCredentialPasswordService } from './local-credential-password.service';
import { LocalCredentialProvisioningService } from './local-credential-provisioning.service';
import { LocalCredentialRepository } from './local-credential.repository';
import { LocalLoginRateLimiterService } from './local-login-rate-limiter.service';

@Module({
  imports: [
    forwardRef(() => AclModule),
    forwardRef(() => SalesforceModule),
    forwardRef(() => SetupModule)
  ],
  controllers: [AuthController],
  providers: [
    AuthProviderAdminRepository,
    AuthProviderAdminService,
    AuthProviderRegistryService,
    AuthPublicOriginService,
    AuthService,
    CsrfService,
    JwtAuthGuard,
    CsrfGuard,
    LocalCredentialAdminService,
    LocalCredentialPasswordService,
    LocalCredentialProvisioningService,
    LocalCredentialRepository,
    LocalLoginRateLimiterService
  ],
  exports: [
    AuthService,
    CsrfService,
    JwtAuthGuard,
    CsrfGuard,
    LocalCredentialPasswordService,
    LocalCredentialProvisioningService,
    LocalCredentialRepository
  ]
})
export class AuthModule {}
