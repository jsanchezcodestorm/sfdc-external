import { createHash } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, VisibilityRuleEffect } from '@prisma/client';

import { AuditWriteService } from '../audit/audit-write.service';
import type { SessionUser } from '../auth/session-user.interface';
import { PrismaService } from '../prisma/prisma.service';

import {
  compileVisibilityRuleNode,
  matchesVisibilityFieldPath,
  normalizeVisibilityFieldList,
  normalizeVisibilityRuleNode,
} from './visibility-rule-dsl';
import type {
  VisibilityContext,
  VisibilityEvaluation,
  VisibilityRuleDefinition,
} from './visibility.types';

type RuntimeRuleRow = {
  id: string;
  objectApiName: string;
  effect: VisibilityRuleEffect;
  conditionJson: unknown;
  fieldsAllowed: unknown;
  fieldsDenied: unknown;
  active: boolean;
};

type RuntimeConeRow = {
  id: string;
  code: string;
  priority: number;
  active: boolean;
  rules: RuntimeRuleRow[];
};

type RuntimeAssignmentRow = {
  id: string;
  coneId: string;
  contactId: string | null;
  permissionCode: string | null;
  recordType: string | null;
  validFrom: Date | null;
  validTo: Date | null;
  cone: RuntimeConeRow;
};

type ProcessedRuntimeRules = {
  appliedRules: string[];
  allowPredicates: string[];
  denyPredicates: string[];
  allowFieldSets: string[][];
  deniedFields: string[];
  invalidRule?: {
    id: string;
    message: string;
  };
};

@Injectable()
export class VisibilityService {
  private readonly logger = new Logger(VisibilityService.name);
  private readonly cacheTtlSeconds: number;
  private readonly auditEnabled: boolean;

  constructor(
    private readonly configService: ConfigService,
    private readonly prismaService: PrismaService,
    private readonly auditWriteService: AuditWriteService
  ) {
    this.cacheTtlSeconds = this.readPositiveIntConfig('VISIBILITY_CACHE_TTL_SECONDS', 300);
    this.auditEnabled = this.configService.get<string>('VISIBILITY_AUDIT_ENABLED', 'true') !== 'false';
  }

