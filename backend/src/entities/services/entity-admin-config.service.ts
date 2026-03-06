import { BadRequestException, Injectable } from '@nestjs/common';

import { ResourceAccessService } from '../../common/services/resource-access.service';
import { SalesforceService } from '../../salesforce/salesforce.service';
import {
  EntityActionConfig,
  EntityConfig,
  EntityDetailConfig,
  EntityDetailSectionConfig,
  EntityFormConfig,
  EntityFormSectionConfig,
  EntityListConfig,
  EntityListViewConfig,
  EntityRelatedListConfig
} from '../entities.types';

import { EntityAdminConfigRepository, EntityAdminConfigSummary } from './entity-admin-config.repository';

export interface EntityAdminConfigListResponse {
  items: EntityAdminConfigSummary[];
}

export interface UpsertEntityAdminConfigPayload {
  entity: unknown;
}

interface SalesforceObjectSuggestion {
  name: string;
  label: string;
  custom: boolean;
}

interface SalesforceObjectSuggestionCache {
  fetchedAtMs: number;
  items: SalesforceObjectSuggestion[];
}

interface SalesforceFieldSuggestion {
  name: string;
  label: string;
  type: string;
  filterable: boolean;
}

interface SalesforceFieldSuggestionCache {
  fetchedAtMs: number;
  items: SalesforceFieldSuggestion[];
}

@Injectable()
export class EntityAdminConfigService {
  private readonly salesforceObjectCacheTtlMs = 5 * 60 * 1000;
  private readonly salesforceFieldCacheTtlMs = 5 * 60 * 1000;
  private salesforceObjectCache: SalesforceObjectSuggestionCache | null = null;
  private salesforceObjectRefreshPromise: Promise<SalesforceObjectSuggestion[]> | null = null;
  private readonly salesforceFieldCache = new Map<string, SalesforceFieldSuggestionCache>();
  private readonly salesforceFieldRefreshPromises = new Map<string, Promise<SalesforceFieldSuggestion[]>>();

  constructor(
    private readonly resourceAccessService: ResourceAccessService,
    private readonly repository: EntityAdminConfigRepository,
    private readonly salesforceService: SalesforceService
  ) {}

  async listEntityConfigs(): Promise<EntityAdminConfigListResponse> {
    const items = await this.repository.listSummaries();
    return { items };
  }

  async getEntityConfig(entityId: string): Promise<{ entity: EntityConfig }> {
    this.resourceAccessService.assertKebabCaseId(entityId, 'entityId');
    const entity = await this.repository.getEntityConfig(entityId);
    return { entity };
  }

  async upsertEntityConfig(entityId: string, payload: UpsertEntityAdminConfigPayload): Promise<{ entity: EntityConfig }> {
    this.resourceAccessService.assertKebabCaseId(entityId, 'entityId');
    const normalizedEntityConfig = this.normalizeEntityConfig(entityId, payload.entity);

    await this.repository.upsertEntityConfig(normalizedEntityConfig);
    const entity = await this.repository.getEntityConfig(entityId);

    return { entity };
  }

