import { randomUUID } from 'node:crypto';

import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, VisibilityRuleEffect } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { SalesforceService } from '../salesforce/salesforce.service';

import type { VisibilityRuleNode } from './visibility-rule-dsl';
import { VisibilityAdminDebugPreviewService } from './services/visibility-admin-debug-preview.service';
import { VisibilityAdminInputNormalizerService } from './services/visibility-admin-input-normalizer.service';
import { VisibilityAdminNormalizerService } from './services/visibility-admin-normalizer.service';
import { VisibilityAdminPolicyCacheService } from './services/visibility-admin-policy-cache.service';
import type {
  VisibilityAssignmentDetailResponse,
  VisibilityAssignmentSummaryResponse,
  VisibilityConeDetailResponse,
  VisibilityConeSummaryResponse,
  VisibilityDebugContactSuggestion,
  VisibilityDebugPreviewResponse,
  VisibilityRuleDetailResponse,
  VisibilityRuleSummaryResponse,
} from './visibility-admin.types';
import { VisibilityService } from './visibility.service';
import type {
  VisibilityAssignmentDefinition,
  VisibilityConeDefinition,
  VisibilityEvaluation,
  VisibilityRuleDefinition,
} from './visibility.types';

type PrismaTransaction = Prisma.TransactionClient;
export type {
  VisibilityAssignmentDetailResponse,
  VisibilityAssignmentSummaryResponse,
  VisibilityConeDetailResponse,
  VisibilityConeSummaryResponse,
  VisibilityDebugContactSuggestion,
  VisibilityDebugPreviewResponse,
  VisibilityRuleDetailResponse,
  VisibilityRuleSummaryResponse,
} from './visibility-admin.types';

@Injectable()
export class VisibilityAdminRuntimeService {
  private readonly inputNormalizer: VisibilityAdminInputNormalizerService;
  private readonly normalizer: VisibilityAdminNormalizerService;
  private readonly policyCache: VisibilityAdminPolicyCacheService;
  private readonly debugPreviewService: VisibilityAdminDebugPreviewService;

  constructor(
    private readonly prisma: PrismaService,
    visibilityService: VisibilityService,
    salesforceService: SalesforceService,
    inputNormalizer?: VisibilityAdminInputNormalizerService,
    normalizer?: VisibilityAdminNormalizerService,
    policyCache?: VisibilityAdminPolicyCacheService,
    debugPreviewService?: VisibilityAdminDebugPreviewService,
  ) {
    this.inputNormalizer = inputNormalizer ?? new VisibilityAdminInputNormalizerService();
    this.normalizer =
      normalizer ?? new VisibilityAdminNormalizerService(prisma, this.inputNormalizer);
    this.policyCache = policyCache ?? new VisibilityAdminPolicyCacheService();
    this.debugPreviewService =
      debugPreviewService ??
      new VisibilityAdminDebugPreviewService(
        visibilityService,
        salesforceService,
        this.inputNormalizer,
      );
  }

  async ensureEntityBootstrapPolicy(params: {
    entityId: string;
    objectApiName: string;
  }): Promise<{ coneCreated: boolean; ruleCreated: boolean }> {
    const entityId = this.inputNormalizer.requireString(params.entityId, 'entityId is required');
    const objectApiName = this.inputNormalizer.normalizePreviewObjectApiName(
      this.inputNormalizer.requireString(params.objectApiName, 'objectApiName is required'),
      'objectApiName',
    );
    const coneCode = `entity-${entityId}-bootstrap`;
    const coneName = `Entity ${entityId} bootstrap`;
    const ruleDescription = `Auto bootstrap visibility ALLOW rule for entity ${entityId}`;
    const condition: VisibilityRuleNode = {
      field: 'Id',
      op: '!=',
      value: null,
    };

    return this.prisma.$transaction(async (tx) => {
      let coneCreated = false;
      let ruleCreated = false;

      let cone = await tx.visibilityCone.findUnique({
        where: { code: coneCode },
        select: { id: true },
      });

      if (!cone) {
        cone = await tx.visibilityCone.create({
          data: {
            id: randomUUID(),
            code: coneCode,
            name: coneName,
            priority: 0,
            active: true,
          },
          select: { id: true },
        });
        coneCreated = true;
      }

      const existingRule = await tx.visibilityRule.findFirst({
        where: {
          coneId: cone.id,
          objectApiName,
          effect: VisibilityRuleEffect.ALLOW,
          description: ruleDescription,
        },
        select: { id: true },
      });

      if (!existingRule) {
        await tx.visibilityRule.create({
          data: {
            coneId: cone.id,
            objectApiName,
            description: ruleDescription,
            effect: VisibilityRuleEffect.ALLOW,
            conditionJson: condition as unknown as Prisma.InputJsonValue,
            fieldsAllowed: Prisma.JsonNull,
            fieldsDenied: Prisma.JsonNull,
            active: true,
          },
        });
        ruleCreated = true;
      }

      if (coneCreated || ruleCreated) {
        await this.bumpPolicyVersionAndInvalidateCaches(tx, [objectApiName]);
      }

      return {
        coneCreated,
        ruleCreated,
      };
    });
  }

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
    this.inputNormalizer.assertUuid(coneId, 'coneId');

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
    const cone = this.normalizer.normalizeCone(undefined, payload.cone);

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

