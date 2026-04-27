import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

type PrismaTransaction = Prisma.TransactionClient;

@Injectable()
export class VisibilityAdminPolicyCacheService {
  async bumpPolicyVersionAndInvalidateCaches(
    tx: PrismaTransaction,
    affectedObjectApiNames: Array<string | undefined>,
  ): Promise<void> {
    await tx.visibilityPolicyMeta.upsert({
      where: { id: 1 },
      create: {
        id: 1,
        policyVersion: 2n,
      },
      update: {
        policyVersion: {
          increment: 1,
        },
      },
    });

    const normalizedObjectApiNames = this.mergeObjectApiNames(affectedObjectApiNames);
    if (normalizedObjectApiNames.length === 0) {
      return;
    }

    await Promise.all([
      ...normalizedObjectApiNames.map((objectApiName) =>
        tx.visibilityObjectPolicyVersion.upsert({
          where: { objectApiName },
          create: {
            objectApiName,
            policyVersion: 2n,
          },
          update: {
            policyVersion: {
              increment: 1,
            },
          },
        }),
      ),
      tx.visibilityUserScopeCache.deleteMany({
        where: {
          objectApiName: {
            in: normalizedObjectApiNames,
          },
        },
      }),
      tx.visibilityPolicyDefinitionCache.deleteMany({
        where: {
          objectApiName: {
            in: normalizedObjectApiNames,
          },
        },
      }),
    ]);
  }

  async listObjectApiNamesForCone(
    tx: PrismaTransaction,
    coneId: string | undefined,
  ): Promise<string[]> {
    if (!coneId) {
      return [];
    }

    const rows = await tx.visibilityRule.findMany({
      where: { coneId },
      select: { objectApiName: true },
      distinct: ['objectApiName'],
    });

    return this.mergeObjectApiNames(rows.map((row) => row.objectApiName));
  }

  mergeObjectApiNames(...values: Array<Array<string | undefined> | string | undefined>): string[] {
    const merged: string[] = [];

    for (const value of values) {
      if (Array.isArray(value)) {
        for (const entry of value) {
          if (entry && !merged.includes(entry)) {
            merged.push(entry);
          }
        }
        continue;
      }

      if (value && !merged.includes(value)) {
        merged.push(value);
      }
    }

    return merged.sort((left, right) => left.localeCompare(right));
  }
}
