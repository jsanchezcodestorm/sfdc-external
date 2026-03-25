import { createHash } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Prisma,
  VisibilityPolicyDefinitionCacheStatus,
  VisibilityRuleEffect,
} from '@prisma/client';

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
  description?: string | null;
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
  rules: RuntimeRuleRow[];
};

type NormalizedContext = {
  alternateSubjectIds: string[];
  baseWhere?: string;
  objectApiName: string;
  permissions: string[];
  permissionsHash: string;
  subjectId: string;
  subjectTraits?: Record<string, unknown>;
  subjectTraitValue?: string;
  skipCache: boolean;
};

type CompiledRuleEntry = {
  id: string;
  effect: VisibilityRuleEffect;
  compiledPredicate: string;
  fieldsAllowed?: string[];
  fieldsDenied?: string[];
};

type CompiledConeEntry = {
  id: string;
  code: string;
  priority: number;
  rules: CompiledRuleEntry[];
};

type PolicyDefinitionState =
  | {
      status: 'READY';
      compiledCones: CompiledConeEntry[];
    }
  | {
      status: 'INVALID';
      invalidRule: {
        id: string;
        message: string;
      };
    };

type SelectiveAssignmentRow = {
  id: string;
  coneId: string;
};

type ResolvedScope = {
  allowFieldSets: string[][];
  allowPredicates: string[];
  appliedCones: string[];
  appliedRules: string[];
  deniedFields: string[];
  denyPredicates: string[];
  matchedAssignments: string[];
};

type DecisionState = {
  decision: 'ALLOW' | 'DENY';
  reasonCode: string;
};

type CachedUserScope = {
  appliedCones: string[];
  appliedRules: string[];
  compiledAllowPredicate?: string;
  compiledDenyPredicate?: string;
  compiledFields?: string[];
  compiledPredicate: string;
  deniedFields?: string[];
  matchedAssignments: string[];
};

@Injectable()
export class VisibilityService {
  private readonly logger = new Logger(VisibilityService.name);
  private readonly cacheTtlSeconds: number;
  private readonly auditEnabled: boolean;

  constructor(
    private readonly configService: ConfigService,
    private readonly prismaService: PrismaService,
    private readonly auditWriteService: AuditWriteService,
  ) {
    this.cacheTtlSeconds = this.readPositiveIntConfig('VISIBILITY_CACHE_TTL_SECONDS', 300);
    this.auditEnabled = this.configService.get<string>('VISIBILITY_AUDIT_ENABLED', 'true') !== 'false';
  }

  async evaluate(context: VisibilityContext): Promise<VisibilityEvaluation> {
    const normalized = this.normalizeContext(context);
    const [policyVersion, objectPolicyVersion] = await Promise.all([
      this.getGlobalPolicyVersion(),
      this.getObjectPolicyVersion(normalized.objectApiName),
    ]);
    const cacheKey = this.buildCacheKey(
      normalized.subjectId,
      normalized.permissionsHash,
      normalized.subjectTraitValue,
      normalized.objectApiName,
      objectPolicyVersion,
    );

    const definition = normalized.skipCache
      ? await this.buildLivePolicyDefinition(normalized.objectApiName)
      : await this.getOrBuildPolicyDefinition(normalized.objectApiName, objectPolicyVersion);

    if (definition.status === 'INVALID') {
      return this.buildInvalidRuleEvaluation({
        baseWhere: normalized.baseWhere,
        cacheKey,
        objectApiName: normalized.objectApiName,
        objectPolicyVersion,
        permissionsHash: normalized.permissionsHash,
        policyVersion,
        subjectId: normalized.subjectId,
        subjectTraits: normalized.subjectTraits,
        subjectTraitValue: normalized.subjectTraitValue,
      });
    }

    if (!normalized.skipCache) {
      const cachedScope = await this.getCachedUserScope(cacheKey);

      if (cachedScope) {
        return this.buildEvaluationFromCachedScope({
          baseWhere: normalized.baseWhere,
          cacheKey,
          cachedScope,
          objectApiName: normalized.objectApiName,
          objectPolicyVersion,
          permissionsHash: normalized.permissionsHash,
          policyVersion,
          subjectId: normalized.subjectId,
          subjectTraits: normalized.subjectTraits,
          subjectTraitValue: normalized.subjectTraitValue,
        });
      }
    }

    const matchedAssignments = await this.findApplicableAssignments({
      coneIds: definition.compiledCones.map((entry) => entry.id),
      permissions: normalized.permissions,
      subjectId: normalized.subjectId,
      alternativeSubjectIds: normalized.alternateSubjectIds,
      subjectTraitValue: normalized.subjectTraitValue,
    });
    const resolvedScope = this.resolveScope(definition.compiledCones, matchedAssignments);
    const evaluation = this.buildEvaluationFromResolvedScope({
      baseWhere: normalized.baseWhere,
      cacheKey,
      objectApiName: normalized.objectApiName,
      objectPolicyVersion,
      permissionsHash: normalized.permissionsHash,
      policyVersion,
      subjectId: normalized.subjectId,
      subjectTraits: normalized.subjectTraits,
      subjectTraitValue: normalized.subjectTraitValue,
      resolvedScope,
    });

    if (!normalized.skipCache) {
      await this.upsertUserScopeCache(cacheKey, normalized.objectApiName, objectPolicyVersion, evaluation);
    }

    return evaluation;
  }

