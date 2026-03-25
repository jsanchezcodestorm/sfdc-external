import { BadRequestException, Injectable } from '@nestjs/common';

import { LocalCredentialRepository } from './local-credential.repository';

@Injectable()
export class LocalCredentialProvisioningService {
  constructor(private readonly localCredentialRepository: LocalCredentialRepository) {}

  async upsertResolvedCredential(input: {
    contactId: string;
    username: string;
    password?: string;
    enabled?: boolean;
  }) {
    const normalizedContactId = input.contactId.trim();
    const normalizedUsername = input.username.trim().toLowerCase();
    const normalizedPassword = input.password?.trim();

    if (!normalizedContactId) {
      throw new BadRequestException('credential.contactId is required');
    }

    if (!normalizedUsername) {
      throw new BadRequestException('credential.username is required');
    }

    const existingCredential = await this.localCredentialRepository.findByContactId(normalizedContactId);
    const enabled = input.enabled ?? existingCredential?.enabled ?? true;

    if (!existingCredential && !normalizedPassword) {
      throw new BadRequestException('credential.password is required when creating a local credential');
    }

    return this.localCredentialRepository.upsertCredential({
      contactId: normalizedContactId,
      username: normalizedUsername,
      password: normalizedPassword,
      enabled
    });
  }
}
