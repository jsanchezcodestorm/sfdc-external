import { Injectable } from '@nestjs/common';
import { SetupSalesforceMode } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SetupRepository {
  constructor(private readonly prisma: PrismaService) {}

  getRecord() {
    return this.prisma.instanceSetupRecord.findUnique({
      where: { id: 1 },
    });
  }

  async saveCompletedSetup(input: {
    siteName: string;
    adminEmail: string;
    salesforceMode: SetupSalesforceMode;
    salesforceConfigEncrypted: string;
    completedAt: Date;
  }): Promise<void> {
    await this.prisma.instanceSetupRecord.upsert({
      where: { id: 1 },
      create: {
        id: 1,
        siteName: input.siteName,
        adminEmail: input.adminEmail,
        salesforceMode: input.salesforceMode,
        salesforceConfigEncrypted: input.salesforceConfigEncrypted,
        completedAt: input.completedAt,
      },
      update: {
        siteName: input.siteName,
        adminEmail: input.adminEmail,
        salesforceMode: input.salesforceMode,
        salesforceConfigEncrypted: input.salesforceConfigEncrypted,
        completedAt: input.completedAt,
      },
    });
  }
}
