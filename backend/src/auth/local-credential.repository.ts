import { Injectable } from '@nestjs/common';

import { platformAuthJson } from '../platform/platform-clients';

type LocalCredentialRow = {
  contactId: string;
  username: string;
  enabled: boolean;
  failedAttempts: number;
  lockedUntil: Date | null;
  lastLoginAt: Date | null;
  updatedAt: Date;
};

type PlatformCredentialItem = {
  subjectId: string;
  username: string | null;
  email: string | null;
  enabled: boolean;
  failedAttempts: number;
  lockedUntil: string | null;
  lastLoginAt: string | null;
  updatedAt: string;
};

@Injectable()
export class LocalCredentialRepository {
  async listCredentials(): Promise<LocalCredentialRow[]> {
    const payload = await platformAuthJson<{ items: PlatformCredentialItem[] }>(
      '/auth/admin/local-credentials?productCode=sfdc-external'
    );
    return payload.items.map((entry) => this.mapItem(entry));
  }

  async findByContactId(contactId: string): Promise<LocalCredentialRow | null> {
    const rows = await this.listCredentials();
    return rows.find((entry) => entry.contactId === contactId) ?? null;
  }

  async findByUsername(username: string): Promise<LocalCredentialRow | null> {
    const normalizedUsername = username.trim().toLowerCase();
    const rows = await this.listCredentials();
    return rows.find((entry) => entry.username === normalizedUsername) ?? null;
  }

  async upsertCredential(input: {
    contactId: string;
    username: string;
    password?: string;
    enabled: boolean;
  }): Promise<LocalCredentialRow> {
    const payload = await platformAuthJson<{ credential: PlatformCredentialItem }>(
      `/auth/admin/local-credentials/${encodeURIComponent(input.contactId)}?productCode=sfdc-external`,
      {
        method: 'PUT',
        body: {
          credential: {
            email: input.username,
            username: input.username,
            password: input.password,
            enabled: input.enabled
          }
        }
      }
    );

    return this.mapItem(payload.credential);
  }

  async deleteCredential(contactId: string): Promise<void> {
    await platformAuthJson<void>(
      `/auth/admin/local-credentials/${encodeURIComponent(contactId)}?productCode=sfdc-external`,
      {
        method: 'DELETE'
      }
    );
  }

  async recordFailedLogin(): Promise<void> {
    return;
  }

  async recordSuccessfulLogin(): Promise<void> {
    return;
  }

  private mapItem(item: PlatformCredentialItem): LocalCredentialRow {
    return {
      contactId: item.subjectId,
      username: item.username ?? item.email ?? '',
      enabled: item.enabled,
      failedAttempts: item.failedAttempts,
      lockedUntil: item.lockedUntil ? new Date(item.lockedUntil) : null,
      lastLoginAt: item.lastLoginAt ? new Date(item.lastLoginAt) : null,
      updatedAt: new Date(item.updatedAt)
    };
  }
}
