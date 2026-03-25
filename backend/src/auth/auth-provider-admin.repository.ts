import { Injectable } from '@nestjs/common';

import { platformAuthJson } from '../platform/platform-clients';

type ProviderConfigRow = {
  providerId: string;
  type: 'OIDC' | 'LOCAL';
  label: string | null;
  enabled: boolean;
  sortOrder: number;
  configJson: unknown;
  clientSecretEncrypted: string | null;
};

@Injectable()
export class AuthProviderAdminRepository {
  async listConfigs(): Promise<ProviderConfigRow[]> {
    const payload = await platformAuthJson<{
      items: Array<{
        id: string;
        type: 'oidc' | 'local';
        label: string;
      }>;
    }>('/auth/admin/providers');
    const configs = await Promise.all(
      payload.items.map((entry) => this.findConfig(entry.id))
    );
    return configs.filter((entry): entry is ProviderConfigRow => entry !== null);
  }

  async findConfig(providerId: string): Promise<ProviderConfigRow | null> {
    try {
      const payload = await platformAuthJson<{
        provider: {
          id: string;
          type: 'oidc' | 'local';
          label: string;
          enabled: boolean;
          sortOrder: number;
          issuer?: string;
          clientId?: string;
          discoveryUrl?: string;
          tenantId?: string;
          domain?: string;
          scopes?: string[];
          hasClientSecret: boolean;
        };
      }>(`/auth/admin/providers/${encodeURIComponent(providerId)}`);

      return {
        providerId: payload.provider.id,
        type: payload.provider.type === 'oidc' ? 'OIDC' : 'LOCAL',
        label: payload.provider.label,
        enabled: payload.provider.enabled,
        sortOrder: payload.provider.sortOrder,
        configJson:
          payload.provider.type === 'oidc'
            ? {
                issuer: payload.provider.issuer ?? null,
                clientId: payload.provider.clientId ?? null,
                discoveryUrl: payload.provider.discoveryUrl ?? null,
                tenantId: payload.provider.tenantId ?? null,
                domain: payload.provider.domain ?? null,
                scopes: payload.provider.scopes ?? []
              }
            : null,
        clientSecretEncrypted: payload.provider.hasClientSecret ? '__platform_managed__' : null
      };
    } catch {
      return null;
    }
  }

  upsertConfig(): Promise<never> {
    throw new Error('Use AuthProviderAdminService.updateProvider for platform-managed auth config');
  }
}
