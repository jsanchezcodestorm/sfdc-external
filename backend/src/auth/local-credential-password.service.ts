import { Injectable } from '@nestjs/common';
import argon2 from 'argon2';

import { SetupSecretsService } from '../setup/setup-secrets.service';

const LOCAL_CREDENTIAL_PASSWORD_CONTEXT = 'local-credential-password:v1';

@Injectable()
export class LocalCredentialPasswordService {
  constructor(private readonly setupSecretsService: SetupSecretsService) {}

  isAvailable(): boolean {
    return this.setupSecretsService.isConfigured();
  }

  async hashPassword(password: string): Promise<string> {
    return argon2.hash(password.trim(), {
      type: argon2.argon2id,
      secret: this.setupSecretsService.deriveScopedSecret(LOCAL_CREDENTIAL_PASSWORD_CONTEXT)
    });
  }

  async verifyPassword(passwordHash: string, password: string): Promise<boolean> {
    return argon2.verify(passwordHash, password.trim(), {
      secret: this.setupSecretsService.deriveScopedSecret(LOCAL_CREDENTIAL_PASSWORD_CONTEXT)
    });
  }
}
