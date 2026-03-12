import { createHash, randomBytes } from 'node:crypto';

import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

const DEFAULT_CURSOR_TTL_SECONDS = 900;

export interface ReportQueryCursorScope {
  contactId: string;
  appId: string;
  reportId: string;
  objectApiName: string;
  pageSize: number;
  totalSize: number;
  resolvedSoql: string;
  baseWhere: string;
  finalWhere: string;
  queryFingerprint: string;
}

export interface ReportQueryCursorSourceState {
  sourceLocator?: string;
  sourceRecords: Array<Record<string, unknown>>;
}

export interface ReportQueryCursorRecord extends ReportQueryCursorScope, ReportQueryCursorSourceState {
  token: string;
  expiresAt: Date;
}

@Injectable()
export class ReportQueryCursorService {
  private readonly ttlSeconds: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly prismaService: PrismaService
  ) {
    this.ttlSeconds = this.readPositiveIntConfig('REPORT_QUERY_CURSOR_TTL_SECONDS', DEFAULT_CURSOR_TTL_SECONDS);
  }

  async createCursor(scope: ReportQueryCursorScope, sourceState: ReportQueryCursorSourceState): Promise<string> {
    const token = randomBytes(24).toString('base64url');
    const tokenHash = this.hashToken(token);
    const expiresAt = new Date(Date.now() + this.ttlSeconds * 1000);

    await this.prismaService.reportQueryCursorCache.upsert({
      where: { tokenHash },
      create: {
        tokenHash,
        contactId: scope.contactId,
        appId: scope.appId,
        reportId: scope.reportId,
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
        contactId: scope.contactId,
        appId: scope.appId,
        reportId: scope.reportId,
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

  async readCursor(token: string): Promise<ReportQueryCursorRecord> {
    const normalizedToken = token.trim();
    if (!normalizedToken) {
      throw new BadRequestException('Cursor is required');
    }

    const row = await this.prismaService.reportQueryCursorCache.findUnique({
      where: {
        tokenHash: this.hashToken(normalizedToken)
      }
    });

    if (!row || row.expiresAt.getTime() <= Date.now()) {
      if (row) {
        await this.prismaService.reportQueryCursorCache.delete({
          where: {
            tokenHash: row.tokenHash
          }
        });
      }

      throw new BadRequestException('Invalid or expired report cursor');
    }

    return {
      token: normalizedToken,
      contactId: row.contactId,
      appId: row.appId,
      reportId: row.reportId,
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
    await this.prismaService.reportQueryCursorCache.deleteMany({
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