  async searchSalesforceObjectApiNames(
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

  async searchSalesforceObjectFields(
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

  private normalizeEntityConfig(entityId: string, value: unknown): EntityConfig {
    const entity = this.requireObject(value, 'entity payload must be an object');
    const id = this.requireString(entity.id, 'entity.id is required');

    if (id !== entityId) {
      throw new BadRequestException('entity.id must match route entityId');
    }

    const label = this.requireString(entity.label, 'entity.label is required');
    const objectApiName = this.requireString(entity.objectApiName, 'entity.objectApiName is required');

    return {
      id,
      label,
      objectApiName,
      description: this.asOptionalString(entity.description),
      navigation: this.normalizeNavigation(entity.navigation),
      list: this.normalizeListConfig(entity.list),
      detail: this.normalizeDetailConfig(entity.detail),
      form: this.normalizeFormConfig(entity.form)
    };
  }

  private normalizeNavigation(value: unknown): EntityConfig['navigation'] | undefined {
    if (value === undefined || value === null) {
      return undefined;
    }

    const navigation = this.requireObject(value, 'entity.navigation must be an object');
    const basePath = this.asOptionalString(navigation.basePath);

    return basePath ? { basePath } : undefined;
  }

  private normalizeListConfig(value: unknown): EntityListConfig | undefined {
    if (value === undefined || value === null) {
      return undefined;
    }

    const list = this.requireObject(value, 'entity.list must be an object');
    const title = this.requireString(list.title, 'entity.list.title is required');
    const views = this.requireArray(list.views, 'entity.list.views must be an array')
      .map((entry, index) => this.normalizeListView(entry, index));

    if (views.length === 0) {
      throw new BadRequestException('entity.list.views must contain at least one item');
    }

    return {
      title,
      subtitle: this.asOptionalString(list.subtitle),
      primaryAction: this.normalizeAction(list.primaryAction),
      views
    };
  }

  private normalizeListView(value: unknown, index: number): EntityListViewConfig {
    const view = this.requireObject(value, `entity.list.views[${index}] must be an object`);
    const id = this.requireString(view.id, `entity.list.views[${index}].id is required`);
    const label = this.requireString(view.label, `entity.list.views[${index}].label is required`);
    const query = this.requireObject(view.query, `entity.list.views[${index}].query is required`);
    const columns = this.normalizeColumns(view.columns, `entity.list.views[${index}].columns`);

    return {
      id,
      label,
      query: query as unknown as EntityListViewConfig['query'],
      columns,
      description: this.asOptionalString(view.description),
      default: this.asOptionalBoolean(view.default),
      pageSize: this.asOptionalNumber(view.pageSize),
      search: this.normalizeObjectOrUndefined(view.search, `entity.list.views[${index}].search`) as EntityListViewConfig['search'],
      primaryAction: this.normalizeAction(view.primaryAction),
      rowActions: this.normalizeActionsArray(view.rowActions, `entity.list.views[${index}].rowActions`)
    };
  }

  private normalizeDetailConfig(value: unknown): EntityDetailConfig | undefined {
    if (value === undefined || value === null) {
      return undefined;
    }

    const detail = this.requireObject(value, 'entity.detail must be an object');
    const query = this.requireObject(detail.query, 'entity.detail.query is required');
    const sections = this.requireArray(detail.sections, 'entity.detail.sections must be an array')
      .map((entry, index) => this.normalizeDetailSection(entry, index));

    if (sections.length === 0) {
      throw new BadRequestException('entity.detail.sections must contain at least one item');
    }

    return {
      query: query as unknown as EntityDetailConfig['query'],
      sections,
      relatedLists: this.normalizeRelatedListsArray(detail.relatedLists),
      titleTemplate: this.asOptionalString(detail.titleTemplate),
      fallbackTitle: this.asOptionalString(detail.fallbackTitle),
      subtitle: this.asOptionalString(detail.subtitle),
      actions: this.normalizeActionsArray(detail.actions, 'entity.detail.actions'),
      pathStatus: this.normalizeObjectOrUndefined(detail.pathStatus, 'entity.detail.pathStatus') as EntityDetailConfig['pathStatus']
    };
  }

  private normalizeDetailSection(value: unknown, index: number): EntityDetailSectionConfig {
    const section = this.requireObject(value, `entity.detail.sections[${index}] must be an object`);
    const title = this.requireString(section.title, `entity.detail.sections[${index}].title is required`);
    const fields = this.requireArray(section.fields, `entity.detail.sections[${index}].fields must be an array`)
      .map((entry, fieldIndex) =>
        this.requireObject(
          entry,
          `entity.detail.sections[${index}].fields[${fieldIndex}] must be an object`
        )
      );

    if (fields.length === 0) {
      throw new BadRequestException(`entity.detail.sections[${index}].fields must contain at least one item`);
    }

    return {
      title,
      fields: fields as unknown as EntityDetailSectionConfig['fields']
    };
  }

  private normalizeRelatedListsArray(value: unknown): EntityRelatedListConfig[] | undefined {
    if (value === undefined || value === null) {
      return undefined;
    }

    const rows = this.requireArray(value, 'entity.detail.relatedLists must be an array')
      .map((entry, index) => this.normalizeRelatedList(entry, index));

    return rows.length > 0 ? rows : undefined;
  }

  private normalizeRelatedList(value: unknown, index: number): EntityRelatedListConfig {
    const relatedList = this.requireObject(value, `entity.detail.relatedLists[${index}] must be an object`);
    const id = this.requireString(relatedList.id, `entity.detail.relatedLists[${index}].id is required`);
    const label = this.requireString(relatedList.label, `entity.detail.relatedLists[${index}].label is required`);
    const query = this.requireObject(relatedList.query, `entity.detail.relatedLists[${index}].query is required`);
    const columns = this.normalizeColumns(relatedList.columns, `entity.detail.relatedLists[${index}].columns`);

    return {
      id,
      label,
      query: query as unknown as EntityRelatedListConfig['query'],
      columns,
      description: this.asOptionalString(relatedList.description),
      actions: this.normalizeActionsArray(relatedList.actions, `entity.detail.relatedLists[${index}].actions`),
      rowActions: this.normalizeActionsArray(relatedList.rowActions, `entity.detail.relatedLists[${index}].rowActions`),
      emptyState: this.asOptionalString(relatedList.emptyState),
      pageSize: this.asOptionalNumber(relatedList.pageSize),
      entityId: this.asOptionalString(relatedList.entityId)
    };
  }

  private normalizeFormConfig(value: unknown): EntityFormConfig | undefined {
    if (value === undefined || value === null) {
      return undefined;
    }

    const form = this.requireObject(value, 'entity.form must be an object');
    const title = this.requireObject(form.title, 'entity.form.title is required');
    const createTitle = this.requireString(title.create, 'entity.form.title.create is required');
    const editTitle = this.requireString(title.edit, 'entity.form.title.edit is required');
    const query = this.requireObject(form.query, 'entity.form.query is required');
    const sections = this.requireArray(form.sections, 'entity.form.sections must be an array')
      .map((entry, index) => this.normalizeFormSection(entry, index));

    if (sections.length === 0) {
      throw new BadRequestException('entity.form.sections must contain at least one item');
    }

    return {
      title: {
        create: createTitle,
        edit: editTitle
      },
      query: query as unknown as EntityFormConfig['query'],
      subtitle: this.asOptionalString(form.subtitle),
      sections
    };
  }

  private normalizeFormSection(value: unknown, index: number): EntityFormSectionConfig {
    const section = this.requireObject(value, `entity.form.sections[${index}] must be an object`);
    const fields = this.requireArray(section.fields, `entity.form.sections[${index}].fields must be an array`)
      .map((entry, fieldIndex) =>
        this.requireObject(
          entry,
          `entity.form.sections[${index}].fields[${fieldIndex}] must be an object`
        )
      );

    if (fields.length === 0) {
      throw new BadRequestException(`entity.form.sections[${index}].fields must contain at least one item`);
    }

    return {
      title: this.asOptionalString(section.title),
      fields: fields as unknown as EntityFormSectionConfig['fields']
    };
  }

  private normalizeColumns(value: unknown, path: string): EntityListViewConfig['columns'] {
    const columns = this.requireArray(value, `${path} must be an array`)
      .filter((entry): entry is string | Record<string, unknown> => typeof entry === 'string' || this.isObjectRecord(entry));

    if (columns.length === 0) {
      throw new BadRequestException(`${path} must contain at least one item`);
    }

    return columns as EntityListViewConfig['columns'];
  }

  private normalizeAction(value: unknown): EntityActionConfig | undefined {
    if (value === undefined || value === null) {
      return undefined;
    }

    const action = this.requireObject(value, 'action must be an object');
    return action as unknown as EntityActionConfig;
  }

  private normalizeActionsArray(value: unknown, path: string): EntityActionConfig[] | undefined {
    if (value === undefined || value === null) {
      return undefined;
    }

    const actions = this.requireArray(value, `${path} must be an array`)
      .map((entry, index) => this.requireObject(entry, `${path}[${index}] must be an object`))
      .map((entry) => entry as unknown as EntityActionConfig);

    return actions.length > 0 ? actions : undefined;
  }

  private normalizeObjectOrUndefined(value: unknown, errorMessage: string): Record<string, unknown> | undefined {
    if (value === undefined || value === null) {
      return undefined;
    }

    return this.requireObject(value, `${errorMessage} must be an object`);
  }

  private requireObject(value: unknown, errorMessage: string): Record<string, unknown> {
    if (!this.isObjectRecord(value)) {
      throw new BadRequestException(errorMessage);
    }

    return value;
  }

  private requireArray(value: unknown, errorMessage: string): unknown[] {
    if (!Array.isArray(value)) {
      throw new BadRequestException(errorMessage);
    }

    return value;
  }

  private requireString(value: unknown, errorMessage: string): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new BadRequestException(errorMessage);
    }

    return value.trim();
  }

  private asOptionalString(value: unknown): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  private asOptionalBoolean(value: unknown): boolean | undefined {
    return typeof value === 'boolean' ? value : undefined;
  }

  private asOptionalNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  }

  private isObjectRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
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

  private computeSalesforceObjectScore(item: SalesforceObjectSuggestion, normalizedQuery: string): number | null {
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

  private computeSalesforceFieldScore(item: SalesforceFieldSuggestion, normalizedQuery: string): number | null {
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
}