  async evaluate(context: VisibilityContext): Promise<VisibilityEvaluation> {
    const contactId = context.contactId ?? context.user?.sub;
    const permissions = context.permissions ?? context.user?.permissions ?? [];
    const recordType =
      context.contactRecordTypeDeveloperName ??
      context.user?.contactRecordTypeDeveloperName;

    if (!contactId) {
      throw new Error('Visibility context requires contactId');
    }

    const objectApiName = context.objectApiName.trim();
    const policyVersion = await this.getPolicyVersion();
    const permissionsHash = this.hashPermissions(permissions);
    const cacheKey = this.buildCacheKey(
      contactId,
      permissionsHash,
      recordType,
      objectApiName,
      policyVersion,
    );

    const matchedAssignments = await this.prismaService.visibilityAssignment.findMany({
      where: {
        cone: {
          active: true,
          rules: {
            some: {
              objectApiName,
              active: true,
            },
          },
        },
      },
      include: {
        cone: {
          include: {
            rules: {
              where: {
                objectApiName,
                active: true,
              },
              orderBy: {
                updatedAt: 'asc',
              },
            },
          },
        },
      },
    });

    const applicableAssignments = matchedAssignments.filter((assignment) =>
      this.matchesAssignment(assignment, contactId, permissions, recordType),
    );
    const applicableCones = this.getApplicableCones(applicableAssignments);
    const appliedCones = applicableCones.map((cone) => cone.code);
    const processedRules = this.processApplicableRules(applicableCones, objectApiName);

    if (processedRules.invalidRule) {
      return this.buildInvalidRuleEvaluation({
        contactId,
        recordType,
        objectApiName,
        policyVersion,
        appliedCones,
        appliedRules: processedRules.appliedRules,
        matchedAssignments: applicableAssignments.map((assignment) => assignment.id),
        permissionsHash,
        cacheKey,
        baseWhere: context.baseWhere,
      });
    }

    const cachedScope =
      context.skipCache === true
        ? null
        : await this.prismaService.visibilityUserScopeCache.findUnique({
            where: { cacheKey },
          });

    let compiledPredicate =
      cachedScope && cachedScope.expiresAt.getTime() > Date.now()
        ? cachedScope.compiledPredicate
        : '';
    let compiledFields =
      cachedScope && cachedScope.expiresAt.getTime() > Date.now()
        ? this.parseCompiledFields(cachedScope.compiledFields)
        : undefined;

    if (!compiledPredicate) {
      compiledFields = this.resolveCompiledFields(
        processedRules.allowFieldSets,
        processedRules.deniedFields
      );
      compiledPredicate = this.composeCompiledPredicate(
        processedRules.allowPredicates,
        processedRules.denyPredicates
      );

      if (context.skipCache !== true) {
        await this.prismaService.visibilityUserScopeCache.upsert({
          where: { cacheKey },
          create: {
            cacheKey,
            objectApiName,
            policyVersion: BigInt(policyVersion),
            compiledPredicate,
            compiledFields:
              compiledFields && compiledFields.length > 0
                ? (compiledFields as unknown as Prisma.InputJsonValue)
                : Prisma.JsonNull,
            expiresAt: new Date(Date.now() + this.cacheTtlSeconds * 1000),
          },
          update: {
            objectApiName,
            policyVersion: BigInt(policyVersion),
            compiledPredicate,
            compiledFields:
              compiledFields && compiledFields.length > 0
                ? (compiledFields as unknown as Prisma.InputJsonValue)
                : Prisma.JsonNull,
            expiresAt: new Date(Date.now() + this.cacheTtlSeconds * 1000),
          },
        });
      }
    } else {
      if (!compiledFields) {
        compiledFields = this.resolveCompiledFields(
          processedRules.allowFieldSets,
          processedRules.deniedFields
        );
      }
    }

    const deniedFields = processedRules.deniedFields;
    const hasAllow = compiledPredicate.length > 0;
    const decision = hasAllow ? 'ALLOW' : 'DENY';
    const reasonCode = hasAllow
      ? compiledFields && compiledFields.length === 0
        ? 'FIELDSET_EMPTY'
        : 'ALLOW_MATCH'
      : 'NO_ALLOW_RULE';

    const finalWhere = this.composeFinalWhere(context.baseWhere, compiledPredicate);
    return {
      decision:
        reasonCode === 'FIELDSET_EMPTY' ? 'DENY' : decision,
      reasonCode,
      policyVersion,
      objectApiName,
      contactId,
      recordType,
      appliedCones,
      appliedRules: processedRules.appliedRules,
      matchedAssignments: applicableAssignments.map((assignment) => assignment.id),
      permissionsHash,
      compiledAllowPredicate:
        processedRules.allowPredicates.length > 0
          ? this.composeOrPredicate(processedRules.allowPredicates)
          : undefined,
      compiledDenyPredicate:
        processedRules.denyPredicates.length > 0
          ? this.composeOrPredicate(processedRules.denyPredicates)
          : undefined,
      compiledPredicate: compiledPredicate || undefined,
      compiledFields,
      deniedFields: deniedFields.length > 0 ? deniedFields : undefined,
      cacheKey,
      baseWhere: context.baseWhere,
      finalWhere,
    };
  }

  async evaluateForObject(user: SessionUser, objectApiName: string): Promise<VisibilityEvaluation> {
    return this.evaluate({
      user,
      objectApiName
    });
  }

  applyFieldVisibility(
    requestedFields: string[],
    evaluation: VisibilityEvaluation,
  ): string[] {
    const uniqueFields = [...new Set(requestedFields.map((field) => field.trim()).filter(Boolean))];
    let filtered = uniqueFields;

    if (evaluation.compiledFields && evaluation.compiledFields.length > 0) {
      filtered = filtered.filter((field) =>
        evaluation.compiledFields?.some((entry) => matchesVisibilityFieldPath(field, entry)),
      );
    }

    if (evaluation.deniedFields && evaluation.deniedFields.length > 0) {
      filtered = filtered.filter(
        (field) =>
          !evaluation.deniedFields?.some((entry) => matchesVisibilityFieldPath(field, entry)),
      );
    }

    return filtered;
  }