        await this.bumpPolicyVersionAndInvalidateCaches(tx, []);
      });
    } catch (error) {
      this.inputNormalizer.rethrowUniqueConflict(error, `Visibility cone code ${cone.code} already exists`);
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
    this.inputNormalizer.assertUuid(coneId, 'coneId');
    const cone = this.normalizer.normalizeCone(coneId, payload.cone);

    await this.ensureConeExists(coneId);

    try {
      await this.prisma.$transaction(async (tx) => {
        const affectedObjects = await this.policyCache.listObjectApiNamesForCone(tx, coneId);
        await tx.visibilityCone.update({
          where: { id: coneId },
          data: {
            code: cone.code,
            name: cone.name,
            priority: cone.priority,
            active: cone.active,
          },
        });

        await this.bumpPolicyVersionAndInvalidateCaches(tx, affectedObjects);
      });
    } catch (error) {
      this.inputNormalizer.rethrowUniqueConflict(error, `Visibility cone code ${cone.code} already exists`);
    }

    return this.getCone(coneId);
  }

  async deleteCone(coneId: string): Promise<void> {
    this.inputNormalizer.assertUuid(coneId, 'coneId');
    await this.ensureConeExists(coneId);

    await this.prisma.$transaction(async (tx) => {
      const affectedObjects = await this.policyCache.listObjectApiNamesForCone(tx, coneId);
      await tx.visibilityCone.delete({ where: { id: coneId } });
      await this.bumpPolicyVersionAndInvalidateCaches(tx, affectedObjects);
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
        description: row.description ?? undefined,
        effect: row.effect,
        active: row.active,
        fieldsAllowedCount: Array.isArray(row.fieldsAllowed) ? row.fieldsAllowed.length : 0,
        fieldsDeniedCount: Array.isArray(row.fieldsDenied) ? row.fieldsDenied.length : 0,
        updatedAt: row.updatedAt.toISOString(),
      })),
    };
  }

  async getRule(ruleId: string): Promise<VisibilityRuleDetailResponse> {
    this.inputNormalizer.assertUuid(ruleId, 'ruleId');

    const row = await this.prisma.visibilityRule.findUnique({
      where: { id: ruleId },
    });

    if (!row) {
      throw new NotFoundException(`Visibility rule ${ruleId} not found`);
    }

    return {
      rule: this.normalizer.mapRuleRow(row),
    };
  }

  async createRule(payload: { rule: unknown }): Promise<VisibilityRuleDetailResponse> {
    const rule = await this.normalizer.normalizeRule(undefined, payload.rule);

    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.visibilityRule.create({
        data: {
          coneId: rule.coneId,
          objectApiName: rule.objectApiName,
          description: rule.description ?? null,
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

      await this.bumpPolicyVersionAndInvalidateCaches(tx, [rule.objectApiName]);
      return row;
    });

    return this.getRule(created.id);
  }

  async updateRule(ruleId: string, payload: { rule: unknown }): Promise<VisibilityRuleDetailResponse> {
    this.inputNormalizer.assertUuid(ruleId, 'ruleId');
    await this.ensureRuleExists(ruleId);
    const rule = await this.normalizer.normalizeRule(ruleId, payload.rule);

    await this.prisma.$transaction(async (tx) => {
      const existingRule = await tx.visibilityRule.findUnique({
        where: { id: ruleId },
        select: { objectApiName: true },
      });
      await tx.visibilityRule.update({
        where: { id: ruleId },
        data: {
          coneId: rule.coneId,
          objectApiName: rule.objectApiName,
          description: rule.description ?? null,
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

      await this.bumpPolicyVersionAndInvalidateCaches(tx, [
        existingRule?.objectApiName,
        rule.objectApiName,
      ]);
    });

    return this.getRule(ruleId);
  }

  async deleteRule(ruleId: string): Promise<void> {
    this.inputNormalizer.assertUuid(ruleId, 'ruleId');
    await this.ensureRuleExists(ruleId);

    await this.prisma.$transaction(async (tx) => {
      const existingRule = await tx.visibilityRule.findUnique({
        where: { id: ruleId },
        select: { objectApiName: true },
      });
      await tx.visibilityRule.delete({ where: { id: ruleId } });
      await this.bumpPolicyVersionAndInvalidateCaches(tx, [existingRule?.objectApiName]);
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
        isCurrentlyApplicable: this.normalizer.isAssignmentCurrentlyApplicable(row),
        updatedAt: row.updatedAt.toISOString(),
      })),
    };
  }

  async getAssignment(assignmentId: string): Promise<VisibilityAssignmentDetailResponse> {
    this.inputNormalizer.assertUuid(assignmentId, 'assignmentId');

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
    const assignment = await this.normalizer.normalizeAssignment(undefined, payload.assignment);

    const created = await this.prisma.$transaction(async (tx) => {
      const affectedObjects = await this.policyCache.listObjectApiNamesForCone(tx, assignment.coneId);
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

      await this.bumpPolicyVersionAndInvalidateCaches(tx, affectedObjects);
      return row;
    });

    return this.getAssignment(created.id);
  }

  async updateAssignment(
    assignmentId: string,
    payload: { assignment: unknown },
  ): Promise<VisibilityAssignmentDetailResponse> {
    this.inputNormalizer.assertUuid(assignmentId, 'assignmentId');
    await this.ensureAssignmentExists(assignmentId);
    const assignment = await this.normalizer.normalizeAssignment(assignmentId, payload.assignment);

    await this.prisma.$transaction(async (tx) => {
      const existingAssignment = await tx.visibilityAssignment.findUnique({
        where: { id: assignmentId },
        select: { coneId: true },
      });
      const affectedObjects = this.policyCache.mergeObjectApiNames(
        await this.policyCache.listObjectApiNamesForCone(tx, existingAssignment?.coneId),
        await this.policyCache.listObjectApiNamesForCone(tx, assignment.coneId),
      );
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

      await this.bumpPolicyVersionAndInvalidateCaches(tx, affectedObjects);
    });

    return this.getAssignment(assignmentId);
  }

  async deleteAssignment(assignmentId: string): Promise<void> {
    this.inputNormalizer.assertUuid(assignmentId, 'assignmentId');
    await this.ensureAssignmentExists(assignmentId);

    await this.prisma.$transaction(async (tx) => {
      const existingAssignment = await tx.visibilityAssignment.findUnique({
        where: { id: assignmentId },
        select: { coneId: true },
      });
      const affectedObjects = await this.policyCache.listObjectApiNamesForCone(
        tx,
        existingAssignment?.coneId,
      );
      await tx.visibilityAssignment.delete({ where: { id: assignmentId } });
      await this.bumpPolicyVersionAndInvalidateCaches(tx, affectedObjects);
    });
  }

  async searchDebugContacts(
    query: string,
    limit: number | undefined,
  ): Promise<{ items: VisibilityDebugContactSuggestion[] }> {
    return this.debugPreviewService.searchDebugContacts(query, limit);
  }

  normalizeConeForPersistence(value: unknown): Omit<VisibilityConeDefinition, 'id'> {
    return this.normalizer.normalizeCone(undefined, value);
  }

  normalizeRuleForPersistence(value: unknown): Promise<VisibilityRuleDefinition> {
    return this.normalizer.normalizeRule(undefined, value);
  }

  normalizeAssignmentForPersistence(value: unknown): Promise<VisibilityAssignmentDefinition> {
    return this.normalizer.normalizeAssignment(undefined, value);
  }

  async invalidatePolicyForMetadata(affectedObjectApiNames: string[]): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.bumpPolicyVersionAndInvalidateCaches(tx, affectedObjectApiNames);
    });
  }

  async evaluateDebug(payload: {
    objectApiName: string;
    contactId: string;
    permissions: string[];
    recordType?: string;
    baseWhere?: string;
    requestedFields?: string[];
  }): Promise<VisibilityEvaluation> {
    return this.debugPreviewService.evaluateDebug(payload);
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
    return this.debugPreviewService.previewDebug(payload);
  }

  async bumpPolicyVersionAndInvalidateCaches(
    tx: PrismaTransaction,
    affectedObjectApiNames: Array<string | undefined>,
  ): Promise<void> {
    await this.policyCache.bumpPolicyVersionAndInvalidateCaches(tx, affectedObjectApiNames);
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
}
