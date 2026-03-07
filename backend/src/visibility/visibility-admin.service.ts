import { randomUUID } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, VisibilityRuleEffect } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { SalesforceService } from '../salesforce/salesforce.service';

import {
  compileVisibilityRuleNode,
  normalizeVisibilityFieldList,
  normalizeVisibilityRuleNode,
  type VisibilityRuleNode,
} from './visibility-rule-dsl';
import { VisibilityService } from './visibility.service';
import type {
  VisibilityAssignmentDefinition,
  VisibilityConeDefinition,
  VisibilityEvaluation,
  VisibilityRuleDefinition,
} from './visibility.types';

type PrismaTransaction = Prisma.TransactionClient;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONE_CODE_PATTERN = /^[a-z0-9-]+$/;
const SALESFORCE_ID_PATTERN = /^[A-Za-z0-9]{15,18}$/;
const SALESFORCE_OBJECT_API_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const SALESFORCE_FIELD_PATH_PATTERN = /^[A-Za-z_][A-Za-z0-9_.]*$/;

export type VisibilityDebugPreviewScalar = string | number | boolean | null;
export type VisibilityDebugPreviewSkipReason = 'VISIBILITY_DENY' | 'NO_VISIBLE_FIELDS';

export interface VisibilityDebugPreviewResponse {
  visibility: VisibilityEvaluation;
  selectedFields: string[];
  soql?: string;
  records: Array<Record<string, VisibilityDebugPreviewScalar>>;
  rowCount: number;
  executed: boolean;
  executionSkippedReason?: VisibilityDebugPreviewSkipReason;
}

export interface VisibilityConeSummaryResponse extends VisibilityConeDefinition {
  ruleCount: number;
  assignmentCount: number;
  updatedAt: string;
}

export interface VisibilityConeDetailResponse {
  cone: VisibilityConeDefinition;
  ruleCount: number;
  assignmentCount: number;
}

export interface VisibilityRuleSummaryResponse {
  id: string;
  coneId: string;
  coneCode: string;
  objectApiName: string;
  effect: VisibilityRuleEffect;
  active: boolean;
  fieldsAllowedCount: number;
  fieldsDeniedCount: number;
  updatedAt: string;
}

export interface VisibilityRuleDetailResponse {
  rule: VisibilityRuleDefinition;
}

export interface VisibilityAssignmentSummaryResponse {
  id: string;
  coneId: string;
  coneCode: string;
  contactId?: string;
  permissionCode?: string;
  recordType?: string;
  validFrom?: string;
  validTo?: string;
  isCurrentlyApplicable: boolean;
  updatedAt: string;
}

export interface VisibilityAssignmentDetailResponse {
  assignment: VisibilityAssignmentDefinition;
}

export interface VisibilityDebugContactSuggestion {
  id: string;
  name?: string;
  recordTypeDeveloperName?: string;
}