  async evaluateForObject(user: SessionUser, objectApiName: string): Promise<VisibilityEvaluation> {
    return this.evaluate({
      user,
      objectApiName,
    });
  }

  applyFieldVisibility(requestedFields: string[], evaluation: VisibilityEvaluation): string[] {
    const uniqueFields = [...new Set(requestedFields.map((field) => field.trim()).filter(Boolean))];
    let filtered = uniqueFields;

    if (evaluation.compiledFields && evaluation.compiledFields.length > 0) {
      filtered = filtered.filter((field) =>
        evaluation.compiledFields?.some((entry) => matchesVisibilityFieldPath(field, entry)),
      );
    }

    if (evaluation.deniedFields && evaluation.deniedFields.length > 0) {
      filtered = filtered.filter(
        (field) => !evaluation.deniedFields?.some((entry) => matchesVisibilityFieldPath(field, entry)),
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
      durationMs,
    });
  }

  private normalizeContext(context: VisibilityContext): NormalizedContext {
    const subjectId = context.subjectId ?? context.user?.sub ?? context.contactId;
    const objectApiName = context.objectApiName.trim();
    const permissions = this.normalizePermissions(context.permissions ?? context.user?.permissions ?? []);
    const subjectTraits = this.normalizeSubjectTraits(
      context.subjectTraits ?? context.user?.subjectTraits
    );
    const subjectTraitValue =
      this.readOptionalString(context.contactRecordTypeDeveloperName) ??
      this.readSubjectTraitValue(subjectTraits);
    const alternateSubjectIds = this.normalizeSubjectIds([
      ...(context.alternateSubjectIds ?? []),
      ...(context.user?.legacySubjectIds ?? []),
      context.contactId,
    ]);

    if (!subjectId) {
      throw new Error('Visibility context requires subjectId');
    }

    return {
      alternateSubjectIds,
      baseWhere: context.baseWhere,
      objectApiName,
      permissions,
      permissionsHash: this.hashPermissions(permissions),
      subjectId,
      subjectTraits,
      subjectTraitValue,
      skipCache: context.skipCache === true,
    };
  }

  private normalizePermissions(permissions: string[]): string[] {
    return [...new Set(permissions.map((entry) => entry.trim().toUpperCase()).filter(Boolean))].sort();
  }

  private async getGlobalPolicyVersion(): Promise<number> {
    try {
      const meta = await this.prismaService.visibilityPolicyMeta.findUnique({
        where: { id: 1 },
        select: { policyVersion: true },
      });

      return Number(meta?.policyVersion ?? 1n);
    } catch {
      return 1;
    }
  }

  private async getObjectPolicyVersion(objectApiName: string): Promise<number> {
    try {
      const row = await this.prismaService.visibilityObjectPolicyVersion.findUnique({
        where: { objectApiName },
        select: { policyVersion: true },
      });

      return Number(row?.policyVersion ?? 1n);
    } catch {
      return 1;
    }
  }

