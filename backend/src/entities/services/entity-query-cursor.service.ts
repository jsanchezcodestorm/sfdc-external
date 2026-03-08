import { createHash, randomBytes } from 'node:crypto';

import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

const DEFAULT_CURSOR_TTL_SECONDS = 900;

type CursorKind = 'list' | 'related-list';

export interface EntityQueryCursorScope {
  cursorKind: CursorKind;
  contactId: string;
  entityId: string;
  viewId?: string;
  relatedListId?: string;
  recordId?: string;
  searchTerm?: string;
  objectApiName: string;
  pageSize: number;
  totalSize: number;
  resolvedSoql: string;
  baseWhere: string;
  finalWhere: string;
  queryFingerprint: string;
}

export interface EntityQueryCursorSourceState {
  sourceLocator?: string;
  sourceRecords: Array<Record<string, unknown>>;
}

export interface EntityQueryCursorRecord extends EntityQueryCursorScope, EntityQueryCursorSourceState {
  token: string;
  expiresAt: Date;
}

@Injectable()
export class EntityQueryCursorService {
  private readonly ttlSeconds: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly prismaService: PrismaService
  ) {
    this.ttlSeconds = this.readPositiveIntConfig('ENTITY_QUERY_CURSOR_TTL_SECONDS', DEFAULT_CURSOR_TTL_SECONDS);
  }

  async createCursor(
    scope: EntityQueryCursorScope,
    sourceState: EntityQueryCursorSourceState
  ): Promise<string> {
    const token = randomBytes(24).toString('base64url');
    const tokenHash = this.hashToken(token);
    const expiresAt = new Date(Date.now() + this.ttlSeconds * 1000);

    await this.prismaService.entityQueryCursorCache.upsert({
      where: { tokenHash },
      create: {
        tokenHash,
        cursorKind: scope.cursorKind,
        contactId: scope.contactId,
        entityId: scope.entityId,
        viewId: scope.viewId ?? null,
        relatedListId: scope.relatedListId ?? null,
        recordId: scope.recordId ?? null,
        searchTerm: scope.searchTerm ?? null,
        objectApiName: scope.objectApiName,
        pageSize: scope.pageSize,
        totalSize: scope.totalSize,
        resolvedSoql: scope.resolvedSoql,
        baseWhere: scope.baseWhere,
        finalWhere: scope.finalWhere,
        queryFingerprint: scope.queryFingerprint,
        sourceLocator: sourceState.sourceLocator ?? null,
        sourceRecordsJson: sourceState.sourceRecords as Prisma.JsonArray,
        expiresAt
      },
      update: {
        cursorKind: scope.cursorKind,
        contactId: scope.contactId,
        entityId: scope.entityId,
        viewId: scope.viewId ?? null,
        relatedListId: scope.relatedListId ?? null,
        recordId: scope.recordId ?? null,
        searchTerm: scope.searchTerm ?? null,
        objectApiName: scope.objectApiName,
        pageSize: scope.pageSize,
        totalSize: scope.totalSize,
        resolvedSoql: scope.resolvedSoql,
        baseWhere: scope.baseWhere,
        finalWhere: scope.finalWhere,
        queryFingerprint: scope.queryFingerprint,
        sourceLocator: sourceState.sourceLocator ?? null,
        sourceRecordsJson: sourceState.sourceRecords as Prisma.JsonArray,
        expiresAt
      }
    });

    return token;
  }

  async readCursor(token: string): Promise<EntityQueryCursorRecord> {
    const normalizedToken = token.trim();
    if (!normalizedToken) {
      throw new BadRequestException('Cursor is required');
    }

    const row = await this.prismaService.entityQueryCursorCache.findUnique({
      where: {
        tokenHash: this.hashToken(normalizedToken)
      }
    });

    if (!row || row.expiresAt.getTime() <= Date.now()) {
      if (row) {
        await this.prismaService.entityQueryCursorCache.delete({
          where: {
            tokenHash: row.tokenHash
          }
        });
      }

      throw new BadRequestException('Invalid or expired entity cursor');
    }

    return {
      token: normalizedToken,
      cursorKind: row.cursorKind as CursorKind,
      contactId: row.contactId,
      entityId: row.entityId,
      viewId: row.viewId ?? undefined,
      relatedListId: row.relatedListId ?? undefined,
      recordId: row.recordId ?? undefined,
      searchTerm: row.searchTerm ?? undefined,
      objectApiName: row.objectApiName,
      pageSize: row.pageSize,
      totalSize: row.totalSize,
      resolvedSoql: row.resolvedSoql,
      baseWhere: row.baseWhere,
      finalWhere: row.finalWhere,
      queryFingerprint: row.queryFingerprint,
      sourceLocator: row.sourceLocator ?? undefined,
      sourceRecords: this.readSourceRecords(row.sourceRecordsJson),
      expiresAt: row.expiresAt
    };
  }

  async deleteExpiredCursors(): Promise<void> {
    await this.prismaService.entityQueryCursorCache.deleteMany({
      where: {
        expiresAt: {
          lt: new Date()
        }
      }
    });
  }

  hashFingerprint(parts: Array<string | number | boolean | null | undefined>): string {
    const normalized = parts
      .map((part) => {
        if (part === null || part === undefined) {
          return '';
        }

        return String(part);
      })
      .join('||');

    return createHash('sha256').update(normalized).digest('hex');
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private readSourceRecords(value: unknown): Array<Record<string, unknown>> {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.filter(
      (entry): entry is Record<string, unknown> =>
        typeof entry === 'object' && entry !== null && !Array.isArray(entry)
    );
  }

  private readPositiveIntConfig(configKey: string, fallback: number): number {
    const rawValue = this.configService.get<string>(configKey);
    if (!rawValue) {
      return fallback;
    }

    const parsed = Number(rawValue);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
  }
}