@Injectable()
export class VisibilityAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly visibilityService: VisibilityService,
    private readonly salesforceService: SalesforceService,
  ) {}

  async listCones(): Promise<{ items: VisibilityConeSummaryResponse[] }> {
    const rows = await this.prisma.visibilityCone.findMany({
      orderBy: [{ priority: 'desc' }, { code: 'asc' }],
      include: {
        _count: {
          select: {
            rules: true,
            assignments: true,
          },
        },
      },
    });

    return {
      items: rows.map((row) => ({
        id: row.id,
        code: row.code,
        name: row.name,
        priority: row.priority,
        active: row.active,
        ruleCount: row._count.rules,
        assignmentCount: row._count.assignments,
        updatedAt: row.updatedAt.toISOString(),
      })),
    };
  }

  async getCone(coneId: string): Promise<VisibilityConeDetailResponse> {
    this.assertUuid(coneId, 'coneId');

    const row = await this.prisma.visibilityCone.findUnique({
      where: { id: coneId },
      include: {
        _count: {
          select: {
            rules: true,
            assignments: true,
          },
        },
      },
    });

    if (!row) {
      throw new NotFoundException(`Visibility cone ${coneId} not found`);
    }

    return {
      cone: {
        id: row.id,
        code: row.code,
        name: row.name,
        priority: row.priority,
        active: row.active,
      },
      ruleCount: row._count.rules,
      assignmentCount: row._count.assignments,
    };
  }

  async createCone(payload: { cone: unknown }): Promise<VisibilityConeDetailResponse> {
    const cone = this.normalizeCone(undefined, payload.cone);

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.visibilityCone.create({
          data: {
            id: randomUUID(),
            code: cone.code,
            name: cone.name,
            priority: cone.priority,
            active: cone.active,
          },
        });

        await this.bumpPolicyVersionAndClearCache(tx);
      });
    } catch (error) {
      this.rethrowUniqueConflict(error, `Visibility cone code ${cone.code} already exists`);
    }

    const created = await this.prisma.visibilityCone.findFirst({
      where: { code: cone.code },
      orderBy: { updatedAt: 'desc' },
    });

    if (!created) {
      throw new NotFoundException(`Visibility cone ${cone.code} not found after creation`);
    }

    return this.getCone(created.id);
  }

  async updateCone(coneId: string, payload: { cone: unknown }): Promise<VisibilityConeDetailResponse> {
    this.assertUuid(coneId, 'coneId');
    const cone = this.normalizeCone(coneId, payload.cone);

    await this.ensureConeExists(coneId);

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.visibilityCone.update({
          where: { id: coneId },
          data: {
            code: cone.code,
            name: cone.name,
            priority: cone.priority,
            active: cone.active,
          },
        });

        await this.bumpPolicyVersionAndClearCache(tx);
      });
    } catch (error) {
      this.rethrowUniqueConflict(error, `Visibility cone code ${cone.code} already exists`);
    }

    return this.getCone(coneId);
  }

  async deleteCone(coneId: string): Promise<void> {
    this.assertUuid(coneId, 'coneId');
    await this.ensureConeExists(coneId);

    await this.prisma.$transaction(async (tx) => {
      await tx.visibilityCone.delete({ where: { id: coneId } });
      await this.bumpPolicyVersionAndClearCache(tx);
    });
  }

  async listRules(): Promise<{ items: VisibilityRuleSummaryResponse[] }> {
    const rows = await this.prisma.visibilityRule.findMany({
      orderBy: [{ objectApiName: 'asc' }, { updatedAt: 'desc' }],
      include: {
        cone: true,
      },
    });

    return {
      items: rows.map((row) => ({
        id: row.id,
        coneId: row.coneId,
        coneCode: row.cone.code,
        objectApiName: row.objectApiName,
        effect: row.effect,
        active: row.active,
        fieldsAllowedCount: Array.isArray(row.fieldsAllowed) ? row.fieldsAllowed.length : 0,
        fieldsDeniedCount: Array.isArray(row.fieldsDenied) ? row.fieldsDenied.length : 0,
        updatedAt: row.updatedAt.toISOString(),
      })),
    };
  }

  async getRule(ruleId: string): Promise<VisibilityRuleDetailResponse> {
    this.assertUuid(ruleId, 'ruleId');

    const row = await this.prisma.visibilityRule.findUnique({
      where: { id: ruleId },
    });

    if (!row) {
      throw new NotFoundException(`Visibility rule ${ruleId} not found`);
    }

    return {
      rule: this.mapRuleRow(row),
    };
  }

  async createRule(payload: { rule: unknown }): Promise<VisibilityRuleDetailResponse> {
    const rule = await this.normalizeRule(undefined, payload.rule);

    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.visibilityRule.create({
        data: {
          coneId: rule.coneId,
          objectApiName: rule.objectApiName,
          effect: rule.effect,
          conditionJson: rule.condition as unknown as Prisma.InputJsonValue,
          fieldsAllowed:
            rule.fieldsAllowed && rule.fieldsAllowed.length > 0
              ? (rule.fieldsAllowed as unknown as Prisma.InputJsonValue)
              : Prisma.JsonNull,
          fieldsDenied:
            rule.fieldsDenied && rule.fieldsDenied.length > 0
              ? (rule.fieldsDenied as unknown as Prisma.InputJsonValue)
              : Prisma.JsonNull,
          active: rule.active,
        },
      });

      await this.bumpPolicyVersionAndClearCache(tx);
      return row;
    });

    return this.getRule(created.id);
  }

  async updateRule(ruleId: string, payload: { rule: unknown }): Promise<VisibilityRuleDetailResponse> {
    this.assertUuid(ruleId, 'ruleId');
    await this.ensureRuleExists(ruleId);
    const rule = await this.normalizeRule(ruleId, payload.rule);

    await this.prisma.$transaction(async (tx) => {
      await tx.visibilityRule.update({
        where: { id: ruleId },
        data: {
          coneId: rule.coneId,
          objectApiName: rule.objectApiName,
          effect: rule.effect,
          conditionJson: rule.condition as unknown as Prisma.InputJsonValue,
          fieldsAllowed:
            rule.fieldsAllowed && rule.fieldsAllowed.length > 0
              ? (rule.fieldsAllowed as unknown as Prisma.InputJsonValue)
              : Prisma.JsonNull,
          fieldsDenied:
            rule.fieldsDenied && rule.fieldsDenied.length > 0
              ? (rule.fieldsDenied as unknown as Prisma.InputJsonValue)
              : Prisma.JsonNull,
          active: rule.active,
        },
      });

      await this.bumpPolicyVersionAndClearCache(tx);
    });

    return this.getRule(ruleId);
  }

  async deleteRule(ruleId: string): Promise<void> {
    this.assertUuid(ruleId, 'ruleId');
    await this.ensureRuleExists(ruleId);

    await this.prisma.$transaction(async (tx) => {
      await tx.visibilityRule.delete({ where: { id: ruleId } });
      await this.bumpPolicyVersionAndClearCache(tx);
    });
  }

  async listAssignments(): Promise<{ items: VisibilityAssignmentSummaryResponse[] }> {
    const rows = await this.prisma.visibilityAssignment.findMany({
      orderBy: [{ updatedAt: 'desc' }],
      include: {
        cone: true,
      },
    });

    return {
      items: rows.map((row) => ({
        id: row.id,
        coneId: row.coneId,
        coneCode: row.cone.code,
        contactId: row.contactId ?? undefined,
        permissionCode: row.permissionCode ?? undefined,
        recordType: row.recordType ?? undefined,
        validFrom: row.validFrom?.toISOString(),
        validTo: row.validTo?.toISOString(),
        isCurrentlyApplicable: this.isAssignmentCurrentlyApplicable(row),
        updatedAt: row.updatedAt.toISOString(),
      })),
    };
  }

  async getAssignment(assignmentId: string): Promise<VisibilityAssignmentDetailResponse> {
    this.assertUuid(assignmentId, 'assignmentId');

    const row = await this.prisma.visibilityAssignment.findUnique({
      where: { id: assignmentId },
    });

    if (!row) {
      throw new NotFoundException(`Visibility assignment ${assignmentId} not found`);
    }

    return {
      assignment: {
        id: row.id,
        coneId: row.coneId,
        contactId: row.contactId ?? undefined,
        permissionCode: row.permissionCode ?? undefined,
        recordType: row.recordType ?? undefined,
        validFrom: row.validFrom?.toISOString(),
        validTo: row.validTo?.toISOString(),
      },
    };
  }

  async createAssignment(payload: { assignment: unknown }): Promise<VisibilityAssignmentDetailResponse> {
    const assignment = await this.normalizeAssignment(undefined, payload.assignment);

    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.visibilityAssignment.create({
        data: {
          coneId: assignment.coneId,
          contactId: assignment.contactId ?? null,
          permissionCode: assignment.permissionCode ?? null,
          recordType: assignment.recordType ?? null,
          validFrom: assignment.validFrom ? new Date(assignment.validFrom) : null,
          validTo: assignment.validTo ? new Date(assignment.validTo) : null,
        },
      });

      await this.bumpPolicyVersionAndClearCache(tx);
      return row;
    });

    return this.getAssignment(created.id);
  }

  async updateAssignment(
    assignmentId: string,
    payload: { assignment: unknown },
  ): Promise<VisibilityAssignmentDetailResponse> {
    this.assertUuid(assignmentId, 'assignmentId');
    await this.ensureAssignmentExists(assignmentId);
    const assignment = await this.normalizeAssignment(assignmentId, payload.assignment);

    await this.prisma.$transaction(async (tx) => {
      await tx.visibilityAssignment.update({
        where: { id: assignmentId },
        data: {
          coneId: assignment.coneId,
          contactId: assignment.contactId ?? null,
          permissionCode: assignment.permissionCode ?? null,
          recordType: assignment.recordType ?? null,
          validFrom: assignment.validFrom ? new Date(assignment.validFrom) : null,
          validTo: assignment.validTo ? new Date(assignment.validTo) : null,
        },
      });

      await this.bumpPolicyVersionAndClearCache(tx);
    });

    return this.getAssignment(assignmentId);
  }

  async deleteAssignment(assignmentId: string): Promise<void> {
    this.assertUuid(assignmentId, 'assignmentId');
    await this.ensureAssignmentExists(assignmentId);

    await this.prisma.$transaction(async (tx) => {
      await tx.visibilityAssignment.delete({ where: { id: assignmentId } });
      await this.bumpPolicyVersionAndClearCache(tx);
    });
  }

  async searchDebugContacts(
    query: string,
    limit: number | undefined,
  ): Promise<{ items: VisibilityDebugContactSuggestion[] }> {
    const normalizedQuery = this.requireString(query, 'q is required');
    if (normalizedQuery.length < 2) {
      throw new BadRequestException('q must be at least 2 characters');
    }

    if (normalizedQuery.length > 80) {
      throw new BadRequestException('q must be at most 80 characters');
    }

    const items = await this.salesforceService.searchContactsByIdOrName(
      normalizedQuery,
      this.normalizeDebugContactSuggestionLimit(limit),
    );

    return {
      items,
    };
  }

  async evaluateDebug(payload: {
    objectApiName: string;
    contactId: string;
    permissions: string[];
    recordType?: string;
    baseWhere?: string;
    requestedFields?: string[];
  }): Promise<VisibilityEvaluation> {
    const objectApiName = this.requireString(payload.objectApiName, 'objectApiName is required');
    const contactId = this.normalizeOptionalContactId(payload.contactId, 'contactId');
    if (!contactId) {
      throw new BadRequestException('contactId is required');
    }

    return this.visibilityService.evaluate({
      objectApiName,
      contactId,
      permissions: this.normalizePermissionsArray(payload.permissions),
      contactRecordTypeDeveloperName: this.asOptionalString(payload.recordType),
      baseWhere: this.asOptionalString(payload.baseWhere),
      requestedFields: this.normalizeRequestedFields(payload.requestedFields),
      skipCache: true,
    });
  }

  async previewDebug(payload: {
    objectApiName: string;
    contactId: string;
    permissions: string[];
    recordType?: string;
    baseWhere?: string;
    requestedFields: string[];
    limit?: number;
  }): Promise<VisibilityDebugPreviewResponse> {
    const objectApiName = this.normalizePreviewObjectApiName(
      this.requireString(payload.objectApiName, 'objectApiName is required'),
      'objectApiName',
    );
    const contactId = this.normalizeOptionalContactId(payload.contactId, 'contactId');
    if (!contactId) {
      throw new BadRequestException('contactId is required');
    }

    const requestedFields = this.normalizeRequiredRequestedFields(payload.requestedFields);
    const evaluation = await this.visibilityService.evaluate({
      objectApiName,
      contactId,
      permissions: this.normalizePermissionsArray(payload.permissions),
      contactRecordTypeDeveloperName: this.asOptionalString(payload.recordType),
      baseWhere: this.asOptionalString(payload.baseWhere),
      requestedFields,
      skipCache: true,
    });
    const selectedFields = this.visibilityService.applyFieldVisibility(requestedFields, evaluation);

    if (evaluation.decision === 'DENY') {
      return this.buildPreviewSkippedResponse(evaluation, selectedFields, 'VISIBILITY_DENY');
    }

    if (selectedFields.length === 0) {
      return this.buildPreviewSkippedResponse(evaluation, selectedFields, 'NO_VISIBLE_FIELDS');
    }

    const limit = this.normalizePreviewLimit(payload.limit);
    const soql = this.buildPreviewSoql(objectApiName, selectedFields, evaluation.finalWhere, limit);
    const startedAt = Date.now();
    const rawResult = await this.salesforceService.executeReadOnlyQuery(soql);
    const records = this.extractPreviewRecords(rawResult, selectedFields);
    const rowCount = records.length;
    const visibility = {
      ...evaluation,
      rowCount,
    };

    await this.visibilityService.recordAudit({
      evaluation: visibility,
      queryKind: 'VISIBILITY_DEBUG_PREVIEW',
      baseWhere: evaluation.baseWhere,
      finalWhere: evaluation.finalWhere,
      rowCount,
      durationMs: Date.now() - startedAt,
    });

    return {
      visibility,
      selectedFields,
      soql,
      records,
      rowCount,
      executed: true,
    };
  }

  private normalizeCone(
    coneId: string | undefined,
    value: unknown,
  ): Omit<VisibilityConeDefinition, 'id'> {
    if (coneId) {
      this.assertUuid(coneId, 'coneId');
    }

    const cone = this.requireObject(value, 'cone payload must be an object');
    const code = this.requireString(cone.code, 'cone.code is required').toLowerCase();
    if (!CONE_CODE_PATTERN.test(code)) {
      throw new BadRequestException('cone.code must be lowercase kebab-case');
    }

    return {
      code,
      name: this.requireString(cone.name, 'cone.name is required'),
      priority: this.asOptionalInteger(cone.priority, 'cone.priority') ?? 0,
      active: this.asOptionalBoolean(cone.active) ?? true,
    };
  }

  private async normalizeRule(
    ruleId: string | undefined,
    value: unknown,
  ): Promise<VisibilityRuleDefinition> {
    if (ruleId) {
      this.assertUuid(ruleId, 'ruleId');
    }

    const rule = this.requireObject(value, 'rule payload must be an object');
    const coneId = this.requireString(rule.coneId, 'rule.coneId is required');
    this.assertUuid(coneId, 'rule.coneId');
    await this.ensureConeExists(coneId);

    const effect = this.normalizeRuleEffect(rule.effect);
    const condition = normalizeVisibilityRuleNode(rule.condition);
    compileVisibilityRuleNode(condition);

    return {
      id: ruleId ?? randomUUID(),
      coneId,
      objectApiName: this.requireString(rule.objectApiName, 'rule.objectApiName is required'),
      effect,
      condition,
      fieldsAllowed: normalizeVisibilityFieldList(rule.fieldsAllowed, 'rule.fieldsAllowed'),
      fieldsDenied: normalizeVisibilityFieldList(rule.fieldsDenied, 'rule.fieldsDenied'),
      active: this.asOptionalBoolean(rule.active) ?? true,
    };
  }

  private async normalizeAssignment(
    assignmentId: string | undefined,
    value: unknown,
  ): Promise<VisibilityAssignmentDefinition> {
    if (assignmentId) {
      this.assertUuid(assignmentId, 'assignmentId');
    }

    const assignment = this.requireObject(value, 'assignment payload must be an object');
    const coneId = this.requireString(assignment.coneId, 'assignment.coneId is required');
    this.assertUuid(coneId, 'assignment.coneId');
    await this.ensureConeExists(coneId);

    const contactId = this.normalizeOptionalContactId(assignment.contactId, 'assignment.contactId');
    const permissionCode = this.normalizeOptionalPermissionCode(
      assignment.permissionCode,
      'assignment.permissionCode',
    );
    if (permissionCode) {
      const permission = await this.prisma.aclPermissionRecord.findUnique({
        where: { code: permissionCode }
      });

      if (!permission) {
        throw new BadRequestException(`assignment.permissionCode ${permissionCode} is not defined in ACL`);
      }
    }
    const recordType = this.asOptionalString(assignment.recordType);
    const validFrom = this.normalizeOptionalDateString(assignment.validFrom, 'assignment.validFrom');
    const validTo = this.normalizeOptionalDateString(assignment.validTo, 'assignment.validTo');

    if (!contactId && !permissionCode && !recordType) {
      throw new BadRequestException(
        'assignment must define at least one selector among contactId, permissionCode, recordType',
      );
    }

    if (validFrom && validTo && new Date(validFrom).getTime() > new Date(validTo).getTime()) {
      throw new BadRequestException('assignment.validFrom must be <= assignment.validTo');
    }

    return {
      id: assignmentId ?? randomUUID(),
      coneId,
      contactId,
      permissionCode,
      recordType,
      validFrom,
      validTo,
    };
  }

  private async bumpPolicyVersionAndClearCache(tx: PrismaTransaction): Promise<void> {
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

    await tx.visibilityUserScopeCache.deleteMany({});
  }

  private async ensureConeExists(coneId: string): Promise<void> {
    const exists = await this.prisma.visibilityCone.findUnique({
      where: { id: coneId },
      select: { id: true },
    });

    if (!exists) {
      throw new NotFoundException(`Visibility cone ${coneId} not found`);
    }
  }

  private async ensureRuleExists(ruleId: string): Promise<void> {
    const exists = await this.prisma.visibilityRule.findUnique({
      where: { id: ruleId },
      select: { id: true },
    });

    if (!exists) {
      throw new NotFoundException(`Visibility rule ${ruleId} not found`);
    }
  }

  private async ensureAssignmentExists(assignmentId: string): Promise<void> {
    const exists = await this.prisma.visibilityAssignment.findUnique({
      where: { id: assignmentId },
      select: { id: true },
    });

    if (!exists) {
      throw new NotFoundException(`Visibility assignment ${assignmentId} not found`);
    }
  }

  private mapRuleRow(
    row: Prisma.VisibilityRuleGetPayload<object>,
  ): VisibilityRuleDefinition {
    return {
      id: row.id,
      coneId: row.coneId,
      objectApiName: row.objectApiName,
      effect: row.effect,
      condition: normalizeVisibilityRuleNode(row.conditionJson),
      fieldsAllowed: Array.isArray(row.fieldsAllowed)
        ? normalizeVisibilityFieldList(row.fieldsAllowed, 'rule.fieldsAllowed')
        : undefined,
      fieldsDenied: Array.isArray(row.fieldsDenied)
        ? normalizeVisibilityFieldList(row.fieldsDenied, 'rule.fieldsDenied')
        : undefined,
      active: row.active,
    };
  }

  private isAssignmentCurrentlyApplicable(
    row: Prisma.VisibilityAssignmentGetPayload<object>,
  ): boolean {
    const nowMs = Date.now();
    if (row.validFrom && row.validFrom.getTime() > nowMs) {
      return false;
    }

    if (row.validTo && row.validTo.getTime() < nowMs) {
      return false;
    }

    return true;
  }

  private normalizeRuleEffect(value: unknown): VisibilityRuleEffect {
    if (typeof value !== 'string') {
      throw new BadRequestException('rule.effect is required');
    }

    const normalized = value.trim().toUpperCase();
    if (normalized !== VisibilityRuleEffect.ALLOW && normalized !== VisibilityRuleEffect.DENY) {
      throw new BadRequestException('rule.effect must be ALLOW or DENY');
    }

    return normalized as VisibilityRuleEffect;
  }

  private normalizeOptionalPermissionCode(value: unknown, fieldName: string): string | undefined {
    const normalized = this.asOptionalString(value)?.trim().toUpperCase();
    if (!normalized) {
      return undefined;
    }

    return normalized;
  }

  private normalizeOptionalContactId(value: unknown, fieldName: string): string | undefined {
    const normalized = this.asOptionalString(value);
    if (!normalized) {
      return undefined;
    }

    if (!SALESFORCE_ID_PATTERN.test(normalized)) {
      throw new BadRequestException(`${fieldName} must be a valid Salesforce id`);
    }

    return normalized;
  }

  private normalizeOptionalDateString(value: unknown, fieldName: string): string | undefined {
    const normalized = this.asOptionalString(value);
    if (!normalized) {
      return undefined;
    }

    const parsed = new Date(normalized);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`${fieldName} must be a valid date-time string`);
    }

    return parsed.toISOString();
  }

  private normalizePermissionsArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
      throw new BadRequestException('permissions must be an array');
    }

    return value
      .map((entry, index) => {
        if (typeof entry !== 'string') {
          throw new BadRequestException(`permissions[${index}] must be a string`);
        }

        const normalized = entry.trim().toUpperCase();
        if (!normalized) {
          throw new BadRequestException(`permissions[${index}] must be non-empty`);
        }

        return normalized;
      })
      .filter((entry, index, source) => source.indexOf(entry) === index);
  }

  private normalizeRequestedFields(value: unknown): string[] | undefined {
    if (value === undefined || value === null) {
      return undefined;
    }

    if (!Array.isArray(value)) {
      throw new BadRequestException('requestedFields must be an array');
    }

    return value.map((entry, index) => {
      if (typeof entry !== 'string') {
        throw new BadRequestException(`requestedFields[${index}] must be a string`);
      }

      const normalized = entry.trim();
      if (!normalized) {
        throw new BadRequestException(`requestedFields[${index}] must be non-empty`);
      }

      return normalized;
    });
  }

  private normalizeRequiredRequestedFields(value: unknown): string[] {
    const requestedFields = this.normalizeRequestedFields(value);
    if (!requestedFields || requestedFields.length === 0) {
      throw new BadRequestException('requestedFields must be a non-empty array');
    }

    return requestedFields
      .map((fieldName, index) => {
        if (!SALESFORCE_FIELD_PATH_PATTERN.test(fieldName)) {
          throw new BadRequestException(
            `requestedFields[${index}] must be a valid Salesforce field path`,
          );
        }

        return fieldName;
      })
      .filter((fieldName, index, source) => source.indexOf(fieldName) === index);
  }

  private normalizeDebugContactSuggestionLimit(value: unknown): number {
    if (value === undefined || value === null) {
      return 8;
    }

    if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 8) {
      throw new BadRequestException('limit must be an integer between 1 and 8');
    }

    return value;
  }

  private normalizePreviewLimit(value: unknown): number {
    if (value === undefined || value === null) {
      return 10;
    }

    if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 25) {
      throw new BadRequestException('limit must be an integer between 1 and 25');
    }

    return value;
  }

  private normalizePreviewObjectApiName(value: string, fieldName: string): string {
    if (!SALESFORCE_OBJECT_API_NAME_PATTERN.test(value)) {
      throw new BadRequestException(`${fieldName} must be a valid Salesforce object API name`);
    }

    return value;
  }

  private requireObject(value: unknown, message: string): Record<string, unknown> {
    if (!value || Array.isArray(value) || typeof value !== 'object') {
      throw new BadRequestException(message);
    }

    return value as Record<string, unknown>;
  }

  private requireString(value: unknown, message: string): string {
    if (typeof value !== 'string') {
      throw new BadRequestException(message);
    }

    const normalized = value.trim();
    if (!normalized) {
      throw new BadRequestException(message);
    }

    return normalized;
  }

  private asOptionalString(value: unknown): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }

    const normalized = value.trim();
    return normalized ? normalized : undefined;
  }

  private asOptionalBoolean(value: unknown): boolean | undefined {
    return typeof value === 'boolean' ? value : undefined;
  }

  private asOptionalInteger(value: unknown, fieldName: string): number | undefined {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }

    if (typeof value !== 'number' || !Number.isInteger(value)) {
      throw new BadRequestException(`${fieldName} must be an integer`);
    }

    return value;
  }

  private async buildPreviewSkippedResponse(
    evaluation: VisibilityEvaluation,
    selectedFields: string[],
    reason: VisibilityDebugPreviewSkipReason,
  ): Promise<VisibilityDebugPreviewResponse> {
    const visibility = {
      ...evaluation,
      rowCount: 0,
    };

    await this.visibilityService.recordAudit({
      evaluation: visibility,
      queryKind: 'VISIBILITY_DEBUG_PREVIEW',
      baseWhere: evaluation.baseWhere,
      finalWhere: evaluation.finalWhere,
      rowCount: 0,
      durationMs: 0,
    });

    return {
      visibility,
      selectedFields,
      records: [],
      rowCount: 0,
      executed: false,
      executionSkippedReason: reason,
    };
  }

  private buildPreviewSoql(
    objectApiName: string,
    selectedFields: string[],
    finalWhere: string | undefined,
    limit: number,
  ): string {
    const whereClause = finalWhere?.trim() ? ` WHERE ${finalWhere.trim()}` : '';
    return `SELECT ${selectedFields.join(', ')} FROM ${objectApiName}${whereClause} ORDER BY Id ASC LIMIT ${limit}`;
  }

  private extractPreviewRecords(
    result: unknown,
    selectedFields: string[],
  ): Array<Record<string, VisibilityDebugPreviewScalar>> {
    if (!this.isObjectRecord(result) || !Array.isArray(result.records)) {
      return [];
    }

    return result.records
      .filter((record): record is Record<string, unknown> => this.isObjectRecord(record))
      .map((record) => {
        const flattened: Record<string, VisibilityDebugPreviewScalar> = {};

        for (const fieldName of selectedFields) {
          flattened[fieldName] = this.normalizePreviewScalar(
            this.resolvePreviewRecordValue(record, fieldName),
          );
        }

        return flattened;
      });
  }

  private resolvePreviewRecordValue(record: Record<string, unknown>, fieldPath: string): unknown {
    const segments = fieldPath
      .split('.')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
    let current: unknown = record;

    for (const segment of segments) {
      if (!this.isObjectRecord(current)) {
        return undefined;
      }

      current = current[segment];
    }

    return current;
  }

  private normalizePreviewScalar(value: unknown): VisibilityDebugPreviewScalar {
    if (value === undefined || value === null) {
      return null;
    }

    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      return value;
    }

    if (typeof value === 'bigint') {
      return String(value);
    }

    return null;
  }

  private isObjectRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private assertUuid(value: string, fieldName: string): void {
    if (!UUID_PATTERN.test(value)) {
      throw new BadRequestException(`${fieldName} must be a valid UUID`);
    }
  }

  private rethrowUniqueConflict(error: unknown, message: string): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException(message);
    }

    throw error;
  }
}
