import { BadRequestException, Injectable } from '@nestjs/common';

import { normalizeCanonicalPermissionCode } from '../../acl/acl-config.validation';
import type { AclConfigSnapshot } from '../../acl/acl.types';
import { getAuthProviderSlot } from '../../auth/auth-provider-catalog';
import { parseStoredOidcProviderConfig } from '../../auth/auth-provider-config';
import {
  normalizeLegacyEntityMetadataId,
  normalizeLegacyEntityResourceId,
} from '../../entities/entity-id-normalization';
import type { MetadataTypeName } from '../metadata.types';
import {
  asRecord,
  MANUAL_AUTH_PROVIDER_REASON,
  normalizeEmail,
  requireNestedObject,
  requireRecord,
  requireString,
  requireStringArray,
} from './metadata-common';

@Injectable()
export class MetadataEntryNormalizerService {
  normalizeEntryForComparison(
    typeName: MetadataTypeName,
    member: string,
    value: unknown,
  ): Record<string, unknown> {
    const payload = requireRecord(value, `${typeName} payload must be an object`);
    const normalizedMember = normalizeMetadataMemberForComparison(typeName, member);

    switch (typeName) {
      case 'EntityConfig': {
        const normalizedPayload = normalizeLegacyEntityConfigMetadataPayload(payload);
        const id = requireString(normalizedPayload.id, 'entity.id is required');
        if (id !== normalizedMember) {
          throw new BadRequestException(`entities/${member}.yaml must contain matching entity.id`);
        }
        return normalizedPayload;
      }
      case 'AppConfig': {
        const id = requireString(payload.id, 'app.id is required');
        if (id !== member) {
          throw new BadRequestException(`apps/${member}.yaml must contain matching app.id`);
        }
        return normalizeLegacyAppConfigMetadataPayload(payload);
      }
      case 'AclPermission': {
        const code = requireString(payload.code, 'permission.code is required');
        if (code !== member) {
          throw new BadRequestException(`acl/permissions/${member}.yaml must contain matching code`);
        }
        return payload;
      }
      case 'AclResource': {
        const normalizedPayload = normalizeLegacyAclResourceMetadataPayload(payload);
        const id = requireString(normalizedPayload.id, 'resource.id is required');
        if (id !== normalizedMember) {
          throw new BadRequestException(`acl/resources/${member}.yaml must contain matching id`);
        }
        return normalizedPayload;
      }
      case 'AclDefaultPermission': {
        const permissionCode = requireString(payload.permissionCode, 'permissionCode is required');
        if (permissionCode !== member) {
          throw new BadRequestException(
            `acl/default-permissions/${member}.yaml must contain matching permissionCode`,
          );
        }
        return { permissionCode };
      }
      case 'AclContactPermission': {
        const contactRef = requireNestedObject(payload, 'contactRef', `acl/contact-permissions/${member}.yaml`);
        const email = normalizeEmail(contactRef.email, 'contactRef.email is required');
        if (email !== member) {
          throw new BadRequestException(
            `acl/contact-permissions/${member}.yaml must contain matching contactRef.email`,
          );
        }
        return {
          contactRef: { email },
          permissionCodes: requireStringArray(payload.permissionCodes, 'permissionCodes'),
        };
      }
      case 'QueryTemplate': {
        const id = requireString(payload.id, 'template.id is required');
        if (id !== member) {
          throw new BadRequestException(`query-templates/${member}.yaml must contain matching template.id`);
        }
        return payload;
      }
      case 'VisibilityCone': {
        const code = requireString(payload.code, 'cone.code is required');
        if (code !== member) {
          throw new BadRequestException(`visibility/cones/${member}.yaml must contain matching cone.code`);
        }
        return payload;
      }
      case 'VisibilityRule': {
        const id = requireString(payload.id, 'rule.id is required');
        if (id !== member) {
          throw new BadRequestException(`visibility/rules/${member}.yaml must contain matching rule.id`);
        }
        requireString(payload.coneCode, 'rule.coneCode is required');
        return payload;
      }
      case 'VisibilityAssignment': {
        const id = requireString(payload.id, 'assignment.id is required');
        if (id !== member) {
          throw new BadRequestException(
            `visibility/assignments/${member}.yaml must contain matching assignment.id`,
          );
        }
        requireString(payload.coneCode, 'assignment.coneCode is required');
        const contactRef = asRecord(payload.contactRef);
        return {
          ...payload,
          contactRef: contactRef
            ? {
                email: normalizeEmail(contactRef.email, 'contactRef.email is required'),
              }
            : undefined,
        };
      }
      case 'AuthProvider': {
        const providerId = requireString(payload.providerId, 'providerId is required');
        if (providerId !== member) {
          throw new BadRequestException(
            `manual/auth-providers/${member}.yaml must contain matching providerId`,
          );
        }
        return payload;
      }
      case 'LocalCredential': {
        const contactRef = requireNestedObject(
          payload,
          'contactRef',
          `manual/local-credentials/${member}.yaml`,
        );
        const email = normalizeEmail(contactRef.email, 'contactRef.email is required');
        if (email !== member) {
          throw new BadRequestException(
            `manual/local-credentials/${member}.yaml must contain matching contactRef.email`,
          );
        }
        return {
          ...payload,
          contactRef: { email },
        };
      }
    }
  }

