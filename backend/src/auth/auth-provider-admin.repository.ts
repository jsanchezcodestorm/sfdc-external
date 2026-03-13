import { Injectable } from '@nestjs/common';
import { Prisma } from '../prisma/generated/client';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthProviderAdminRepository {
  constructor(private readonly prisma: PrismaService) {}

  listConfigs() {
    return this.prisma.authProviderAdminConfigRecord.findMany({
      orderBy: [{ sortOrder: 'asc' }, { providerId: 'asc' }]
    });
  }

  findConfig(providerId: string) {
    return this.prisma.authProviderAdminConfigRecord.findUnique({
      where: { providerId }
    });
  }

  upsertConfig(input: {
    providerId: string;
    type: 'OIDC' | 'LOCAL';
    label?: string;
    enabled: boolean;
    sortOrder: number;
    configJson?: unknown;
    clientSecretEncrypted?: string | null;
  }) {
    const configJson = input.configJson === null ? Prisma.JsonNull : input.configJson;

    return this.prisma.authProviderAdminConfigRecord.upsert({
      where: { providerId: input.providerId },
      create: {
        providerId: input.providerId,
        type: input.type,
        label: input.label ?? null,
        enabled: input.enabled,
        sortOrder: input.sortOrder,
        configJson,
        clientSecretEncrypted: input.clientSecretEncrypted ?? null
      },
      update: {
        type: input.type,
        label: input.label ?? null,
        enabled: input.enabled,
        sortOrder: input.sortOrder,
        configJson,
        clientSecretEncrypted: input.clientSecretEncrypted ?? null
      }
    });
  }
}
