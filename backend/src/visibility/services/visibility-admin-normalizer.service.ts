import { randomUUID } from 'node:crypto';

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, VisibilityRuleEffect } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import {
  compileVisibilityRuleNode,
  normalizeVisibilityFieldList,
  normalizeVisibilityRuleNode,
} from '../visibility-rule-dsl';
import type {
  VisibilityAssignmentDefinition,
  VisibilityConeDefinition,
  VisibilityRuleDefinition,
} from '../visibility.types';
import { VisibilityAdminInputNormalizerService } from './visibility-admin-input-normalizer.service';

const CONE_CODE_PATTERN = /^[a-z0-9-]+$/;

@Injectable()
export class VisibilityAdminNormalizerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inputNormalizer: VisibilityAdminInputNormalizerService = new VisibilityAdminInputNormalizerService(),
  ) {}

  normalizeCone(
    coneId: string | undefined,
    value: unknown,
  ): Omit<VisibilityConeDefinition, 'id'> {
    if (coneId) {
      this.inputNormalizer.assertUuid(coneId, 'coneId');
    }

    const cone = this.requireObject(value, 'cone payload must be an object');
    const code = this.inputNormalizer.requireString(cone.code, 'cone.code is required').toLowerCase();
    if (!CONE_CODE_PATTERN.test(code)) {
      throw new BadRequestException('cone.code must be lowercase kebab-case');
    }

    return {
      code,
      name: this.inputNormalizer.requireString(cone.name, 'cone.name is required'),
      priority: this.asOptionalInteger(cone.priority, 'cone.priority') ?? 0,
      active: this.asOptionalBoolean(cone.active) ?? true,
    };
  }

  async normalizeRule(
    ruleId: string | undefined,
    value: unknown,
  ): Promise<VisibilityRuleDefinition> {
    const rule = this.requireObject(value, 'rule payload must be an object');
    const persistedRuleId = this.resolvePersistedUuid(ruleId, rule.id, 'rule.id');
    const coneId = this.inputNormalizer.requireString(rule.coneId, 'rule.coneId is required');
    this.inputNormalizer.assertUuid(coneId, 'rule.coneId');
    await this.ensureConeExists(coneId);

    const effect = this.normalizeRuleEffect(rule.effect);
    const condition = normalizeVisibilityRuleNode(rule.condition);
    compileVisibilityRuleNode(condition);

    return {
      id: persistedRuleId,
      coneId,
      objectApiName: this.inputNormalizer.requireString(rule.objectApiName, 'rule.objectApiName is required'),
      description: this.inputNormalizer.asOptionalString(rule.description),
      effect,
      condition,
      fieldsAllowed: normalizeVisibilityFieldList(rule.fieldsAllowed, 'rule.fieldsAllowed'),
      fieldsDenied: normalizeVisibilityFieldList(rule.fieldsDenied, 'rule.fieldsDenied'),
      active: this.asOptionalBoolean(rule.active) ?? true,
    };
  }

  async normalizeAssignment(
    assignmentId: string | undefined,
    value: unknown,
  ): Promise<VisibilityAssignmentDefinition> {
    const assignment = this.requireObject(value, 'assignment payload must be an object');
    const persistedAssignmentId = this.resolvePersistedUuid(
      assignmentId,
      assignment.id,
      'assignment.id',
    );
    const coneId = this.inputNormalizer.requireString(assignment.coneId, 'assignment.coneId is required');
    this.inputNormalizer.assertUuid(coneId, 'assignment.coneId');
    await this.ensureConeExists(coneId);

    const contactId = this.inputNormalizer.normalizeOptionalContactId(
      assignment.contactId,
      'assignment.contactId',
    );
    const permissionCode = this.normalizeOptionalPermissionCode(assignment.permissionCode);
    if (permissionCode) {
      const permission = await this.prisma.aclPermissionRecord.findUnique({
        where: { code: permissionCode },
      });

      if (!permission) {
        throw new BadRequestException(`assignment.permissionCode ${permissionCode} is not defined in ACL`);
      }
    }
    const recordType = this.inputNormalizer.asOptionalString(assignment.recordType);
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
      id: persistedAssignmentId,
      coneId,
      contactId,
      permissionCode,
      recordType,
      validFrom,
      validTo,
    };
  }

  mapRuleRow(row: Prisma.VisibilityRuleGetPayload<object>): VisibilityRuleDefinition {
    return {
      id: row.id,
      coneId: row.coneId,
      objectApiName: row.objectApiName,
      description: row.description ?? undefined,
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

  isAssignmentCurrentlyApplicable(row: Prisma.VisibilityAssignmentGetPayload<object>): boolean {
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

  private normalizeOptionalPermissionCode(value: unknown): string | undefined {
    const normalized = this.inputNormalizer.asOptionalString(value)?.trim().toUpperCase();
    if (!normalized) {
      return undefined;
    }

    return normalized;
  }

  private normalizeOptionalDateString(value: unknown, fieldName: string): string | undefined {
    const normalized = this.inputNormalizer.asOptionalString(value);
    if (!normalized) {
      return undefined;
    }

    const parsed = new Date(normalized);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`${fieldName} must be a valid date-time string`);
    }

    return parsed.toISOString();
  }

  private requireObject(value: unknown, message: string): Record<string, unknown> {
    if (!value || Array.isArray(value) || typeof value !== 'object') {
      throw new BadRequestException(message);
    }

    return value as Record<string, unknown>;
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

  private resolvePersistedUuid(
    routeId: string | undefined,
    value: unknown,
    fieldName: string,
  ): string {
    const normalizedRouteId = this.inputNormalizer.asOptionalString(routeId);
    if (normalizedRouteId) {
      this.inputNormalizer.assertUuid(
        normalizedRouteId,
        fieldName === 'rule.id' ? 'ruleId' : 'assignmentId',
      );
    }

    const normalizedValue = this.inputNormalizer.asOptionalString(value);
    if (normalizedValue) {
      this.inputNormalizer.assertUuid(normalizedValue, fieldName);
    }

    if (normalizedRouteId && normalizedValue && normalizedRouteId !== normalizedValue) {
      throw new BadRequestException(`${fieldName} must match route id`);
    }

    return normalizedRouteId ?? normalizedValue ?? randomUUID();
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
}
