import { Injectable } from '@nestjs/common';
import type { Prisma } from '../prisma/generated/client';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class LocalCredentialRepository {
  constructor(private readonly prisma: PrismaService) {}

  listCredentials(tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.localCredentialRecord.findMany({
      orderBy: [{ updatedAt: 'desc' }, { username: 'asc' }]
    });
  }

  findByContactId(contactId: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.localCredentialRecord.findUnique({
      where: { contactId }
    });
  }

  findByUsername(username: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.localCredentialRecord.findUnique({
      where: { username }
    });
  }

  upsertCredential(
    input: {
      contactId: string;
      username: string;
      passwordHash: string;
      enabled: boolean;
    },
    tx?: Prisma.TransactionClient
  ) {
    const client = tx ?? this.prisma;
    return client.localCredentialRecord.upsert({
      where: { contactId: input.contactId },
      create: {
        contactId: input.contactId,
        username: input.username,
        passwordHash: input.passwordHash,
        enabled: input.enabled
      },
      update: {
        username: input.username,
        passwordHash: input.passwordHash,
        enabled: input.enabled,
        failedAttempts: 0,
        lockedUntil: null
      }
    });
  }

  async deleteCredential(contactId: string): Promise<void> {
    await this.prisma.localCredentialRecord.delete({
      where: { contactId }
    });
  }

  async recordFailedLogin(contactId: string, failedAttempts: number, lockedUntil: Date | null): Promise<void> {
    await this.prisma.localCredentialRecord.update({
      where: { contactId },
      data: {
        failedAttempts,
        lockedUntil
      }
    });
  }

  async recordSuccessfulLogin(contactId: string, username: string): Promise<void> {
    await this.prisma.localCredentialRecord.update({
      where: { contactId },
      data: {
        username,
        failedAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date()
      }
    });
  }
}
