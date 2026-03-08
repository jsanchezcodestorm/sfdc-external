import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  ApplicationAuditLog,
  Prisma,
  QueryAuditLog,
  SecurityAuditLog,
  VisibilityAuditLog,
  VisibilityDecision,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

import type {
  ApplicationAuditDetail,
  ApplicationAuditSummary,
  CursorPageResponse,
  QueryAuditDetail,
  QueryAuditSummary,
  SecurityAuditDetail,
  SecurityAuditSummary,
  VisibilityAuditDetail,
  VisibilityAuditSummary,
} from './audit.types';
import type {
  ListApplicationAuditDto,
  ListQueryAuditDto,
  ListSecurityAuditDto,
  ListVisibilityAuditDto,
} from './dto/list-audit.dto';

interface CursorState {
  createdAt: Date;
  id: bigint;
}

@Injectable()
export class AuditReadService {
  constructor(private readonly prismaService: PrismaService) {}

  async listSecurityAudit(
    query: ListSecurityAuditDto,
  ): Promise<CursorPageResponse<SecurityAuditSummary>> {
    const limit = query.limit ?? 50;
    const rows = await this.prismaService.securityAuditLog.findMany({
      where: this.buildSecurityWhere(query),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    return this.paginate(rows, limit, (row) => this.mapSecuritySummary(row));
  }

  async getSecurityAudit(id: string): Promise<SecurityAuditDetail> {
    const row = await this.prismaService.securityAuditLog.findUnique({
      where: { id: this.parseId(id) },
    });

    if (!row) {
      throw new NotFoundException(`Security audit ${id} not found`);
    }

    return {
      ...this.mapSecuritySummary(row),
      ipHash: row.ipHash,
      userAgentHash: row.userAgentHash,
      metadata: row.metadataJson,
    };
  }

  async listVisibilityAudit(
    query: ListVisibilityAuditDto,
  ): Promise<CursorPageResponse<VisibilityAuditSummary>> {
    const limit = query.limit ?? 50;
    const rows = await this.prismaService.visibilityAuditLog.findMany({
      where: this.buildVisibilityWhere(query),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    return this.paginate(rows, limit, (row) => this.mapVisibilitySummary(row));
  }

  async getVisibilityAudit(id: string): Promise<VisibilityAuditDetail> {
    const row = await this.prismaService.visibilityAuditLog.findUnique({
      where: { id: this.parseId(id) },
    });

    if (!row) {
      throw new NotFoundException(`Visibility audit ${id} not found`);
    }

    return {
      ...this.mapVisibilitySummary(row),
      permissionsHash: row.permissionsHash,
      recordType: row.recordType,
      baseWhereHash: row.baseWhereHash,
      finalWhereHash: row.finalWhereHash,
      appliedCones: row.appliedCones,
      appliedRules: row.appliedRules,
      durationMs: row.durationMs,
    };
  }

  async listApplicationAudit(
    query: ListApplicationAuditDto,
  ): Promise<CursorPageResponse<ApplicationAuditSummary>> {
    const limit = query.limit ?? 50;
    const rows = await this.prismaService.applicationAuditLog.findMany({
      where: this.buildApplicationWhere(query),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    return this.paginate(rows, limit, (row) => this.mapApplicationSummary(row));
  }

  async getApplicationAudit(id: string): Promise<ApplicationAuditDetail> {
    const row = await this.prismaService.applicationAuditLog.findUnique({
      where: { id: this.parseId(id) },
    });

    if (!row) {
      throw new NotFoundException(`Application audit ${id} not found`);
    }

    return {
      ...this.mapApplicationSummary(row),
      payloadHash: row.payloadHash,
      metadata: row.metadataJson,
      result: row.resultJson,
    };
  }

  async listQueryAudit(
    query: ListQueryAuditDto,
  ): Promise<CursorPageResponse<QueryAuditSummary>> {
    const limit = query.limit ?? 50;
    const rows = await this.prismaService.queryAuditLog.findMany({
      where: this.buildQueryWhere(query),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    return this.paginate(rows, limit, (row) => this.mapQuerySummary(row));
  }

  async getQueryAudit(id: string): Promise<QueryAuditDetail> {
    const row = await this.prismaService.queryAuditLog.findUnique({
      where: { id: this.parseId(id) },
    });

    if (!row) {
      throw new NotFoundException(`Query audit ${id} not found`);
    }

    return {
      ...this.mapQuerySummary(row),
      resolvedSoql: row.resolvedSoql,
      baseWhere: row.baseWhere,
      baseWhereHash: row.baseWhereHash,
      finalWhere: row.finalWhere,
      finalWhereHash: row.finalWhereHash,
      metadata: row.metadataJson,
      result: row.resultJson,
    };
  }

  private mapSecuritySummary(
    row: SecurityAuditLog,
  ): SecurityAuditSummary {
    return {
      id: row.id.toString(),
      requestId: row.requestId,
      createdAt: row.createdAt.toISOString(),
      contactId: row.contactId,
      endpoint: row.endpoint,
      httpMethod: row.httpMethod,
      eventType: row.eventType,
      decision: row.decision,
      reasonCode: row.reasonCode,
    };
  }

  private mapVisibilitySummary(
    row: VisibilityAuditLog,
  ): VisibilityAuditSummary {
    return {
      id: row.id.toString(),
      requestId: row.requestId,
      createdAt: row.createdAt.toISOString(),
      contactId: row.contactId,
      objectApiName: row.objectApiName,
      queryKind: row.queryKind,
      decision: row.decision,
      reasonCode: row.decisionReasonCode,
      rowCount: row.rowCount,
      policyVersion: row.policyVersion.toString(),
      objectPolicyVersion: row.objectPolicyVersion.toString(),
    };
  }

  private mapApplicationSummary(
    row: ApplicationAuditLog,
  ): ApplicationAuditSummary {
    return {
      id: row.id.toString(),
      requestId: row.requestId,
      createdAt: row.createdAt.toISOString(),
      completedAt: row.completedAt?.toISOString() ?? null,
      contactId: row.contactId,
      action: row.action,
      targetType: row.targetType,
      targetId: row.targetId,
      objectApiName: row.objectApiName,
      recordId: row.recordId,
      status: row.status,
      errorCode: row.errorCode,
    };
  }

  private mapQuerySummary(row: QueryAuditLog): QueryAuditSummary {
    return {
      id: row.id.toString(),
      requestId: row.requestId,
      createdAt: row.createdAt.toISOString(),
      completedAt: row.completedAt?.toISOString() ?? null,
      contactId: row.contactId,
      queryKind: row.queryKind,
      targetId: row.targetId,
      objectApiName: row.objectApiName,
      recordId: row.recordId,
      status: row.status,
      rowCount: row.rowCount,
      durationMs: row.durationMs,
      errorCode: row.errorCode,
    };
  }

  private buildSecurityWhere(query: ListSecurityAuditDto): Prisma.SecurityAuditLogWhereInput {
    return {
      AND: [
        ...(this.buildBaseWhere(query) as Prisma.SecurityAuditLogWhereInput[]),
        query.eventType ? { eventType: query.eventType.trim() } : {},
        query.decision ? { decision: query.decision as VisibilityDecision } : {},
        query.reasonCode ? { reasonCode: query.reasonCode.trim() } : {},
        query.endpoint
          ? {
              endpoint: {
                contains: query.endpoint.trim(),
                mode: 'insensitive',
              },
            }
          : {},
      ],
    };
  }

  private buildVisibilityWhere(
    query: ListVisibilityAuditDto,
  ): Prisma.VisibilityAuditLogWhereInput {
    return {
      AND: [
        ...(this.buildBaseWhere(query) as Prisma.VisibilityAuditLogWhereInput[]),
        query.objectApiName ? { objectApiName: query.objectApiName.trim() } : {},
        query.queryKind ? { queryKind: query.queryKind.trim() } : {},
        query.decision ? { decision: query.decision as VisibilityDecision } : {},
        query.reasonCode ? { decisionReasonCode: query.reasonCode.trim() } : {},
      ],
    };
  }

  private buildApplicationWhere(
    query: ListApplicationAuditDto,
  ): Prisma.ApplicationAuditLogWhereInput {
    return {
      AND: [
        ...(this.buildBaseWhere(query) as Prisma.ApplicationAuditLogWhereInput[]),
        query.action ? { action: query.action.trim() } : {},
        query.status ? { status: query.status } : {},
        query.targetType ? { targetType: query.targetType.trim() } : {},
        query.objectApiName ? { objectApiName: query.objectApiName.trim() } : {},
      ],
    };
  }

  private buildQueryWhere(query: ListQueryAuditDto): Prisma.QueryAuditLogWhereInput {
    return {
      AND: [
        ...(this.buildBaseWhere(query) as Prisma.QueryAuditLogWhereInput[]),
        query.queryKind ? { queryKind: query.queryKind.trim() } : {},
        query.status ? { status: query.status } : {},
        query.targetId ? { targetId: query.targetId.trim() } : {},
        query.objectApiName ? { objectApiName: query.objectApiName.trim() } : {},
        query.recordId ? { recordId: query.recordId.trim() } : {},
      ],
    };
  }

  private buildBaseWhere(query: {
    from?: string;
    to?: string;
    contactId?: string;
    requestId?: string;
    cursor?: string;
  }): Array<Record<string, unknown>> {
    const createdAtFilter: Prisma.DateTimeFilter = {};
    if (query.from) {
      createdAtFilter.gte = new Date(query.from);
    }
    if (query.to) {
      createdAtFilter.lte = new Date(query.to);
    }

    const filters: Array<Record<string, unknown>> = [];
    if (createdAtFilter.gte || createdAtFilter.lte) {
      filters.push({ createdAt: createdAtFilter });
    }

    if (query.contactId?.trim()) {
      filters.push({ contactId: query.contactId.trim() });
    }

    if (query.requestId?.trim()) {
      filters.push({ requestId: query.requestId.trim() });
    }

    if (query.cursor) {
      const cursor = this.decodeCursor(query.cursor);
      filters.push({
        OR: [
          { createdAt: { lt: cursor.createdAt } },
          { createdAt: cursor.createdAt, id: { lt: cursor.id } },
        ],
      });
    }

    return filters;
  }

  private paginate<
    TRow extends { id: bigint; createdAt: Date },
    TResult,
  >(
    rows: TRow[],
    limit: number,
    mapper: (row: TRow) => TResult,
  ): CursorPageResponse<TResult> {
    if (rows.length === 0) {
      return {
        items: [],
        nextCursor: null,
      };
    }

    const pageSize = rows.length > limit ? limit : rows.length;
    const pageRows = rows.slice(0, pageSize);
    const nextRow = rows.length > pageSize ? pageRows[pageRows.length - 1] : null;

    return {
      items: pageRows.map(mapper),
      nextCursor: nextRow ? this.encodeCursor(nextRow.createdAt, nextRow.id) : null,
    };
  }

  private encodeCursor(createdAt: Date, id: bigint): string {
    return Buffer.from(`${createdAt.toISOString()}::${id.toString()}`, 'utf8').toString(
      'base64url',
    );
  }

  private decodeCursor(value: string): CursorState {
    try {
      const decoded = Buffer.from(value, 'base64url').toString('utf8');
      const [createdAt, id] = decoded.split('::');
      if (!createdAt || !id) {
        throw new Error('Invalid cursor');
      }

      return {
        createdAt: new Date(createdAt),
        id: BigInt(id),
      };
    } catch {
      throw new BadRequestException('Invalid audit cursor');
    }
  }

  private parseId(value: string): bigint {
    try {
      return BigInt(value);
    } catch {
      throw new BadRequestException('Audit id must be a bigint string');
    }
  }
}
