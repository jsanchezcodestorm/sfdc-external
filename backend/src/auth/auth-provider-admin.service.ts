import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Request } from 'express';

import { AuditWriteService } from '../audit/audit-write.service';
import { SetupSecretsService } from '../setup/setup-secrets.service';

import { AuthProviderAdminRepository } from './auth-provider-admin.repository';
import { AUTH_PROVIDER_SLOTS, getAuthProviderSlot } from './auth-provider-catalog';
import {
  normalizeAuthProviderUpsert,
  normalizeAuthProviderUpdate,
  parseStoredOidcProviderConfig
} from './auth-provider-config';
import { AuthProviderRegistryService } from './auth-provider-registry.service';
import { AuthPublicOriginService } from './auth-public-origin.service';
import type {
  AuthAdminProviderDetailItem,
  AuthAdminProviderDetailResponse,
  AuthAdminProviderItem,
  AuthAdminProviderResponse,
  AuthAdminProvidersResponse,
  AuthProviderAdminInput,
  AuthProvidersResponse,
  RegisteredRuntimeAuthProvider
} from './auth.types';

@Injectable()
export class AuthProviderAdminService {
  constructor(
    private readonly authProviderAdminRepository: AuthProviderAdminRepository,
    private readonly authProviderRegistryService: AuthProviderRegistryService,
    private readonly authPublicOriginService: AuthPublicOriginService,
    private readonly setupSecretsService: SetupSecretsService,
    private readonly auditWriteService: AuditWriteService
  ) {}

  async listProviders(): Promise<AuthAdminProvidersResponse> {
    return {
      items: await this.listMergedProviders()
    };
  }

  async getProvider(
    providerId: string,
    request: Pick<Request, 'headers' | 'protocol' | 'get'>
  ): Promise<AuthAdminProviderDetailResponse> {
    const slot = getAuthProviderSlot(providerId);

    if (!slot) {
      throw new NotFoundException(`Auth provider ${providerId} not found`);
    }

    const publicOrigin = this.authPublicOriginService.resolveAllowedOrigin(request);

    if (slot.type === 'oidc' && !publicOrigin) {
      throw new BadRequestException('Current request origin is not allowed for OIDC callbacks');
    }

    const runtimeMap = await this.getRuntimeProviderMap();
    const storedConfig = await this.authProviderAdminRepository.findConfig(slot.id);
    const callbackUri =
      slot.type === 'oidc' && publicOrigin
        ? this.authPublicOriginService.buildOidcCallbackUri(publicOrigin, slot.id)
        : undefined;
    return {
      provider: this.buildProviderDetail(slot.id, storedConfig, runtimeMap.get(slot.id), callbackUri)
    };
  }

  async getPublicProviders(): Promise<AuthProvidersResponse> {
    const items = await this.listMergedProviders();

    return {
      items: items
        .filter((item) => item.status === 'active')
        .map((item) => ({
          id: item.id,
          type: item.type,
          label: item.label,
          loginPath: item.loginPath
        }))
    };
  }

  async updateProvider(
    providerId: string,
    input: AuthProviderAdminInput
  ): Promise<AuthAdminProviderResponse> {
    const slot = getAuthProviderSlot(providerId);

    if (!slot) {
      throw new NotFoundException(`Auth provider ${providerId} not found`);
    }

    const existingConfig = await this.authProviderAdminRepository.findConfig(slot.id);
    const normalized = existingConfig
      ? normalizeAuthProviderUpdate(slot.id, input, existingConfig)
      : normalizeAuthProviderUpsert(slot.id, input);
    const clientSecretEncrypted =
      slot.type === 'oidc'
        ? normalized.clientSecret
          ? this.setupSecretsService.encryptJson(normalized.clientSecret)
          : existingConfig?.clientSecretEncrypted ?? null
        : null;

    await this.authProviderAdminRepository.upsertConfig({
      providerId: normalized.providerId,
      type: normalized.type,
      label: normalized.label,
      enabled: normalized.enabled,
      sortOrder: normalized.sortOrder,
      configJson: normalized.configJson ?? null,
      clientSecretEncrypted
    });

    const action =
      slot.type === 'oidc' &&
      !existingConfig?.configJson &&
      !existingConfig?.clientSecretEncrypted
        ? 'AUTH_PROVIDER_CREATE'
        : 'AUTH_PROVIDER_UPDATE';

    await this.auditWriteService.recordApplicationSuccessOrThrow({
      action,
      targetType: 'auth-provider',
      targetId: slot.id,
      payload: {
        providerId: slot.id,
        providerFamily: slot.providerFamily,
        label: normalized.label,
        enabled: normalized.enabled,
        sortOrder: normalized.sortOrder,
        hasClientSecret: Boolean(clientSecretEncrypted)
      },
      metadata: {
        providerType: slot.type
      }
    });

    const provider = (await this.listMergedProviders()).find((entry) => entry.id === slot.id);

    if (!provider) {
      throw new NotFoundException(`Auth provider ${providerId} not found after update`);
    }

    return { provider };
  }