  async recordAudit(params: {
    evaluation: VisibilityEvaluation;
    queryKind: string;
    baseWhere?: string;
    finalWhere?: string;
    rowCount: number;
    durationMs?: number;
  }): Promise<void> {
    if (!this.auditEnabled) {
      return;
    }

    const { evaluation, queryKind, baseWhere, finalWhere, rowCount, durationMs } = params;

    await this.auditWriteService.recordVisibilityEventOrThrow({
      evaluation,
      queryKind,
      baseWhere,
      finalWhere,
      rowCount,
      durationMs
    });
  }

  private async getPolicyVersion(): Promise<number> {
    try {
      const meta = await this.prismaService.visibilityPolicyMeta.findUnique({
        where: { id: 1 }
      });

      return Number(meta?.policyVersion ?? 1n);
    } catch {
      return 1;
    }
  }

  private normalizeRuntimeRule(rule: RuntimeRuleRow): VisibilityRuleDefinition {
    return {
      id: rule.id,
      coneId: '',
      objectApiName: rule.objectApiName,
      effect: rule.effect,
      condition: normalizeVisibilityRuleNode(rule.conditionJson),
      fieldsAllowed: Array.isArray(rule.fieldsAllowed)
        ? normalizeVisibilityFieldList(rule.fieldsAllowed, 'fieldsAllowed')
        : undefined,
      fieldsDenied: Array.isArray(rule.fieldsDenied)
        ? normalizeVisibilityFieldList(rule.fieldsDenied, 'fieldsDenied')
        : undefined,
      active: rule.active,
    };
  }

