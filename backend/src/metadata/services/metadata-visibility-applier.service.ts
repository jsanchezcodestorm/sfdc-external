import { randomUUID } from 'node:crypto';

import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, VisibilityRuleEffect } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { VisibilityAdminService } from '../../visibility/visibility-admin.service';
import type { DeployableMetadataTypeName } from '../metadata.types';
import { asRecord, normalizeEmail, requireString } from './metadata-common';
import type { ParsedPackageEntry } from './metadata-package-codec.service';
import { MetadataResolutionService } from './metadata-resolution.service';

@Injectable()
export class MetadataVisibilityApplierService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly visibilityAdminService: VisibilityAdminService,
    private readonly resolution: MetadataResolutionService,
  ) {}

  async applyVisibilityEntries(
    entries: ParsedPackageEntry[],
    appliedCounts: Map<DeployableMetadataTypeName, number>,
  ): Promise<void> {
    if (entries.length === 0) {
      return;
    }

    const coneEntries = entries.filter((entry) => entry.typeName === 'VisibilityCone');
    const ruleEntries = entries.filter((entry) => entry.typeName === 'VisibilityRule');
    const assignmentEntries = entries.filter((entry) => entry.typeName === 'VisibilityAssignment');
    const coneIdByCode = new Map<string, string>();
    const affectedConeIds = new Set<string>();
    const affectedObjectApiNames = new Set<string>();
    const context = this.resolution.createContext();

    for (const entry of coneEntries) {
      const cone = this.visibilityAdminService.normalizeConeForPersistence(entry.parsedData);
      if (cone.code !== entry.member) {
        throw new BadRequestException(`${entry.path} cone.code must match file name`);
      }

      const existing = await this.prisma.visibilityCone.findUnique({
        where: { code: cone.code },
        select: { id: true },
      });
      const row = await this.prisma.visibilityCone.upsert({
        where: { code: cone.code },
        create: {
          id: existing?.id ?? randomUUID(),
          code: cone.code,
          name: cone.name,
          priority: cone.priority,
          active: cone.active,
        },
        update: {
          code: cone.code,
          name: cone.name,
          priority: cone.priority,
          active: cone.active,
        },
      });

      coneIdByCode.set(cone.code, row.id);
      affectedConeIds.add(row.id);
    }

    for (const entry of ruleEntries) {
      const coneCode = requireString(entry.parsedData?.coneCode, `${entry.path} coneCode is required`);
      const coneId = await this.resolution.resolveConeIdByCode(coneCode, coneIdByCode);
      const payload: Record<string, unknown> = {
        ...entry.parsedData,
        id: entry.member,
        coneId,
      };
      delete payload.coneCode;

      const normalizedRule = await this.visibilityAdminService.normalizeRuleForPersistence(payload);
      const existing = await this.prisma.visibilityRule.findUnique({
        where: { id: normalizedRule.id },
        select: {
          objectApiName: true,
          coneId: true,
        },
      });

      await this.prisma.visibilityRule.upsert({
        where: { id: normalizedRule.id },
        create: {
          id: normalizedRule.id,
          coneId: normalizedRule.coneId,
          objectApiName: normalizedRule.objectApiName,
          description: normalizedRule.description ?? null,
          effect: normalizedRule.effect as VisibilityRuleEffect,
          conditionJson: normalizedRule.condition as unknown as Prisma.InputJsonValue,
          fieldsAllowed: normalizedRule.fieldsAllowed?.length
            ? (normalizedRule.fieldsAllowed as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull,
          fieldsDenied: normalizedRule.fieldsDenied?.length
            ? (normalizedRule.fieldsDenied as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull,
          active: normalizedRule.active,
        },
        update: {
          coneId: normalizedRule.coneId,
          objectApiName: normalizedRule.objectApiName,
          description: normalizedRule.description ?? null,
          effect: normalizedRule.effect as VisibilityRuleEffect,
          conditionJson: normalizedRule.condition as unknown as Prisma.InputJsonValue,
          fieldsAllowed: normalizedRule.fieldsAllowed?.length
            ? (normalizedRule.fieldsAllowed as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull,
          fieldsDenied: normalizedRule.fieldsDenied?.length
            ? (normalizedRule.fieldsDenied as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull,
          active: normalizedRule.active,
        },
      });

      affectedConeIds.add(normalizedRule.coneId);
      if (existing?.coneId) {
        affectedConeIds.add(existing.coneId);
      }
      affectedObjectApiNames.add(normalizedRule.objectApiName);
      if (existing?.objectApiName) {
        affectedObjectApiNames.add(existing.objectApiName);
      }
    }

    for (const entry of assignmentEntries) {
      const coneCode = requireString(entry.parsedData?.coneCode, `${entry.path} coneCode is required`);
      const coneId = await this.resolution.resolveConeIdByCode(coneCode, coneIdByCode);
      const contactRef = asRecord(entry.parsedData?.contactRef);
      const targetContact = contactRef
        ? await this.resolution.resolveTargetContactByEmail(
            normalizeEmail(contactRef.email, `${entry.path} contactRef.email`),
            'blocker',
            [],
            [],
            context,
          )
        : null;

      const payload: Record<string, unknown> = {
        ...entry.parsedData,
        id: entry.member,
        coneId,
        contactId: targetContact?.id,
      };
      delete payload.coneCode;
      delete payload.contactRef;

      const normalizedAssignment = await this.visibilityAdminService.normalizeAssignmentForPersistence(
        payload,
      );
      const existing = await this.prisma.visibilityAssignment.findUnique({
        where: { id: normalizedAssignment.id },
        select: { coneId: true },
      });

      await this.prisma.visibilityAssignment.upsert({
        where: { id: normalizedAssignment.id },
        create: {
          id: normalizedAssignment.id,
          coneId: normalizedAssignment.coneId,
          contactId: normalizedAssignment.contactId ?? null,
          permissionCode: normalizedAssignment.permissionCode ?? null,
          recordType: normalizedAssignment.recordType ?? null,
          validFrom: normalizedAssignment.validFrom ? new Date(normalizedAssignment.validFrom) : null,
          validTo: normalizedAssignment.validTo ? new Date(normalizedAssignment.validTo) : null,
        },
        update: {
          coneId: normalizedAssignment.coneId,
          contactId: normalizedAssignment.contactId ?? null,
          permissionCode: normalizedAssignment.permissionCode ?? null,
          recordType: normalizedAssignment.recordType ?? null,
          validFrom: normalizedAssignment.validFrom ? new Date(normalizedAssignment.validFrom) : null,
          validTo: normalizedAssignment.validTo ? new Date(normalizedAssignment.validTo) : null,
        },
      });

      affectedConeIds.add(normalizedAssignment.coneId);
      if (existing?.coneId) {
        affectedConeIds.add(existing.coneId);
      }
    }

    if (affectedConeIds.size > 0) {
      const rows = await this.prisma.visibilityRule.findMany({
        where: {
          coneId: {
            in: [...affectedConeIds],
          },
        },
        select: {
          objectApiName: true,
        },
        distinct: ['objectApiName'],
      });
      for (const row of rows) {
        affectedObjectApiNames.add(row.objectApiName);
      }
    }

    await this.visibilityAdminService.invalidatePolicyForMetadata([...affectedObjectApiNames]);

    if (coneEntries.length > 0) {
      appliedCounts.set('VisibilityCone', coneEntries.length);
    }
    if (ruleEntries.length > 0) {
      appliedCounts.set('VisibilityRule', ruleEntries.length);
    }
    if (assignmentEntries.length > 0) {
      appliedCounts.set('VisibilityAssignment', assignmentEntries.length);
    }
  }
}
