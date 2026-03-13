import { createHash } from 'node:crypto';

import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, type ApplicationAuditStatus } from '../prisma/generated/client';

import { PrismaService } from '../prisma/prisma.service';

import type {
  ApplicationAuditIntentInput,
  ApplicationAuditOutcomeInput,
  ApplicationAuditSuccessInput,
  QueryAuditIntentInput,
  QueryAuditOutcomeInput,
  SecurityAuditWriteInput,
  VisibilityAuditWriteInput,
} from './audit.types';
import { RequestContextService } from './request-context.service';

@Injectable()
export class AuditWriteService {
  private readonly logger = new Logger(AuditWriteService.name);
  private readonly hashSalt: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly prismaService: PrismaService,
    private readonly requestContextService: RequestContextService,
  ) {
    this.hashSalt =
      this.configService.get<string>('AUDIT_HASH_SALT') ??
      this.configService.get<string>('JWT_SECRET', 'audit-salt');
  }

  async recordSecurityEventOrThrow(input: SecurityAuditWriteInput): Promise<void> {
    try {
      await this.prismaService.securityAuditLog.create({
        data: {
          requestId: this.requestContextService.getRequestId(),
          contactId:
            input.contactId === undefined
              ? this.requestContextService.get()?.userContactId ?? null
              : input.contactId,
          endpoint: input.endpoint ?? this.requestContextService.get()?.endpoint ?? '/',
          httpMethod:
            input.httpMethod ?? this.requestContextService.get()?.httpMethod ?? 'UNKNOWN',
          eventType: input.eventType,
          decision: input.decision,
          reasonCode: input.reasonCode,
          ipHash: this.hashText(this.requestContextService.get()?.ip ?? ''),
          userAgentHash: this.hashText(this.requestContextService.get()?.userAgent ?? ''),
          metadataJson: this.normalizeJson(input.metadata),
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to persist security audit event ${input.eventType}/${input.reasonCode}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
      throw new ServiceUnavailableException('Unable to persist security audit event');
    }
  }

  async recordSecurityEventBestEffort(input: SecurityAuditWriteInput): Promise<void> {
    try {
      await this.recordSecurityEventOrThrow(input);
    } catch (error) {
      this.logger.warn(
        `Best-effort security audit event dropped ${input.eventType}/${input.reasonCode}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }
  }

  async recordVisibilityEventOrThrow(input: VisibilityAuditWriteInput): Promise<void> {
    try {
      await this.prismaService.visibilityAuditLog.create({
        data: {
          requestId: this.requestContextService.getRequestId(),
          contactId: input.evaluation.contactId,
          permissionsHash:
            input.evaluation.permissionsHash ?? this.hashText('permissions:none'),
          recordType: input.evaluation.recordType ?? null,
          objectApiName: input.evaluation.objectApiName,
          queryKind: input.queryKind,
          baseWhereHash: this.hashText(input.baseWhere ?? input.evaluation.baseWhere ?? ''),
          finalWhereHash: this.hashText(input.finalWhere ?? input.evaluation.finalWhere ?? ''),
          appliedCones: input.evaluation.appliedCones as unknown as Prisma.InputJsonValue,
          appliedRules: input.evaluation.appliedRules as unknown as Prisma.InputJsonValue,
          decision: input.evaluation.decision,
          decisionReasonCode: input.evaluation.reasonCode,
          rowCount: input.rowCount,
          durationMs: Math.max(0, input.durationMs ?? 0),
          policyVersion: BigInt(input.evaluation.policyVersion),
          objectPolicyVersion: BigInt(input.evaluation.objectPolicyVersion),
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to persist visibility audit event ${input.queryKind}/${input.evaluation.reasonCode}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
      throw new ServiceUnavailableException('Unable to persist visibility audit event');
    }
  }

  async createApplicationIntentOrThrow(
    input: ApplicationAuditIntentInput,
  ): Promise<bigint> {
    try {
      const created = await this.prismaService.applicationAuditLog.create({
        data: {
          requestId: this.requestContextService.getRequestId(),
          contactId: input.contactId ?? this.requestContextService.get()?.userContactId ?? 'unknown',
          action: input.action,
          targetType: input.targetType,
          targetId: input.targetId,
          objectApiName: input.objectApiName ?? null,
          recordId: input.recordId ?? null,
          status: 'PENDING',
          payloadHash: this.hashPayload(input.payload),
          metadataJson: this.normalizeJson(input.metadata),
          resultJson: Prisma.JsonNull,
        },
      });

      return created.id;
    } catch (error) {
      this.logger.error(
        `Failed to persist application audit intent ${input.action}/${input.targetType}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
      throw new ServiceUnavailableException('Unable to persist application audit event');
    }
  }

  async completeApplicationAuditOrThrow(
    input: ApplicationAuditOutcomeInput,
  ): Promise<void> {
    try {
      await this.prismaService.applicationAuditLog.update({
        where: { id: input.auditId },
        data: {
          status: input.status,
          completedAt: new Date(),
          errorCode: input.errorCode ?? null,
          resultJson: this.normalizeJson(input.result),
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to finalize application audit ${input.auditId.toString()}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
      throw new ServiceUnavailableException('Unable to finalize application audit event');
    }
  }

  async recordApplicationSuccessOrThrow(
    input: ApplicationAuditSuccessInput,
  ): Promise<void> {
    const status: ApplicationAuditStatus = input.status ?? 'SUCCESS';

    try {
      await this.prismaService.applicationAuditLog.create({
        data: {
          requestId: this.requestContextService.getRequestId(),
          contactId: input.contactId ?? this.requestContextService.get()?.userContactId ?? 'unknown',
          action: input.action,
          targetType: input.targetType,
          targetId: input.targetId,
          objectApiName: input.objectApiName ?? null,
          recordId: input.recordId ?? null,
          status,
          payloadHash: this.hashPayload(input.payload),
          metadataJson: this.normalizeJson(input.metadata),
          resultJson: this.normalizeJson(input.result),
          errorCode: input.errorCode ?? null,
          completedAt: new Date(),
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to persist application audit ${input.action}/${input.targetType}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
      throw new ServiceUnavailableException('Unable to persist application audit event');
    }
  }

  async createQueryAuditIntentOrThrow(input: QueryAuditIntentInput): Promise<bigint> {
    const normalizedBaseWhere = input.baseWhere?.trim() ?? '';
    const normalizedFinalWhere = input.finalWhere?.trim() ?? '';

    try {
      const created = await this.prismaService.queryAuditLog.create({
        data: {
          requestId: this.requestContextService.getRequestId(),
          contactId: input.contactId ?? this.requestContextService.get()?.userContactId ?? 'unknown',
          queryKind: input.queryKind,
          targetId: input.targetId,
          objectApiName: input.objectApiName,
          recordId: input.recordId ?? null,
          status: 'PENDING',
          resolvedSoql: input.resolvedSoql,
          baseWhere: normalizedBaseWhere,
          baseWhereHash: this.hashText(normalizedBaseWhere),
          finalWhere: normalizedFinalWhere,
          finalWhereHash: this.hashText(normalizedFinalWhere),
          rowCount: 0,
          durationMs: 0,
          metadataJson: this.normalizeJson(input.metadata),
          resultJson: Prisma.JsonNull,
          errorCode: null,
        },
      });

      return created.id;
    } catch (error) {
      this.logger.error(
        `Failed to persist query audit intent ${input.queryKind}/${input.targetId}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
      throw new ServiceUnavailableException('Unable to persist query audit event');
    }
  }

  async completeQueryAuditOrThrow(input: QueryAuditOutcomeInput): Promise<void> {
    try {
      await this.prismaService.queryAuditLog.update({
        where: { id: input.auditId },
        data: {
          status: input.status,
          completedAt: new Date(),
          rowCount: Math.max(0, input.rowCount),
          durationMs: Math.max(0, input.durationMs),
          errorCode: input.errorCode ?? null,
          resultJson: this.normalizeJson(input.result),
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to finalize query audit ${input.auditId.toString()}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
      throw new ServiceUnavailableException('Unable to finalize query audit event');
    }
  }

  hashPayload(value: unknown): string {
    return this.hashText(JSON.stringify(this.normalizeUnknown(value)));
  }

  normalizeErrorCode(error: unknown): string {
    if (!error) {
      return 'UNKNOWN_ERROR';
    }

    if (error instanceof Error && error.name.trim()) {
      return error.name.trim().toUpperCase().slice(0, 128);
    }

    return 'UNKNOWN_ERROR';
  }

  private hashText(value: string): string {
    return createHash('sha256')
      .update(this.hashSalt)
      .update(':')
      .update(value)
      .digest('hex');
  }

  private normalizeJson(
    value: unknown,
  ): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput {
    if (value === undefined || value === null) {
      return Prisma.JsonNull;
    }

    return this.normalizeUnknown(value) as Prisma.InputJsonValue;
  }

  private normalizeUnknown(value: unknown): unknown {
    if (
      value === null ||
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      return value;
    }

    if (value instanceof Date) {
      return value.toISOString();
    }

    if (typeof value === 'bigint') {
      return value.toString();
    }

    if (Array.isArray(value)) {
      return value.slice(0, 50).map((entry) => this.normalizeUnknown(entry));
    }

    if (typeof value !== 'object') {
      return String(value);
    }

    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([key, entry]) => entry !== undefined && !this.isSensitiveKey(key))
      .slice(0, 50)
      .map(([key, entry]) => [key, this.normalizeUnknown(entry)] as const);

    return Object.fromEntries(entries);
  }

  private isSensitiveKey(key: string): boolean {
    const normalized = key.trim().toLowerCase();
    return (
      normalized.includes('token') ||
      normalized.includes('cookie') ||
      normalized.includes('secret') ||
      normalized.includes('password') ||
      normalized.includes('authorization') ||
      normalized.includes('jwt')
    );
  }
}
