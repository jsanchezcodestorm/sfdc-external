import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

type PrismaClientLike = PrismaService | Prisma.TransactionClient;

export interface AclContactPermissionRow {
  contactId: string;
  permissionCode: string;
  updatedAt: Date;
}

@Injectable()
export class AclContactPermissionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listRows(): Promise<AclContactPermissionRow[]> {
    return this.prisma.aclContactPermissionRecord.findMany({
      orderBy: [{ contactId: 'asc' }, { permissionCode: 'asc' }],
      select: {
        contactId: true,
        permissionCode: true,
        updatedAt: true,
      },
    });
  }

  async findByContactId(contactId: string): Promise<AclContactPermissionRow[]> {
    return this.prisma.aclContactPermissionRecord.findMany({
      where: { contactId },
      orderBy: [{ permissionCode: 'asc' }],
      select: {
        contactId: true,
        permissionCode: true,
        updatedAt: true,
      },
    });
  }

  async listPermissionCodesByContactId(contactId: string): Promise<string[]> {
    const rows = await this.prisma.aclContactPermissionRecord.findMany({
      where: { contactId },
      orderBy: [{ permissionCode: 'asc' }],
      select: {
        permissionCode: true,
      },
    });

    return rows.map((row) => row.permissionCode);
  }

  async listPermissionCodesBySubjectIds(subjectIds: string[]): Promise<string[]> {
    const normalizedSubjectIds = [...new Set(subjectIds.map((entry) => entry.trim()).filter(Boolean))];

    if (normalizedSubjectIds.length === 0) {
      return [];
    }

    const rows = await this.prisma.aclContactPermissionRecord.findMany({
      where: {
        contactId: {
          in: normalizedSubjectIds,
        },
      },
      orderBy: [{ permissionCode: 'asc' }],
      select: {
        permissionCode: true,
      },
    });

    return rows.map((row) => row.permissionCode);
  }

  async replaceForContact(
    contactId: string,
    permissionCodes: string[],
  ): Promise<{
    added: string[];
    removed: string[];
    rows: AclContactPermissionRow[];
  }> {
    return this.prisma.$transaction(async (tx) => {
      const previousRows = await tx.aclContactPermissionRecord.findMany({
        where: { contactId },
        orderBy: [{ permissionCode: 'asc' }],
        select: {
          contactId: true,
          permissionCode: true,
          updatedAt: true,
        },
      });

      const previousCodes = new Set(previousRows.map((row) => row.permissionCode));
      const nextCodes = new Set(permissionCodes);
      const added = permissionCodes.filter((code) => !previousCodes.has(code));
      const removed = previousRows
        .map((row) => row.permissionCode)
        .filter((code) => !nextCodes.has(code));

      if (removed.length > 0) {
        await tx.aclContactPermissionRecord.deleteMany({
          where: {
            contactId,
            permissionCode: {
              in: removed,
            },
          },
        });
      }

      if (added.length > 0) {
        await tx.aclContactPermissionRecord.createMany({
          data: added.map((permissionCode) => ({
            contactId,
            permissionCode,
          })),
        });
      }

      const rows = await tx.aclContactPermissionRecord.findMany({
        where: { contactId },
        orderBy: [{ permissionCode: 'asc' }],
        select: {
          contactId: true,
          permissionCode: true,
          updatedAt: true,
        },
      });

      return {
        added,
        removed,
        rows,
      };
    });
  }

  async deleteForContact(contactId: string): Promise<string[]> {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.aclContactPermissionRecord.findMany({
        where: { contactId },
        orderBy: [{ permissionCode: 'asc' }],
        select: {
          permissionCode: true,
        },
      });

      if (rows.length > 0) {
        await tx.aclContactPermissionRecord.deleteMany({
          where: { contactId },
        });
      }

      return rows.map((row) => row.permissionCode);
    });
  }

  async renamePermissionCode(
    previousCode: string,
    nextCode: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    if (previousCode === nextCode) {
      return;
    }

    await this.getClient(tx).aclContactPermissionRecord.updateMany({
      where: {
        permissionCode: previousCode,
      },
      data: {
        permissionCode: nextCode,
      },
    });
  }

  async deleteByPermissionCodes(
    permissionCodes: string[],
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    if (permissionCodes.length === 0) {
      return;
    }

    await this.getClient(tx).aclContactPermissionRecord.deleteMany({
      where: {
        permissionCode: {
          in: permissionCodes,
        },
      },
    });
  }

  private getClient(tx?: Prisma.TransactionClient): PrismaClientLike {
    return tx ?? this.prisma;
  }
}