  private async listMergedProviders(): Promise<AuthAdminProviderItem[]> {
    const runtimeMap = await this.getRuntimeProviderMap();
    const storedConfigs = await this.authProviderAdminRepository.listConfigs();

    return AUTH_PROVIDER_SLOTS
      .map((slot) => {
        const storedConfig = storedConfigs.find((entry) => entry.providerId === slot.id);
        return this.buildProviderSummary(slot.id, storedConfig, runtimeMap.get(slot.id));
      })
      .sort((left, right) => left.sortOrder - right.sortOrder || left.label.localeCompare(right.label));
  }

  private async getRuntimeProviderMap(): Promise<Map<string, RegisteredRuntimeAuthProvider>> {
    const runtimeProviders = await this.authProviderRegistryService.listRuntimeProviders();
    return new Map(runtimeProviders.map((provider) => [provider.id, provider]));
  }

  private buildProviderSummary(
    providerId: string,
    storedConfig:
      | {
          label: string | null;
          enabled: boolean;
          sortOrder: number;
          configJson: unknown;
          clientSecretEncrypted: string | null;
        }
      | null
      | undefined,
    runtimeProvider?: RegisteredRuntimeAuthProvider
  ): AuthAdminProviderItem {
    const slot = getAuthProviderSlot(providerId);

    if (!slot) {
      throw new NotFoundException(`Auth provider ${providerId} not found`);
    }

    const label =
      storedConfig?.label?.trim() ||
      runtimeProvider?.label ||
      slot.label;
    const enabled = storedConfig?.enabled ?? runtimeProvider?.envEnabled ?? true;
    const sortOrder = storedConfig?.sortOrder ?? runtimeProvider?.defaultSortOrder ?? slot.defaultSortOrder;
    const isRuntimeAvailable = runtimeProvider?.isRuntimeAvailable ?? slot.type === 'local';
    const loginPath =
      slot.type === 'oidc' ? runtimeProvider?.loginPath ?? `/api/auth/oidc/${slot.id}/start` : undefined;

    if (slot.type === 'local') {
      const isConfigured = runtimeProvider?.isConfigured ?? false;

      return {
        id: slot.id,
        providerFamily: slot.providerFamily,
        type: slot.type,
        label,
        enabled,
        sortOrder,
        isConfigured,
        isRuntimeAvailable,
        hasClientSecret: false,
        status: !isConfigured || !isRuntimeAvailable ? 'misconfigured' : !enabled ? 'disabled' : 'active',
        loginPath
      };
    }

    const parsedConfig = parseStoredOidcProviderConfig(slot.id, storedConfig?.configJson);
    const hasClientSecret = Boolean(storedConfig?.clientSecretEncrypted?.trim());
    const hasAnyStoredConfig = Boolean(storedConfig?.configJson) || hasClientSecret;
    const isConfigured = Boolean(parsedConfig.config && hasClientSecret);
    const status = this.resolveOidcStatus({
      hasAnyStoredConfig,
      hasClientSecret,
      enabled,
      parsedConfig,
      runtimeProvider
    });

    return {
      id: slot.id,
      providerFamily: slot.providerFamily,
      type: slot.type,
      label,
      enabled,
      sortOrder,
      isConfigured,
      isRuntimeAvailable,
      hasClientSecret,
      status,
      loginPath,
      issuer: parsedConfig.config?.issuer ?? runtimeProvider?.issuer
    };
  }

  private buildProviderDetail(
    providerId: string,
    storedConfig:
      | {
          label: string | null;
          enabled: boolean;
          sortOrder: number;
          configJson: unknown;
          clientSecretEncrypted: string | null;
        }
      | null
      | undefined,
    runtimeProvider?: RegisteredRuntimeAuthProvider,
    callbackUri?: string
  ): AuthAdminProviderDetailItem {
    const summary = this.buildProviderSummary(providerId, storedConfig, runtimeProvider);

    if (summary.type !== 'oidc') {
      return summary;
    }

    const parsedConfig = parseStoredOidcProviderConfig(providerId, storedConfig?.configJson);

    return {
      ...summary,
      clientId: parsedConfig.config?.clientId,
      callbackUri,
      scopes: parsedConfig.config?.scopes,
      tenantId: parsedConfig.config?.providerFamily === 'entra-id' ? parsedConfig.config.tenantId : undefined,
      domain: parsedConfig.config?.providerFamily === 'auth0' ? parsedConfig.config.domain : undefined,
      issuer: parsedConfig.config?.issuer ?? summary.issuer
    };
  }

  private resolveOidcStatus(input: {
    hasAnyStoredConfig: boolean;
    hasClientSecret: boolean;
    enabled: boolean;
    parsedConfig: ReturnType<typeof parseStoredOidcProviderConfig>;
    runtimeProvider?: RegisteredRuntimeAuthProvider;
  }): AuthAdminProviderItem['status'] {
    if (!input.hasAnyStoredConfig) {
      return 'not_configured';
    }

    if (
      !input.parsedConfig.config ||
      !input.hasClientSecret ||
      !input.runtimeProvider ||
      input.runtimeProvider.type !== 'oidc'
    ) {
      return 'misconfigured';
    }

    if (!input.enabled) {
      return 'disabled';
    }

    return 'active';
  }
}
