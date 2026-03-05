import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';

import type {
  EntityConfig,
  EntityDetailConfig,
  EntityDetailSectionConfig,
  EntityFormConfig,
  EntityFormSectionConfig,
  EntityListConfig,
  EntityListViewConfig,
  EntityRelatedListConfig
} from '../entities.types';

@Injectable()
export class EntityConfigRepository {
  private readonly logger = new Logger(EntityConfigRepository.name);
  private readonly entityCache = new Map<string, EntityConfig>();
  private readonly inFlightLoads = new Map<string, Promise<EntityConfig>>();

  async getEntityConfig(entityId: string): Promise<EntityConfig> {
    const cached = this.entityCache.get(entityId);
    if (cached) {
      return cached;
    }

    const inFlight = this.inFlightLoads.get(entityId);
    if (inFlight) {
      return inFlight;
    }

    const loadPromise = this.loadEntityConfig(entityId).finally(() => {
      this.inFlightLoads.delete(entityId);
    });

    this.inFlightLoads.set(entityId, loadPromise);
    return loadPromise;
  }

  private async loadEntityConfig(entityId: string): Promise<EntityConfig> {
    const structuredConfigDirectory = this.resolveEntityConfigDirectory(entityId);

    if (!structuredConfigDirectory) {
      throw new NotFoundException(`Entity config folder not found for ${entityId}`);
    }

    const config = await this.loadStructuredEntityConfig(entityId, structuredConfigDirectory);
    this.entityCache.set(entityId, config);
    return config;
  }