  getNormalizedMetadataMember(
    typeName: MetadataTypeName,
    member: string,
    normalizedPayload: Record<string, unknown>,
  ): string {
    switch (typeName) {
      case 'EntityConfig':
      case 'AclResource':
        return typeof normalizedPayload.id === 'string'
          ? normalizedPayload.id
          : normalizeMetadataMemberForComparison(typeName, member);
      default:
        return normalizeMetadataMemberForComparison(typeName, member);
    }
  }

  normalizeDefaultPermissionEntry(value: unknown, path: string): string {
    const payload = requireRecord(value, `${path} must contain an object`);
    return normalizeCanonicalPermissionCode(payload.permissionCode, `${path} permissionCode`);
  }

  normalizeAclContactPermissionCodes(
    value: unknown,
    snapshot: AclConfigSnapshot,
    path: string,
  ): string[] {
    const permissionCodes = requireStringArray(value, `${path} permissionCodes`).map((entry, index) =>
      normalizeCanonicalPermissionCode(entry, `${path} permissionCodes[${index}]`),
    );
    const uniqueCodes = [...new Set(permissionCodes)];
    const definedCodes = new Set(snapshot.permissions.map((permission) => permission.code));
    const defaultCodes = new Set(snapshot.defaultPermissions);

    if (uniqueCodes.length === 0) {
      throw new BadRequestException(`${path} must contain at least one explicit permission`);
    }

    for (const permissionCode of uniqueCodes) {
      if (!definedCodes.has(permissionCode)) {
        throw new BadRequestException(`${path} references undefined permission ${permissionCode}`);
      }

      if (defaultCodes.has(permissionCode)) {
        throw new BadRequestException(
          `${path} references ${permissionCode}, which is already a default permission`,
        );
      }
    }

    return uniqueCodes;
  }

  buildManualAuthProviderRecord(row: {
    providerId: string;
    type: 'OIDC' | 'LOCAL';
    label: string | null;
    enabled: boolean;
    sortOrder: number;
    configJson: unknown;
    clientSecretEncrypted: string | null;
  }): Record<string, unknown> {
    const slot = getAuthProviderSlot(row.providerId);
    const parsedConfig = parseStoredOidcProviderConfig(row.providerId, row.configJson);
    const storedConfig = parsedConfig.config;
    const providerFamily = slot?.providerFamily ?? row.providerId;
    const type = slot?.type ?? row.type.toLowerCase();

    return {
      providerId: row.providerId,
      type,
      providerFamily,
      label: row.label ?? slot?.label ?? row.providerId,
      enabled: row.enabled,
      sortOrder: row.sortOrder,
      clientId: storedConfig?.clientId,
      issuer: storedConfig?.issuer,
      scopes: storedConfig?.scopes,
      tenantId: storedConfig && 'tenantId' in storedConfig ? storedConfig.tenantId : undefined,
      domain: storedConfig && 'domain' in storedConfig ? storedConfig.domain : undefined,
      reason: MANUAL_AUTH_PROVIDER_REASON,
    };
  }
}

function normalizeMetadataMemberForComparison(typeName: MetadataTypeName, member: string): string {
  switch (typeName) {
    case 'EntityConfig':
      return normalizeLegacyEntityMetadataId(member);
    case 'AclResource':
      return normalizeLegacyEntityResourceId(member);
    default:
      return member.trim();
  }
}

function normalizeLegacyEntityConfigMetadataPayload(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const normalized: Record<string, unknown> = {
    ...payload,
    id:
      typeof payload.id === 'string'
        ? normalizeLegacyEntityMetadataId(payload.id)
        : payload.id,
  };

  const detail = asRecord(payload.detail);
  const relatedLists = Array.isArray(detail?.relatedLists)
    ? detail.relatedLists.map((entry) => {
        const relatedList = asRecord(entry);
        if (!relatedList) {
          return entry;
        }

        return {
          ...relatedList,
          entityId:
            typeof relatedList.entityId === 'string'
              ? normalizeLegacyEntityMetadataId(relatedList.entityId)
              : relatedList.entityId,
        };
      })
    : undefined;

  if (detail && relatedLists) {
    normalized.detail = {
      ...detail,
      relatedLists,
    };
  }

  return normalized;
}

function normalizeLegacyAclResourceMetadataPayload(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const normalizedId =
    typeof payload.id === 'string' ? normalizeLegacyEntityResourceId(payload.id) : payload.id;
  const normalizedType = typeof payload.type === 'string' ? payload.type.trim().toLowerCase() : undefined;
  const normalizedSourceType =
    typeof payload.sourceType === 'string' ? payload.sourceType.trim().toLowerCase() : undefined;

  return {
    ...payload,
    id: normalizedId,
    sourceRef:
      typeof payload.sourceRef === 'string' &&
      (normalizedType === 'entity' || normalizedSourceType === 'entity')
        ? normalizeLegacyEntityMetadataId(payload.sourceRef)
        : payload.sourceRef,
  };
}

function normalizeLegacyAppConfigMetadataPayload(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  if (!Array.isArray(payload.items)) {
    return payload;
  }

  return {
    ...payload,
    items: payload.items.map((entry) => {
      const item = asRecord(entry);
      if (!item) {
        return entry;
      }

      return {
        ...item,
        entityId:
          typeof item.entityId === 'string'
            ? normalizeLegacyEntityMetadataId(item.entityId)
            : item.entityId,
        resourceId:
          typeof item.resourceId === 'string'
            ? normalizeLegacyEntityResourceId(item.resourceId)
            : item.resourceId,
      };
    }),
  };
}
