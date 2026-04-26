import { BadRequestException } from '@nestjs/common';

import type { SalesforceService } from '../../salesforce/salesforce.service';

import type {
  SalesforceFieldSuggestion,
  SalesforceFieldSuggestionCache,
  SalesforceObjectSuggestion,
  SalesforceObjectSuggestionCache
} from './entity-admin-config.types';

export class EntitySalesforceSuggestionService {
  private readonly salesforceObjectCacheTtlMs = 5 * 60 * 1000;
  private readonly salesforceFieldCacheTtlMs = 5 * 60 * 1000;
  private salesforceObjectCache: SalesforceObjectSuggestionCache | null = null;
  private salesforceObjectRefreshPromise: Promise<SalesforceObjectSuggestion[]> | null = null;
  private readonly salesforceFieldCache = new Map<string, SalesforceFieldSuggestionCache>();
  private readonly salesforceFieldRefreshPromises = new Map<string, Promise<SalesforceFieldSuggestion[]>>();

  constructor(private readonly salesforceService: SalesforceService) {}

  async searchObjectApiNames(
    query: string | undefined,
    limit: number | undefined
  ): Promise<{ items: SalesforceObjectSuggestion[] }> {
    const normalizedQuery = this.asOptionalString(query)?.toLowerCase() ?? '';
    const normalizedLimit = this.normalizeSuggestionLimit(limit);
    const items = await this.getCachedSalesforceObjectSuggestions();
    const filtered = normalizedQuery.length === 0 ? items : this.filterAndRankSalesforceObjects(items, normalizedQuery);

    return {
      items: filtered.slice(0, normalizedLimit)
    };
  }

  async searchObjectFields(
    objectApiName: string,
    query: string | undefined,
    limit: number | undefined
  ): Promise<{ items: SalesforceFieldSuggestion[] }> {
    const normalizedObjectApiName = this.asOptionalString(objectApiName);
    if (!normalizedObjectApiName) {
      throw new BadRequestException('objectApiName is required');
    }

    const normalizedQuery = this.asOptionalString(query)?.toLowerCase() ?? '';
    const normalizedLimit = this.normalizeSuggestionLimit(limit);
    const items = await this.getCachedSalesforceFieldSuggestions(normalizedObjectApiName);
    const filtered = normalizedQuery.length === 0 ? items : this.filterAndRankSalesforceFields(items, normalizedQuery);

    return {
      items: filtered.slice(0, normalizedLimit)
    };
  }