  private resolveEntityConfigDirectory(entityId: string): string | null {
    const candidates = [
      path.resolve(process.cwd(), 'config', 'entities', entityId),
      path.resolve(process.cwd(), 'backend', 'config', 'entities', entityId)
    ];

    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        return candidate;
      }
    }

    return null;
  }

  private async loadStructuredEntityConfig(entityId: string, directoryPath: string): Promise<EntityConfig> {
    const basePath = path.resolve(directoryPath, 'base.json');
    if (!existsSync(basePath)) {
      throw new NotFoundException(`Entity base config not found for ${entityId}`);
    }

    const baseConfig = await this.readJsonFile<Record<string, unknown>>(basePath);
    const baseEntityId = this.asNonEmptyString(baseConfig.id);

    if (!baseEntityId) {
      throw new BadRequestException(`Entity base config for ${entityId} is invalid: id is required`);
    }

    if (baseEntityId !== entityId) {
      this.logger.warn(`Entity config folder id mismatch: folder=${entityId}, base.id=${baseEntityId}`);
    }

    const listConfig = await this.loadListConfig(directoryPath);
    const detailConfig = await this.loadDetailConfig(directoryPath);
    const formConfig = await this.loadFormConfig(directoryPath);
    const objectApiName = this.resolveObjectApiName(baseConfig, listConfig, detailConfig, formConfig);

    return {
      ...baseConfig,
      id: baseEntityId,
      label: this.asOptionalString(baseConfig.label),
      description: this.asOptionalString(baseConfig.description),
      navigation: this.asNavigation(baseConfig.navigation),
      objectApiName,
      list: listConfig,
      detail: detailConfig,
      form: formConfig
    };
  }

  private async loadListConfig(entityDirectoryPath: string): Promise<EntityListConfig | undefined> {
    const indexPath = path.resolve(entityDirectoryPath, 'list', 'index.json');
    if (!existsSync(indexPath)) {
      return undefined;
    }

    const indexConfig = await this.readJsonFile<Record<string, unknown>>(indexPath);
    const title = this.asNonEmptyString(indexConfig.title);
    if (!title) {
      throw new BadRequestException(`Invalid list/index.json: title is required`);
    }

    const views = await this.loadListViews(path.resolve(entityDirectoryPath, 'list'), indexConfig.views);
    if (views.length === 0) {
      throw new BadRequestException(`Invalid list/index.json: at least one valid view is required`);
    }

    return {
      title,
      subtitle: this.asOptionalString(indexConfig.subtitle),
      primaryAction: (this.asObject(indexConfig.primaryAction) ?? undefined) as unknown as EntityListConfig['primaryAction'],
      views
    };
  }

  private async loadListViews(listDirectoryPath: string, refs: unknown): Promise<EntityListViewConfig[]> {
    if (!Array.isArray(refs)) {
      return [];
    }

    const loadedViews: EntityListViewConfig[] = [];

    for (const ref of refs) {
      const relativePath = typeof ref === 'string' ? ref.trim() : '';
      if (!relativePath) {
        continue;
      }

      const viewPath = path.resolve(listDirectoryPath, relativePath);
      if (!existsSync(viewPath)) {
        this.logger.warn(`Entity list view not found: ${viewPath}`);
        continue;
      }

      try {
        const viewConfig = await this.readJsonFile<Record<string, unknown>>(viewPath);
        const id = this.asNonEmptyString(viewConfig.id);
        const label = this.asNonEmptyString(viewConfig.label);
        const query = this.asObject(viewConfig.query);
        const columns = Array.isArray(viewConfig.columns)
          ? (viewConfig.columns.filter((column) => typeof column === 'string' || this.isObjectRecord(column)) as Array<
              string | Record<string, unknown>
            >)
          : [];

        if (!id || !label || !query || columns.length === 0) {
          this.logger.warn(`Entity list view is invalid and will be skipped: ${viewPath}`);
          continue;
        }

        loadedViews.push({
          id,
          label,
          query: query as unknown as EntityListViewConfig['query'],
          columns: columns as unknown as EntityListViewConfig['columns'],
          description: this.asOptionalString(viewConfig.description),
          default: typeof viewConfig.default === 'boolean' ? viewConfig.default : undefined,
          pageSize: typeof viewConfig.pageSize === 'number' ? viewConfig.pageSize : undefined,
          search: (this.asObject(viewConfig.search) ?? undefined) as unknown as EntityListViewConfig['search'] | undefined,
          primaryAction: (this.asObject(viewConfig.primaryAction) ?? undefined) as unknown as EntityListViewConfig['primaryAction'] | undefined,
          rowActions: this.asObjectArray(viewConfig.rowActions) as unknown as EntityListViewConfig['rowActions'] | undefined
        });
      } catch (error) {
        this.logger.warn(`Entity list view cannot be parsed and will be skipped: ${viewPath} (${String(error)})`);
      }
    }

    return loadedViews;
  }

  private async loadDetailConfig(entityDirectoryPath: string): Promise<EntityDetailConfig | undefined> {
    const indexPath = path.resolve(entityDirectoryPath, 'detail', 'index.json');
    if (!existsSync(indexPath)) {
      return undefined;
    }

    const indexConfig = await this.readJsonFile<Record<string, unknown>>(indexPath);
    const query = this.asObject(indexConfig.query);
    if (!query) {
      throw new BadRequestException(`Invalid detail/index.json: query is required`);
    }

    const sections = await this.loadDetailSections(path.resolve(entityDirectoryPath, 'detail'), indexConfig.sections);
    if (sections.length === 0) {
      throw new BadRequestException(`Invalid detail/index.json: sections are required`);
    }

    const relatedLists = await this.loadRelatedLists(
      path.resolve(entityDirectoryPath, 'detail'),
      indexConfig.relatedLists
    );

    return {
      query: query as unknown as EntityDetailConfig['query'],
      sections,
      relatedLists: relatedLists.length > 0 ? relatedLists : undefined,
      titleTemplate: this.asOptionalString(indexConfig.titleTemplate),
      fallbackTitle: this.asOptionalString(indexConfig.fallbackTitle),
      subtitle: this.asOptionalString(indexConfig.subtitle),
      actions: this.asObjectArray(indexConfig.actions) as unknown as EntityDetailConfig['actions'] | undefined,
      pathStatus: (this.asObject(indexConfig.pathStatus) ?? undefined) as unknown as EntityDetailConfig['pathStatus'] | undefined
    };
  }

  private async loadDetailSections(
    detailDirectoryPath: string,
    refs: unknown
  ): Promise<EntityDetailSectionConfig[]> {
    if (!Array.isArray(refs)) {
      return [];
    }

    const sections: EntityDetailSectionConfig[] = [];

    for (const ref of refs) {
      const relativePath = typeof ref === 'string' ? ref.trim() : '';
      if (!relativePath) {
        continue;
      }

      const sectionPath = path.resolve(detailDirectoryPath, relativePath);
      if (!existsSync(sectionPath)) {
        this.logger.warn(`Entity detail section not found: ${sectionPath}`);
        continue;
      }

      try {
        const sectionConfig = await this.readJsonFile<Record<string, unknown>>(sectionPath);
        const title = this.asNonEmptyString(sectionConfig.title);
        const fields = this.asObjectArray(sectionConfig.fields);

        if (!title || fields.length === 0) {
          this.logger.warn(`Entity detail section is invalid and will be skipped: ${sectionPath}`);
          continue;
        }

        sections.push({
          title,
          fields: fields as unknown as EntityDetailSectionConfig['fields']
        });
      } catch (error) {
        this.logger.warn(
          `Entity detail section cannot be parsed and will be skipped: ${sectionPath} (${String(error)})`
        );
      }
    }

    return sections;
  }

  private async loadRelatedLists(
    detailDirectoryPath: string,
    refs: unknown
  ): Promise<EntityRelatedListConfig[]> {
    if (!Array.isArray(refs)) {
      return [];
    }

    const relatedLists: EntityRelatedListConfig[] = [];

    for (const ref of refs) {
      const relativePath = typeof ref === 'string' ? ref.trim() : '';
      if (!relativePath) {
        continue;
      }

      const relatedListPath = path.resolve(detailDirectoryPath, relativePath);
      if (!existsSync(relatedListPath)) {
        this.logger.warn(`Entity related-list not found: ${relatedListPath}`);
        continue;
      }

      try {
        const relatedListConfig = await this.readJsonFile<Record<string, unknown>>(relatedListPath);
        const id = this.asNonEmptyString(relatedListConfig.id);
        const label = this.asNonEmptyString(relatedListConfig.label);
        const query = this.asObject(relatedListConfig.query);
        const columns = Array.isArray(relatedListConfig.columns)
          ? (relatedListConfig.columns.filter((column) => typeof column === 'string' || this.isObjectRecord(column)) as Array<
              string | Record<string, unknown>
            >)
          : [];

        if (!id || !label || !query || columns.length === 0) {
          this.logger.warn(`Entity related-list is invalid and will be skipped: ${relatedListPath}`);
          continue;
        }

        relatedLists.push({
          id,
          label,
          query: query as unknown as EntityRelatedListConfig['query'],
          columns: columns as unknown as EntityRelatedListConfig['columns'],
          description: this.asOptionalString(relatedListConfig.description),
          actions: this.asObjectArray(relatedListConfig.actions) as unknown as EntityRelatedListConfig['actions'] | undefined,
          rowActions: this.asObjectArray(relatedListConfig.rowActions) as unknown as EntityRelatedListConfig['rowActions'] | undefined,
          emptyState: this.asOptionalString(relatedListConfig.emptyState),
          pageSize: typeof relatedListConfig.pageSize === 'number' ? relatedListConfig.pageSize : undefined,
          entityId: this.asOptionalString(relatedListConfig.entityId)
        });
      } catch (error) {
        this.logger.warn(
          `Entity related-list cannot be parsed and will be skipped: ${relatedListPath} (${String(error)})`
        );
      }
    }

    return relatedLists;
  }

  private async loadFormConfig(entityDirectoryPath: string): Promise<EntityFormConfig | undefined> {
    const indexPath = path.resolve(entityDirectoryPath, 'form', 'index.json');
    if (!existsSync(indexPath)) {
      return undefined;
    }

    const indexConfig = await this.readJsonFile<Record<string, unknown>>(indexPath);
    const titleObject = this.asObject(indexConfig.title);
    const createTitle = this.asNonEmptyString(titleObject?.create);
    const editTitle = this.asNonEmptyString(titleObject?.edit);
    const query = this.asObject(indexConfig.query);

    if (!createTitle || !editTitle) {
      throw new BadRequestException(`Invalid form/index.json: title.create and title.edit are required`);
    }

    if (!query) {
      throw new BadRequestException(`Invalid form/index.json: query is required`);
    }

    const sections = await this.loadFormSections(path.resolve(entityDirectoryPath, 'form'), indexConfig.sections);
    if (sections.length === 0) {
      throw new BadRequestException(`Invalid form/index.json: sections are required`);
    }

    return {
      title: {
        create: createTitle,
        edit: editTitle
      },
      query: query as unknown as EntityFormConfig['query'],
      subtitle: this.asOptionalString(indexConfig.subtitle),
      sections
    };
  }

  private async loadFormSections(formDirectoryPath: string, refs: unknown): Promise<EntityFormSectionConfig[]> {
    if (!Array.isArray(refs)) {
      return [];
    }

    const sections: EntityFormSectionConfig[] = [];

    for (const ref of refs) {
      const relativePath = typeof ref === 'string' ? ref.trim() : '';
      if (!relativePath) {
        continue;
      }

      const sectionPath = path.resolve(formDirectoryPath, relativePath);
      if (!existsSync(sectionPath)) {
        this.logger.warn(`Entity form section not found: ${sectionPath}`);
        continue;
      }

      try {
        const sectionConfig = await this.readJsonFile<Record<string, unknown>>(sectionPath);
        const title = this.asOptionalString(sectionConfig.title);
        const fields = this.asObjectArray(sectionConfig.fields);
        if (fields.length === 0) {
          this.logger.warn(`Entity form section is invalid and will be skipped: ${sectionPath}`);
          continue;
        }

        sections.push({
          title,
          fields: fields as unknown as EntityFormSectionConfig['fields']
        });
      } catch (error) {
        this.logger.warn(`Entity form section cannot be parsed and will be skipped: ${sectionPath} (${String(error)})`);
      }
    }

    return sections;
  }

  private resolveObjectApiName(
    baseConfig: Record<string, unknown>,
    listConfig: EntityListConfig | undefined,
    detailConfig: EntityDetailConfig | undefined,
    formConfig: EntityFormConfig | undefined
  ): string {
    const fromBase = this.asNonEmptyString(baseConfig.objectApiName);
    if (fromBase) {
      return fromBase;
    }

    const fromList = listConfig?.views[0]?.query.object;
    if (typeof fromList === 'string' && fromList.trim().length > 0) {
      return fromList.trim();
    }

    const fromDetail = detailConfig?.query.object;
    if (typeof fromDetail === 'string' && fromDetail.trim().length > 0) {
      return fromDetail.trim();
    }

    const fromForm = formConfig?.query?.object;
    if (typeof fromForm === 'string' && fromForm.trim().length > 0) {
      return fromForm.trim();
    }

    throw new BadRequestException(`Entity config is invalid: objectApiName is required`);
  }

  private asNavigation(value: unknown): EntityConfig['navigation'] | undefined {
    const objectValue = this.asObject(value);
    if (!objectValue) {
      return undefined;
    }

    const basePath = this.asOptionalString(objectValue.basePath);
    if (!basePath) {
      return undefined;
    }

    return { basePath };
  }

  private asObject(value: unknown): Record<string, unknown> | null {
    return this.isObjectRecord(value) ? value : null;
  }

  private asObjectArray(value: unknown): Record<string, unknown>[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.filter((entry): entry is Record<string, unknown> => this.isObjectRecord(entry));
  }

  private asNonEmptyString(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private asOptionalString(value: unknown): string | undefined {
    const normalized = this.asNonEmptyString(value);
    return normalized ?? undefined;
  }

  private async readJsonFile<T>(absoluteFilePath: string): Promise<T> {
    const raw = await readFile(absoluteFilePath, 'utf8');
    return this.parseJson<T>(raw, absoluteFilePath);
  }

  private parseJson<T>(rawValue: string, sourceName: string): T {
    try {
      return JSON.parse(rawValue) as T;
    } catch {
      throw new BadRequestException(`Invalid JSON in ${sourceName}`);
    }
  }

  private isObjectRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