  private async getOrBuildPolicyDefinition(
    objectApiName: string,
    objectPolicyVersion: number,
  ): Promise<PolicyDefinitionState> {
    const key = {
      objectApiName,
      objectPolicyVersion: BigInt(objectPolicyVersion),
    };
    const cached = await this.prismaService.visibilityPolicyDefinitionCache.findUnique({
      where: {
        objectApiName_objectPolicyVersion: key,
      },
    });

    if (cached) {
      const parsed = this.parseCachedPolicyDefinition(cached);

      if (parsed) {
        return parsed;
      }

      this.logger.warn(
        `Malformed policy definition cache for ${objectApiName}@${objectPolicyVersion}, rebuilding`,
      );
      const rebuilt = await this.buildLivePolicyDefinition(objectApiName);
      await this.persistPolicyDefinition(objectApiName, objectPolicyVersion, rebuilt, 'update');
      return rebuilt;
    }

    const built = await this.buildLivePolicyDefinition(objectApiName);

    try {
      await this.persistPolicyDefinition(objectApiName, objectPolicyVersion, built, 'create');
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const reread = await this.prismaService.visibilityPolicyDefinitionCache.findUnique({
          where: {
            objectApiName_objectPolicyVersion: key,
          },
        });
        const parsed = reread ? this.parseCachedPolicyDefinition(reread) : null;

        if (parsed) {
          return parsed;
        }
      }

      throw error;
    }