  private normalizeSuggestionLimit(value: number | undefined): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return 8;
    }

    return Math.min(25, Math.max(1, Math.trunc(value)));
  }

  private filterAndRankSalesforceObjects(
    items: SalesforceObjectSuggestion[],
    normalizedQuery: string
  ): SalesforceObjectSuggestion[] {
    type ScoredSuggestion = {
      item: SalesforceObjectSuggestion;
      score: number;
    };

    const scored = items
      .map((item) => ({
        item,
        score: this.computeSalesforceObjectScore(item, normalizedQuery)
      }))
      .filter((entry): entry is ScoredSuggestion => entry.score !== null)
      .sort((left, right) => {
        if (left.score !== right.score) {
          return left.score - right.score;
        }

        return left.item.name.localeCompare(right.item.name, 'en', { sensitivity: 'base' });
      });

    return scored.map((entry) => entry.item);
  }

  private computeSalesforceObjectScore(
    item: SalesforceObjectSuggestion,
    normalizedQuery: string
  ): number | null {
    const name = item.name.toLowerCase();
    const label = item.label.toLowerCase();

    if (name.startsWith(normalizedQuery)) {
      return 0;
    }

    if (label.startsWith(normalizedQuery)) {
      return 1;
    }

    if (name.includes(normalizedQuery)) {
      return 2;
    }

    if (label.includes(normalizedQuery)) {
      return 3;
    }

    return null;
  }

  private filterAndRankSalesforceFields(
    items: SalesforceFieldSuggestion[],
    normalizedQuery: string
  ): SalesforceFieldSuggestion[] {
    type ScoredSuggestion = {
      item: SalesforceFieldSuggestion;
      score: number;
    };

    const scored = items
      .map((item) => ({
        item,
        score: this.computeSalesforceFieldScore(item, normalizedQuery)
      }))
      .filter((entry): entry is ScoredSuggestion => entry.score !== null)
      .sort((left, right) => {
        if (left.score !== right.score) {
          return left.score - right.score;
        }

        return left.item.name.localeCompare(right.item.name, 'en', { sensitivity: 'base' });
      });

    return scored.map((entry) => entry.item);
  }

  private computeSalesforceFieldScore(
    item: SalesforceFieldSuggestion,
    normalizedQuery: string
  ): number | null {
    const name = item.name.toLowerCase();
    const label = item.label.toLowerCase();

    if (name.startsWith(normalizedQuery)) {
      return 0;
    }

    if (label.startsWith(normalizedQuery)) {
      return 1;
    }

    if (name.includes(normalizedQuery)) {
      return 2;
    }

    if (label.includes(normalizedQuery)) {
      return 3;
    }

    return null;
  }

  private async getCachedSalesforceObjectSuggestions(): Promise<SalesforceObjectSuggestion[]> {
    const nowMs = Date.now();
    const cache = this.salesforceObjectCache;
    if (cache && nowMs - cache.fetchedAtMs < this.salesforceObjectCacheTtlMs) {
      return cache.items;
    }

    const inFlight = this.salesforceObjectRefreshPromise;
    if (inFlight) {
      return inFlight;
    }

    const refreshPromise = this.refreshSalesforceObjectSuggestionCache();
    this.salesforceObjectRefreshPromise = refreshPromise;

    try {
      return await refreshPromise;
    } finally {
      this.salesforceObjectRefreshPromise = null;
    }
  }

  private async refreshSalesforceObjectSuggestionCache(): Promise<SalesforceObjectSuggestion[]> {
    const objects = await this.salesforceService.describeGlobalObjects();
    const items = objects
      .map((entry) => ({
        name: entry.name.trim(),
        label: entry.label.trim(),
        custom: Boolean(entry.custom)
      }))
      .filter((entry) => entry.name.length > 0)
      .sort((left, right) => left.name.localeCompare(right.name, 'en', { sensitivity: 'base' }));

    this.salesforceObjectCache = {
      fetchedAtMs: Date.now(),
      items
    };

    return items;
  }

  private async getCachedSalesforceFieldSuggestions(objectApiName: string): Promise<SalesforceFieldSuggestion[]> {
    const cacheKey = objectApiName.toLowerCase();
    const nowMs = Date.now();
    const cache = this.salesforceFieldCache.get(cacheKey);

    if (cache && nowMs - cache.fetchedAtMs < this.salesforceFieldCacheTtlMs) {
      return cache.items;
    }

    const inFlight = this.salesforceFieldRefreshPromises.get(cacheKey);
    if (inFlight) {
      return inFlight;
    }

    const refreshPromise = this.refreshSalesforceFieldSuggestionCache(objectApiName, cacheKey);
    this.salesforceFieldRefreshPromises.set(cacheKey, refreshPromise);

    try {
      return await refreshPromise;
    } finally {
      this.salesforceFieldRefreshPromises.delete(cacheKey);
    }
  }

  private async refreshSalesforceFieldSuggestionCache(
    objectApiName: string,
    cacheKey: string
  ): Promise<SalesforceFieldSuggestion[]> {
    const fields = await this.salesforceService.describeObjectFields(objectApiName);
    const items = fields
      .map((entry) => ({
        name: entry.name.trim(),
        label: entry.label.trim(),
        type: entry.type.trim(),
        filterable: Boolean(entry.filterable)
      }))
      .filter((entry) => entry.name.length > 0)
      .sort((left, right) => left.name.localeCompare(right.name, 'en', { sensitivity: 'base' }));

    this.salesforceFieldCache.set(cacheKey, {
      fetchedAtMs: Date.now(),
      items
    });

    return items;
  }

  private asOptionalString(value: unknown): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
}
