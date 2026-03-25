import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { platformConnectorsJson, PlatformHttpError } from '../platform/platform-clients';

import { SalesforceNotConfiguredException } from './salesforce-not-configured.exception';

interface SalesforceObjectSummary {
  name: string;
  label: string;
  custom: boolean;
}

export interface SalesforcePicklistValueSummary {
  value: string;
  label: string;
  active: boolean;
  defaultValue: boolean;
}

export interface SalesforceFieldSummary {
  name: string;
  label: string;
  type: string;
  nillable: boolean;
  createable: boolean;
  updateable: boolean;
  filterable: boolean;
  defaultedOnCreate: boolean;
  calculated: boolean;
  autoNumber: boolean;
  picklistValues?: SalesforcePicklistValueSummary[];
  relationshipName?: string;
  referenceTo?: string[];
}

export interface SalesforceReadOnlyQueryResult {
  done: boolean;
  totalSize: number;
  records: Array<Record<string, unknown>>;
  nextRecordsUrl?: string;
}

@Injectable()
export class SalesforceService {
  constructor(private readonly configService: ConfigService) {}

  async describeGlobalObjects(): Promise<SalesforceObjectSummary[]> {
    const payload = await this.request<{ items: SalesforceObjectSummary[] }>(
      '/internal/connectors/salesforce/objects'
    );
    return payload.items;
  }

  describeObject(objectApiName: string): Promise<unknown> {
    return this.request(`/internal/connectors/salesforce/objects/${encodeURIComponent(objectApiName)}`);
  }

  async describeObjectFields(objectApiName: string): Promise<SalesforceFieldSummary[]> {
    const payload = await this.request<{ items: SalesforceFieldSummary[] }>(
      `/internal/connectors/salesforce/objects/${encodeURIComponent(objectApiName)}/fields`
    );
    return payload.items;
  }

  findContactByEmail(
    email: string
  ): Promise<{ id: string; email?: string; recordTypeDeveloperName?: string } | null> {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      return Promise.resolve(null);
    }

    return this.request(
      `/internal/connectors/salesforce/contacts/by-email?email=${encodeURIComponent(normalizedEmail)}`
    );
  }

  findContactById(
    contactId: string
  ): Promise<{ id: string; name?: string; email?: string; recordTypeDeveloperName?: string } | null> {
    const normalizedContactId = contactId.trim();
    if (!normalizedContactId) {
      return Promise.resolve(null);
    }

    return this.request(
      `/internal/connectors/salesforce/contacts/by-id/${encodeURIComponent(normalizedContactId)}`
    );
  }

  async searchContactsByIdOrName(
    query: string,
    limit: number
  ): Promise<Array<{ id: string; name?: string; recordTypeDeveloperName?: string }>> {
    const payload = await this.request<{
      items: Array<{ id: string; name?: string; recordTypeDeveloperName?: string }>;
    }>(
      `/internal/connectors/salesforce/contacts/search?q=${encodeURIComponent(
        query
      )}&limit=${encodeURIComponent(String(limit))}`
    );
    return payload.items;
  }

  executeReadOnlyQuery(soql: string): Promise<unknown> {
    return this.request('/internal/connectors/salesforce/query/read-only', {
      method: 'POST',
      body: { soql }
    });
  }

  executeReadOnlyQueryPage(soql: string, pageSize: number): Promise<SalesforceReadOnlyQueryResult> {
    return this.request('/internal/connectors/salesforce/query/page', {
      method: 'POST',
      body: { soql, pageSize }
    });
  }

  executeReadOnlyQueryMore(
    locator: string,
    pageSize: number
  ): Promise<SalesforceReadOnlyQueryResult> {
    return this.request('/internal/connectors/salesforce/query/more', {
      method: 'POST',
      body: { locator, pageSize }
    });
  }

  async executeRawQuery(soql: string): Promise<unknown> {
    const rawQueryEnabled =
      this.configService.get<string>('ENABLE_RAW_SALESFORCE_QUERY', 'false') === 'true';

    if (!rawQueryEnabled) {
      throw new ForbiddenException('Raw Salesforce query endpoint is disabled');
    }

    return this.request('/internal/connectors/salesforce/query/raw', {
      method: 'POST',
      body: { soql }
    });
  }

  createRecord(objectApiName: string, values: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.request(`/internal/connectors/salesforce/records/${encodeURIComponent(objectApiName)}`, {
      method: 'POST',
      body: { values }
    });
  }

  updateRecord(
    objectApiName: string,
    recordId: string,
    values: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    return this.request(
      `/internal/connectors/salesforce/records/${encodeURIComponent(objectApiName)}/${encodeURIComponent(
        recordId
      )}`,
      {
        method: 'PUT',
        body: { values }
      }
    );
  }

  async deleteRecord(objectApiName: string, recordId: string): Promise<void> {
    await this.request<void>(
      `/internal/connectors/salesforce/records/${encodeURIComponent(objectApiName)}/${encodeURIComponent(
        recordId
      )}`,
      {
        method: 'DELETE'
      }
    );
  }

  async ping(): Promise<void> {
    try {
      await this.request('/internal/connectors/salesforce/status');
    } catch (error) {
      if (error instanceof SalesforceNotConfiguredException) {
        throw error;
      }

      throw error;
    }
  }

  private async request<T = unknown>(
    path: string,
    options?: Omit<RequestInit, 'body' | 'headers'> & {
      body?: BodyInit | Record<string, unknown>;
      headers?: HeadersInit;
    }
  ): Promise<T> {
    try {
      return await platformConnectorsJson<T>(path, options);
    } catch (error) {
      if (error instanceof PlatformHttpError) {
        if (error.status === 503) {
          throw new SalesforceNotConfiguredException();
        }

        if (error.status === 400) {
          throw new BadRequestException(error.message);
        }
      }

      throw error;
    }
  }
}