  private processApplicableRules(
    applicableCones: RuntimeConeRow[],
    objectApiName: string,
  ): ProcessedRuntimeRules {
    const appliedRules: string[] = [];
    const allowPredicates: string[] = [];
    const denyPredicates: string[] = [];
    const allowFieldSets: string[][] = [];
    const deniedFieldsSet = new Set<string>();

    for (const cone of applicableCones) {
      for (const rule of cone.rules) {
        try {
          const normalizedRule = this.normalizeRuntimeRule(rule);
          const compiledRule = compileVisibilityRuleNode(normalizedRule.condition);
          appliedRules.push(rule.id);

          if (normalizedRule.effect === VisibilityRuleEffect.ALLOW) {
            allowPredicates.push(compiledRule);

            if (normalizedRule.fieldsAllowed && normalizedRule.fieldsAllowed.length > 0) {
              allowFieldSets.push(normalizedRule.fieldsAllowed);
            }
          } else {
            denyPredicates.push(compiledRule);
          }

          for (const deniedField of normalizedRule.fieldsDenied ?? []) {
            deniedFieldsSet.add(deniedField);
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'unknown error';
          this.logger.warn(`Invalid visibility rule ${rule.id} for ${objectApiName}: ${message}`);

          return {
            appliedRules,
            allowPredicates,
            denyPredicates,
            allowFieldSets,
            deniedFields: [...deniedFieldsSet],
            invalidRule: {
              id: rule.id,
              message,
            },
          };
        }
      }
    }

    return {
      appliedRules,
      allowPredicates,
      denyPredicates,
      allowFieldSets,
      deniedFields: [...deniedFieldsSet],
    };
  }

  private buildInvalidRuleEvaluation(params: {
    contactId: string;
    recordType: string | undefined;
    objectApiName: string;
    policyVersion: number;
    appliedCones: string[];
    appliedRules: string[];
    matchedAssignments: string[];
    permissionsHash: string;
    cacheKey: string;
    baseWhere?: string;
  }): VisibilityEvaluation {
    return {
      decision: 'DENY',
      reasonCode: 'INVALID_RULE_DROPPED',
      policyVersion: params.policyVersion,
      objectApiName: params.objectApiName,
      contactId: params.contactId,
      recordType: params.recordType,
      appliedCones: params.appliedCones,
      appliedRules: params.appliedRules,
      matchedAssignments: params.matchedAssignments,
      permissionsHash: params.permissionsHash,
      cacheKey: params.cacheKey,
      baseWhere: params.baseWhere,
      finalWhere: this.composeFinalWhere(params.baseWhere, ''),
    };
  }

  private matchesAssignment(
    assignment: RuntimeAssignmentRow,
    contactId: string,
    permissions: string[],
    recordType: string | undefined,
  ): boolean {
    const nowMs = Date.now();
    if (assignment.validFrom && assignment.validFrom.getTime() > nowMs) {
      return false;
    }

    if (assignment.validTo && assignment.validTo.getTime() < nowMs) {
      return false;
    }

    const hasSelector =
      Boolean(assignment.contactId) ||
      Boolean(assignment.permissionCode) ||
      Boolean(assignment.recordType);
    if (!hasSelector) {
      return false;
    }

    if (assignment.contactId && assignment.contactId !== contactId) {
      return false;
    }

    if (
      assignment.permissionCode &&
      !permissions.some((entry) => entry.trim().toUpperCase() === assignment.permissionCode)
    ) {
      return false;
    }

    if (assignment.recordType && assignment.recordType !== recordType) {
      return false;
    }

    return true;
  }

  private getApplicableCones(assignments: RuntimeAssignmentRow[]): RuntimeConeRow[] {
    const coneMap = new Map<string, RuntimeConeRow>();

    for (const assignment of assignments) {
      if (!coneMap.has(assignment.coneId)) {
        coneMap.set(assignment.coneId, assignment.cone);
      }
    }

    return [...coneMap.values()].sort((left, right) => {
      if (left.priority !== right.priority) {
        return right.priority - left.priority;
      }

      return left.code.localeCompare(right.code);
    });
  }

  private resolveCompiledFields(
    allowFieldSets: string[][],
    deniedFields: string[],
  ): string[] | undefined {
    const deniedSet = new Set(deniedFields);
    let allowed: string[] | undefined;

    for (const fieldSet of allowFieldSets) {
      const uniqueSet = [...new Set(fieldSet)];
      allowed =
        allowed === undefined
          ? uniqueSet
          : allowed.filter((field) =>
              uniqueSet.some((candidate) => matchesVisibilityFieldPath(field, candidate)),
            );
    }

    if (!allowed) {
      return undefined;
    }

    return allowed.filter(
      (field) => ![...deniedSet].some((candidate) => matchesVisibilityFieldPath(field, candidate)),
    );
  }

  private composeCompiledPredicate(allowPredicates: string[], denyPredicates: string[]): string {
    if (allowPredicates.length === 0) {
      return '';
    }

    const allow = this.composeOrPredicate(allowPredicates);
    if (denyPredicates.length === 0) {
      return allow;
    }

    const deny = this.composeOrPredicate(denyPredicates);
    return `(${allow}) AND NOT (${deny})`;
  }

  private composeOrPredicate(predicates: string[]): string {
    return predicates.length === 1 ? predicates[0] : `(${predicates.join(' OR ')})`;
  }

  private composeFinalWhere(baseWhere: string | undefined, predicate: string): string | undefined {
    const normalizedBase = baseWhere?.trim();
    const normalizedPredicate = predicate.trim();

    if (!normalizedBase && !normalizedPredicate) {
      return undefined;
    }

    if (!normalizedBase) {
      return normalizedPredicate;
    }

    if (!normalizedPredicate) {
      return normalizedBase;
    }

    return `(${normalizedBase}) AND (${normalizedPredicate})`;
  }

  private parseCompiledFields(value: unknown): string[] | undefined {
    if (!Array.isArray(value)) {
      return undefined;
    }

    return value
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  private buildCacheKey(
    contactId: string,
    permissionsHash: string,
    recordType: string | undefined,
    objectApiName: string,
    policyVersion: number,
  ): string {
    return this.hashText(
      [contactId, permissionsHash, recordType ?? '', objectApiName, String(policyVersion)].join('|'),
    );
  }

  private hashPermissions(permissions: string[]): string {
    return this.hashText(
      [...new Set(permissions.map((entry) => entry.trim().toUpperCase()).filter(Boolean))]
        .sort()
        .join('|'),
    );
  }

  private hashText(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private readPositiveIntConfig(key: string, fallback: number): number {
    const raw = this.configService.get<string>(key);
    const parsed = Number.parseInt(raw ?? '', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
}
