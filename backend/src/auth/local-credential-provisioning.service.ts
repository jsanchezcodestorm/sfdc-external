import { BadRequestException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { LocalCredentialPasswordService } from './local-credential-password.service';
import { LocalCredentialRepository } from './local-credential.repository';

@Injectable()
export class LocalCredentialProvisioningService {
  constructor(
    private readonly localCredentialRepository: LocalCredentialRepository,
    private readonly localCredentialPasswordService: LocalCredentialPasswordService
  ) {}

  async upsertResolvedCredential(
    input: {
      contactId: string;
      username: string;
      password?: string;
      enabled?: boolean;
    },
    options?: {
      tx?: Prisma.TransactionClient;
    }
  ) {
    const normalizedContactId = input.contactId.trim();
    const normalizedUsername = input.username.trim().toLowerCase();
    const existingCredential = await this.localCredentialRepository.findByContactId(
      normalizedContactId,
      options?.tx
    );
    const enabled = input.enabled ?? existingCredential?.enabled ?? true;
    const normalizedPassword = input.password?.trim() ?? '';

    if (!normalizedUsername) {
      throw new BadRequestException('credential.username is required');
    }

    const passwordHash = normalizedPassword
      ? await this.localCredentialPasswordService.hashPassword(normalizedPassword)
      : existingCredential?.passwordHash;

    if (!passwordHash) {
      throw new BadRequestException('credential.password is required when creating a local credential');
    }

    return this.localCredentialRepository.upsertCredential(
      {
        contactId: normalizedContactId,
        username: normalizedUsername,
        passwordHash,
        enabled
      },
      options?.tx
    );
  }
}