    return built;
  }

  private async persistPolicyDefinition(
    objectApiName: string,
    objectPolicyVersion: number,
    definition: PolicyDefinitionState,
    mode: 'create' | 'update',
  ): Promise<void> {
    const data =
      definition.status === 'READY'
        ? {
            status: VisibilityPolicyDefinitionCacheStatus.READY,
            compiledDefinition: this.serializeJson(definition.compiledCones),
            invalidRuleId: null,
            invalidRuleMessage: null,
          }
        : {
            status: VisibilityPolicyDefinitionCacheStatus.INVALID,
            compiledDefinition: Prisma.JsonNull,
            invalidRuleId: definition.invalidRule.id,
            invalidRuleMessage: definition.invalidRule.message,
          };

    if (mode === 'create') {
      await this.prismaService.visibilityPolicyDefinitionCache.create({
        data: {
          objectApiName,
          objectPolicyVersion: BigInt(objectPolicyVersion),
          ...data,
        },
      });
      return;
    }

    await this.prismaService.visibilityPolicyDefinitionCache.update({
      where: {
        objectApiName_objectPolicyVersion: {
          objectApiName,
          objectPolicyVersion: BigInt(objectPolicyVersion),
        },
      },
      data,
    });
  }

  private parseCachedPolicyDefinition(
    row: {
      compiledDefinition: unknown;
      invalidRuleId: string | null;
      invalidRuleMessage: string | null;
      status: VisibilityPolicyDefinitionCacheStatus;
    },
  ): PolicyDefinitionState | null {
    if (row.status === VisibilityPolicyDefinitionCacheStatus.INVALID) {
      return {
        status: 'INVALID',
        invalidRule: {
          id: row.invalidRuleId ?? 'unknown',
          message: row.invalidRuleMessage ?? 'invalid visibility policy definition cache',
        },
      };
    }

    const compiledCones = this.parseCompiledCones(row.compiledDefinition);
    if (!compiledCones) {
      return null;
    }

    return {
      status: 'READY',
      compiledCones,
    };
  }

  private async buildLivePolicyDefinition(objectApiName: string): Promise<PolicyDefinitionState> {
    const cones = await this.prismaService.visibilityCone.findMany({
      where: {
        active: true,
        rules: {
          some: {
            objectApiName,
            active: true,
          },
        },
      },
      orderBy: [{ priority: 'desc' }, { code: 'asc' }],
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
    });

    const compiledCones: CompiledConeEntry[] = [];

    for (const cone of cones) {
      const compiledRules: CompiledRuleEntry[] = [];

      for (const rule of cone.rules) {
        try {
          const normalizedRule = this.normalizeRuntimeRule(rule);
          compiledRules.push({
            id: rule.id,
            effect: normalizedRule.effect,
            compiledPredicate: compileVisibilityRuleNode(normalizedRule.condition),
            fieldsAllowed: normalizedRule.fieldsAllowed,
            fieldsDenied: normalizedRule.fieldsDenied,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'unknown error';
          this.logger.warn(`Invalid visibility rule ${rule.id} for ${objectApiName}: ${message}`);

          return {
            status: 'INVALID',
            invalidRule: {
              id: rule.id,
              message,
            },
          };
        }
      }

      compiledCones.push({
        id: cone.id,
        code: cone.code,
        priority: cone.priority,
        rules: compiledRules,
      });
    }

    return {
      status: 'READY',
      compiledCones,
    };
  }

  private normalizeRuntimeRule(rule: RuntimeRuleRow): VisibilityRuleDefinition {
    return {
      id: rule.id,
      coneId: '',
      objectApiName: rule.objectApiName,
      description: rule.description ?? undefined,
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

  private parseCompiledCones(value: unknown): CompiledConeEntry[] | null {
    if (!Array.isArray(value)) {
      return null;
    }

    const compiledCones: CompiledConeEntry[] = [];

    for (const entry of value) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        return null;
      }

      const record = entry as Record<string, unknown>;
      if (
        typeof record.id !== 'string' ||
        typeof record.code !== 'string' ||
        typeof record.priority !== 'number' ||
        !Array.isArray(record.rules)
      ) {
        return null;
      }

      const rules: CompiledRuleEntry[] = [];
      for (const ruleEntry of record.rules) {
        if (!ruleEntry || typeof ruleEntry !== 'object' || Array.isArray(ruleEntry)) {
          return null;
        }

        const ruleRecord = ruleEntry as Record<string, unknown>;
        const effect = ruleRecord.effect;
        if (
          typeof ruleRecord.id !== 'string' ||
          (effect !== VisibilityRuleEffect.ALLOW && effect !== VisibilityRuleEffect.DENY) ||
          typeof ruleRecord.compiledPredicate !== 'string'
        ) {
          return null;
        }

        rules.push({
          id: ruleRecord.id,
          effect,
          compiledPredicate: ruleRecord.compiledPredicate,
          fieldsAllowed: this.parseStringArray(ruleRecord.fieldsAllowed),
          fieldsDenied: this.parseStringArray(ruleRecord.fieldsDenied),
        });
      }

      compiledCones.push({
        id: record.id,
        code: record.code,
        priority: record.priority,
        rules,
      });
    }

    return compiledCones;
  }

  private async getCachedUserScope(cacheKey: string): Promise<CachedUserScope | null> {
    const row = await this.prismaService.visibilityUserScopeCache.findUnique({
      where: { cacheKey },
    });

    if (!row || row.expiresAt.getTime() <= Date.now()) {
      return null;
    }

    return {
      appliedCones: this.parseStringArray(row.appliedCones) ?? [],
      appliedRules: this.parseStringArray(row.appliedRules) ?? [],
      compiledAllowPredicate:
        typeof row.compiledAllowPredicate === 'string' && row.compiledAllowPredicate.trim()
          ? row.compiledAllowPredicate
          : undefined,
      compiledDenyPredicate:
        typeof row.compiledDenyPredicate === 'string' && row.compiledDenyPredicate.trim()
          ? row.compiledDenyPredicate
          : undefined,
      compiledFields: this.parseStringArray(row.compiledFields),
      compiledPredicate: row.compiledPredicate,
      deniedFields: this.parseStringArray(row.deniedFields),
      matchedAssignments: this.parseStringArray(row.matchedAssignments) ?? [],
    };
  }

  private async upsertUserScopeCache(
    cacheKey: string,
    objectApiName: string,
    objectPolicyVersion: number,
    evaluation: VisibilityEvaluation,
  ): Promise<void> {
    await this.prismaService.visibilityUserScopeCache.upsert({
      where: { cacheKey },
      create: {
        cacheKey,
        objectApiName,
        objectPolicyVersion: BigInt(objectPolicyVersion),
        compiledAllowPredicate: evaluation.compiledAllowPredicate ?? null,
        compiledDenyPredicate: evaluation.compiledDenyPredicate ?? null,
        compiledPredicate: evaluation.compiledPredicate ?? '',
        compiledFields:
          evaluation.compiledFields && evaluation.compiledFields.length > 0
            ? this.serializeJson(evaluation.compiledFields)
            : Prisma.JsonNull,
        deniedFields:
          evaluation.deniedFields && evaluation.deniedFields.length > 0
            ? this.serializeJson(evaluation.deniedFields)
            : Prisma.JsonNull,
        appliedCones: this.serializeJson(evaluation.appliedCones),
        appliedRules: this.serializeJson(evaluation.appliedRules),
        matchedAssignments: this.serializeJson(evaluation.matchedAssignments ?? []),
        expiresAt: new Date(Date.now() + this.cacheTtlSeconds * 1000),
      },
      update: {
        objectApiName,
        objectPolicyVersion: BigInt(objectPolicyVersion),
        compiledAllowPredicate: evaluation.compiledAllowPredicate ?? null,
        compiledDenyPredicate: evaluation.compiledDenyPredicate ?? null,
        compiledPredicate: evaluation.compiledPredicate ?? '',
        compiledFields:
          evaluation.compiledFields && evaluation.compiledFields.length > 0
            ? this.serializeJson(evaluation.compiledFields)
            : Prisma.JsonNull,
        deniedFields:
          evaluation.deniedFields && evaluation.deniedFields.length > 0
            ? this.serializeJson(evaluation.deniedFields)
            : Prisma.JsonNull,
        appliedCones: this.serializeJson(evaluation.appliedCones),
        appliedRules: this.serializeJson(evaluation.appliedRules),
        matchedAssignments: this.serializeJson(evaluation.matchedAssignments ?? []),
        expiresAt: new Date(Date.now() + this.cacheTtlSeconds * 1000),
      },
    });
  }

  private async findApplicableAssignments(params: {
    coneIds: string[];
    permissions: string[];
    subjectId: string;
    alternativeSubjectIds: string[];
    subjectTraitValue?: string;
  }): Promise<SelectiveAssignmentRow[]> {
    if (params.coneIds.length === 0) {
      return [];
    }

    const now = new Date();
    const subjectIds = [params.subjectId, ...params.alternativeSubjectIds];
    const selectorOr: Prisma.VisibilityAssignmentWhereInput[] = [
      {
        contactId: {
          in: subjectIds,
        },
      },
    ];

    if (params.permissions.length > 0) {
      selectorOr.push({
        permissionCode: {
          in: params.permissions,
        },
      });
    }

    if (params.subjectTraitValue) {
      selectorOr.push({
        recordType: params.subjectTraitValue,
      });
    }

    return this.prismaService.visibilityAssignment.findMany({
      where: {
        coneId: {
          in: params.coneIds,
        },
        AND: [
          {
            OR: [{ validFrom: null }, { validFrom: { lte: now } }],
          },
          {
            OR: [{ validTo: null }, { validTo: { gte: now } }],
          },
          {
            OR: selectorOr,
          },
          {
            OR: [{ contactId: null }, { contactId: { in: subjectIds } }],
          },
          params.permissions.length > 0
            ? {
                OR: [{ permissionCode: null }, { permissionCode: { in: params.permissions } }],
              }
            : {
                permissionCode: null,
              },
          params.subjectTraitValue
            ? {
                OR: [{ recordType: null }, { recordType: params.subjectTraitValue }],
              }
            : {
                recordType: null,
              },
        ],
      },
      select: {
        id: true,
        coneId: true,
      },
    });
  }

  private resolveScope(
    compiledCones: CompiledConeEntry[],
    assignments: SelectiveAssignmentRow[],
  ): ResolvedScope {
    const matchedConeIds = new Set(assignments.map((entry) => entry.coneId));
    const applicableCones = compiledCones.filter((entry) => matchedConeIds.has(entry.id));
    const allowPredicates: string[] = [];
    const denyPredicates: string[] = [];
    const allowFieldSets: string[][] = [];
    const deniedFieldsSet = new Set<string>();
    const appliedRules: string[] = [];

    for (const cone of applicableCones) {
      for (const rule of cone.rules) {
        appliedRules.push(rule.id);

        if (rule.effect === VisibilityRuleEffect.ALLOW) {
          allowPredicates.push(rule.compiledPredicate);

          if (rule.fieldsAllowed && rule.fieldsAllowed.length > 0) {
            allowFieldSets.push(rule.fieldsAllowed);
          }
        } else {
          denyPredicates.push(rule.compiledPredicate);
        }

        for (const deniedField of rule.fieldsDenied ?? []) {
          deniedFieldsSet.add(deniedField);
        }
      }
    }

    return {
      allowFieldSets,
      allowPredicates,
      appliedCones: applicableCones.map((entry) => entry.code),
      appliedRules,
      deniedFields: [...deniedFieldsSet],
      denyPredicates,
      matchedAssignments: assignments.map((entry) => entry.id),
    };
  }

  private buildEvaluationFromCachedScope(params: {
    baseWhere?: string;
    cacheKey: string;
    cachedScope: CachedUserScope;
    objectApiName: string;
    objectPolicyVersion: number;
    permissionsHash: string;
    policyVersion: number;
    subjectId: string;
    subjectTraits?: Record<string, unknown>;
    subjectTraitValue?: string;
  }): VisibilityEvaluation {
    const decisionState = this.buildDecisionState(
      params.cachedScope.compiledPredicate,
      params.cachedScope.compiledFields,
    );
    const finalWhere = this.composeFinalWhere(
      params.baseWhere,
      params.cachedScope.compiledPredicate,
    );

    return {
      decision: decisionState.decision,
      reasonCode: decisionState.reasonCode,
      policyVersion: params.policyVersion,
      objectPolicyVersion: params.objectPolicyVersion,
      objectApiName: params.objectApiName,
      subjectId: params.subjectId,
      subjectTraits: params.subjectTraits,
      contactId: params.subjectId,
      recordType: params.subjectTraitValue,
      appliedCones: params.cachedScope.appliedCones,
      appliedRules: params.cachedScope.appliedRules,
      matchedAssignments: params.cachedScope.matchedAssignments,
      permissionsHash: params.permissionsHash,
      compiledAllowPredicate: params.cachedScope.compiledAllowPredicate,
      compiledDenyPredicate: params.cachedScope.compiledDenyPredicate,
      compiledPredicate: params.cachedScope.compiledPredicate || undefined,
      compiledFields: params.cachedScope.compiledFields,
      deniedFields:
        params.cachedScope.deniedFields && params.cachedScope.deniedFields.length > 0
          ? params.cachedScope.deniedFields
          : undefined,
      cacheKey: params.cacheKey,
      baseWhere: params.baseWhere,
      finalWhere,
    };
  }

  private buildEvaluationFromResolvedScope(params: {
    baseWhere?: string;
    cacheKey: string;
    objectApiName: string;
    objectPolicyVersion: number;
    permissionsHash: string;
    policyVersion: number;
    subjectId: string;
    subjectTraits?: Record<string, unknown>;
    subjectTraitValue?: string;
    resolvedScope: ResolvedScope;
  }): VisibilityEvaluation {
    const compiledAllowPredicate =
      params.resolvedScope.allowPredicates.length > 0
        ? this.composeOrPredicate(params.resolvedScope.allowPredicates)
        : undefined;
    const compiledDenyPredicate =
      params.resolvedScope.denyPredicates.length > 0
        ? this.composeOrPredicate(params.resolvedScope.denyPredicates)
        : undefined;
    const compiledFields = this.resolveCompiledFields(
      params.resolvedScope.allowFieldSets,
      params.resolvedScope.deniedFields,
    );
    const compiledPredicate = this.composeCompiledPredicate(
      params.resolvedScope.allowPredicates,
      params.resolvedScope.denyPredicates,
    );
    const decisionState = this.buildDecisionState(compiledPredicate, compiledFields);
    const finalWhere = this.composeFinalWhere(params.baseWhere, compiledPredicate);

    return {
      decision: decisionState.decision,
      reasonCode: decisionState.reasonCode,
      policyVersion: params.policyVersion,
      objectPolicyVersion: params.objectPolicyVersion,
      objectApiName: params.objectApiName,
      subjectId: params.subjectId,
      subjectTraits: params.subjectTraits,
      contactId: params.subjectId,
      recordType: params.subjectTraitValue,
      appliedCones: params.resolvedScope.appliedCones,
      appliedRules: params.resolvedScope.appliedRules,
      matchedAssignments: params.resolvedScope.matchedAssignments,
      permissionsHash: params.permissionsHash,
      compiledAllowPredicate,
      compiledDenyPredicate,
      compiledPredicate: compiledPredicate || undefined,
      compiledFields,
      deniedFields:
        params.resolvedScope.deniedFields.length > 0 ? params.resolvedScope.deniedFields : undefined,
      cacheKey: params.cacheKey,
      baseWhere: params.baseWhere,
      finalWhere,
    };
  }

  private buildInvalidRuleEvaluation(params: {
    baseWhere?: string;
    cacheKey: string;
    objectApiName: string;
    objectPolicyVersion: number;
    permissionsHash: string;
    policyVersion: number;
    subjectId: string;
    subjectTraits?: Record<string, unknown>;
    subjectTraitValue?: string;
  }): VisibilityEvaluation {
    return {
      decision: 'DENY',
      reasonCode: 'INVALID_RULE_DROPPED',
      policyVersion: params.policyVersion,
      objectPolicyVersion: params.objectPolicyVersion,
      objectApiName: params.objectApiName,
      subjectId: params.subjectId,
      subjectTraits: params.subjectTraits,
      contactId: params.subjectId,
      recordType: params.subjectTraitValue,
      appliedCones: [],
      appliedRules: [],
      matchedAssignments: [],
      permissionsHash: params.permissionsHash,
      cacheKey: params.cacheKey,
      baseWhere: params.baseWhere,
      finalWhere: this.composeFinalWhere(params.baseWhere, ''),
    };
  }

  private buildDecisionState(
    compiledPredicate: string,
    compiledFields: string[] | undefined,
  ): DecisionState {
    if (!compiledPredicate) {
      return {
        decision: 'DENY',
        reasonCode: 'NO_ALLOW_RULE',
      };
    }

    if (compiledFields && compiledFields.length === 0) {
      return {
        decision: 'DENY',
        reasonCode: 'FIELDSET_EMPTY',
      };
    }

    return {
      decision: 'ALLOW',
      reasonCode: 'ALLOW_MATCH',
    };
  }

  private resolveCompiledFields(allowFieldSets: string[][], deniedFields: string[]): string[] | undefined {
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

  private parseStringArray(value: unknown): string[] | undefined {
    if (!Array.isArray(value)) {
      return undefined;
    }

    return value
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  private serializeJson(value: unknown): Prisma.InputJsonValue {
    return value as Prisma.InputJsonValue;
  }

  private buildCacheKey(
    subjectId: string,
    permissionsHash: string,
    subjectTraitValue: string | undefined,
    objectApiName: string,
    objectPolicyVersion: number,
  ): string {
    return this.hashText(
      [subjectId, permissionsHash, subjectTraitValue ?? '', objectApiName, String(objectPolicyVersion)].join(
        '|',
      ),
    );
  }

  private normalizeSubjectIds(values: Array<string | undefined>): string[] {
    return [...new Set(values.map((entry) => entry?.trim()).filter(Boolean) as string[])];
  }

  private normalizeSubjectTraits(value: unknown): Record<string, unknown> | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return undefined;
    }

    const traits = Object.fromEntries(
      Object.entries(value).filter(([, entry]) => entry !== undefined)
    );

    return Object.keys(traits).length > 0 ? traits : undefined;
  }

  private readSubjectTraitValue(traits?: Record<string, unknown>): string | undefined {
    if (!traits) {
      return undefined;
    }

    return (
      this.readOptionalString(traits.contactRecordTypeDeveloperName) ??
      this.readOptionalString(traits.recordTypeDeveloperName) ??
      this.readOptionalString(traits.recordType) ??
      this.readOptionalString(traits.role) ??
      undefined
    );
  }

  private readOptionalString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
  }

  private hashPermissions(permissions: string[]): string {
    return this.hashText(permissions.join('|'));
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
