import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common/enums/request-method.enum';
import { ModulesContainer } from '@nestjs/core';
import {
  KNOWN_ROUTE_DEFINITIONS,
} from '@sfdc-external/shared';

import { ACL_METADATA_KEY } from '../app.constants';
import { PrismaService } from '../prisma/prisma.service';

import { AclAdminConfigRepository } from './acl-admin-config.repository';
import { AclConfigRepository } from './acl-config.repository';
import { AclService } from './acl.service';
import type { AclResourceConfig, AclResourceType } from './acl.types';

interface DiscoveredSystemResource {
  id: string;
  type: AclResourceType;
  target?: string;
  description?: string;
  sourceType: AclResourceType;
  sourceRef: string;
}

export interface AclResourceSyncResult {
  discoveredCount: number;
  createdCount: number;
  updatedCount: number;
  staleCount: number;
}

interface RestDiscoveryDetails {
  controllerNames: Set<string>;
  endpointPaths: Set<string>;
  handlerRefs: Set<string>;
  requestMethods: Set<string>;
}

@Injectable()
export class AclResourceSyncService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AclResourceSyncService.name);
  private syncPromise: Promise<AclResourceSyncResult> | null = null;

  constructor(
    private readonly modulesContainer: ModulesContainer,
    private readonly prisma: PrismaService,
    private readonly aclConfigRepository: AclConfigRepository,
    private readonly aclAdminConfigRepository: AclAdminConfigRepository,
    private readonly aclService: AclService
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.syncSystemResources();
  }

  async syncSystemResources(): Promise<AclResourceSyncResult> {
    if (this.syncPromise) {
      return this.syncPromise;
    }

    this.syncPromise = this.syncSystemResourcesInternal().finally(() => {
      this.syncPromise = null;
    });

    return this.syncPromise;
  }

  async isReservedResourceId(resourceId: string): Promise<boolean> {
    const discoveredResources = await this.discoverSystemResources();
    return discoveredResources.some((resource) => resource.id === resourceId);
  }

  private async syncSystemResourcesInternal(): Promise<AclResourceSyncResult> {
    const [snapshot, discoveredResources] = await Promise.all([
      this.aclConfigRepository.loadSnapshot(),
      this.discoverSystemResources()
    ]);

    const discoveredById = new Map(discoveredResources.map((resource) => [resource.id, resource]));
    let createdCount = 0;
    let updatedCount = 0;
    let staleCount = 0;

    const nextResources = snapshot.resources.map((resource) => {
      const discovered = discoveredById.get(resource.id);

      if (discovered) {
        discoveredById.delete(resource.id);
        const merged = this.mergeDiscoveredResource(resource, discovered);
        if (!this.resourcesEqual(resource, merged)) {
          updatedCount += 1;
        }

        return merged;
      }

      if (resource.managedBy === 'system' && resource.syncState !== 'stale') {
        staleCount += 1;
        return {
          ...resource,
          syncState: 'stale'
        } satisfies AclResourceConfig;
      }

      return resource;
    });

    for (const discovered of discoveredById.values()) {
      createdCount += 1;
      nextResources.push({
        id: discovered.id,
        type: discovered.type,
        accessMode: 'disabled',
        managedBy: 'system',
        syncState: 'present',
        sourceType: discovered.sourceType,
        sourceRef: discovered.sourceRef,
        target: discovered.target,
        description: discovered.description,
        permissions: []
      });
    }

    nextResources.sort((left, right) => left.id.localeCompare(right.id));
    const result: AclResourceSyncResult = {
      discoveredCount: discoveredResources.length,
      createdCount,
      updatedCount,
      staleCount
    };

    if (createdCount === 0 && updatedCount === 0 && staleCount === 0) {
      return result;
    }

    await this.aclAdminConfigRepository.replaceResources(nextResources);
    await this.aclService.reload();
    this.logger.log(
      `ACL system resource sync completed: discovered=${result.discoveredCount}, created=${createdCount}, updated=${updatedCount}, stale=${staleCount}.`
    );

    return result;
  }

  private mergeDiscoveredResource(
    resource: AclResourceConfig,
    discovered: DiscoveredSystemResource
  ): AclResourceConfig {
    return {
      ...resource,
      type: discovered.type,
      target: discovered.target,
      description: discovered.description,
      managedBy: 'system',
      syncState: 'present',
      sourceType: discovered.sourceType,
      sourceRef: discovered.sourceRef
    };
  }

  private async discoverSystemResources(): Promise<DiscoveredSystemResource[]> {
    const [entityRows, queryTemplateRows] = await Promise.all([
      this.prisma.entityConfigRecord.findMany({
        orderBy: { id: 'asc' },
        select: {
          id: true,
          label: true,
          objectApiName: true
        }
      }),
      this.prisma.queryTemplateRecord.findMany({
        orderBy: { id: 'asc' },
        select: {
          id: true,
          objectApiName: true,
          description: true
        }
      })
    ]);

    const resources = new Map<string, DiscoveredSystemResource>();

    for (const resource of this.discoverRestResources()) {
      resources.set(resource.id, resource);
    }

    for (const route of KNOWN_ROUTE_DEFINITIONS) {
      resources.set(route.id, {
        id: route.id,
        type: 'route',
        target: route.path,
        description: route.description,
        sourceType: 'route',
        sourceRef: route.id
      });
    }

    for (const entity of entityRows) {
      resources.set(`entity:${entity.id}`, {
        id: `entity:${entity.id}`,
        type: 'entity',
        target: entity.objectApiName,
        description: `Entity ${entity.label} (${entity.objectApiName})`,
        sourceType: 'entity',
        sourceRef: entity.id
      });
    }

    for (const template of queryTemplateRows) {
      resources.set(`query:${template.id}`, {
        id: `query:${template.id}`,
        type: 'query',
        target: template.objectApiName,
        description: template.description?.trim() || `Query template ${template.id} (${template.objectApiName})`,
        sourceType: 'query',
        sourceRef: template.id
      });
    }

    return [...resources.values()].sort((left, right) => left.id.localeCompare(right.id));
  }

  private discoverRestResources(): DiscoveredSystemResource[] {
    const resources = new Map<string, RestDiscoveryDetails>();

    for (const moduleRef of this.modulesContainer.values()) {
      for (const controllerRef of moduleRef.controllers.values()) {
        const controller = controllerRef.metatype;
        if (!controller?.prototype) {
          continue;
        }

        const controllerName = controller.name ?? 'AnonymousController';
        const controllerPaths = this.readPathMetadata(controller);
        const classResourceId = this.readAclResourceId(controller);

        for (const propertyName of Object.getOwnPropertyNames(controller.prototype)) {
          if (propertyName === 'constructor') {
            continue;
          }

          const handler = controller.prototype[propertyName];
          if (typeof handler !== 'function') {
            continue;
          }

          const resourceId = this.readAclResourceId(handler) ?? classResourceId;
          if (!resourceId || !resourceId.startsWith('rest:')) {
            continue;
          }

          const requestMethod = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;
          if (requestMethod === undefined) {
            continue;
          }

          const details = resources.get(resourceId) ?? {
            controllerNames: new Set<string>(),
            endpointPaths: new Set<string>(),
            handlerRefs: new Set<string>(),
            requestMethods: new Set<string>()
          };

          details.controllerNames.add(controllerName);
          details.handlerRefs.add(`${controllerName}.${propertyName}`);
          details.requestMethods.add(RequestMethod[requestMethod]);

          for (const endpointPath of this.combineRoutePaths(
            controllerPaths,
            this.readPathMetadata(handler)
          )) {
            details.endpointPaths.add(endpointPath);
          }

          resources.set(resourceId, details);
        }
      }
    }

    return [...resources.entries()]
      .map(([resourceId, details]) => ({
        id: resourceId,
        type: 'rest' as const,
        target: this.pickTarget(details.endpointPaths),
        description: this.buildRestDescription(details),
        sourceType: 'rest' as const,
        sourceRef: [...details.handlerRefs].sort()[0] ?? resourceId
      }))
      .sort((left, right) => left.id.localeCompare(right.id));
  }

  private combineRoutePaths(controllerPaths: string[], methodPaths: string[]): string[] {
    const normalizedControllerPaths = controllerPaths.length > 0 ? controllerPaths : [''];
    const normalizedMethodPaths = methodPaths.length > 0 ? methodPaths : [''];
    const combined = new Set<string>();

    for (const controllerPath of normalizedControllerPaths) {
      for (const methodPath of normalizedMethodPaths) {
        combined.add(this.joinPathSegments(controllerPath, methodPath));
      }
    }

    return [...combined].sort((left, right) => left.localeCompare(right));
  }

  private readPathMetadata(target: object): string[] {
    const metadata = Reflect.getMetadata(PATH_METADATA, target) as string | string[] | undefined;
    if (Array.isArray(metadata)) {
      return metadata.map((entry) => this.normalizePath(entry));
    }

    return metadata ? [this.normalizePath(metadata)] : [];
  }

  private readAclResourceId(target: object): string | undefined {
    const value = Reflect.getMetadata(ACL_METADATA_KEY, target) as string | undefined;
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
  }

  private normalizePath(value: string): string {
    const trimmed = value.trim();
    if (trimmed.length === 0 || trimmed === '/') {
      return '';
    }

    return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  }

  private joinPathSegments(left: string, right: string): string {
    const leftPath = this.normalizePath(left);
    const rightPath = this.normalizePath(right);
    const combined = `${leftPath}/${rightPath}`.replace(/\/+/g, '/');
    return combined === '/' ? '/' : combined.replace(/\/$/, '') || '/';
  }

  private pickTarget(paths: ReadonlySet<string>): string | undefined {
    const sortedPaths = [...paths].sort((left, right) => left.localeCompare(right));
    return sortedPaths[0];
  }

  private buildRestDescription(details: RestDiscoveryDetails): string {
    const endpoints = [...details.endpointPaths].sort((left, right) => left.localeCompare(right));
    const methods = [...details.requestMethods].sort((left, right) => left.localeCompare(right));
    const controllerCount = details.controllerNames.size;
    const samplePath = endpoints[0];
    const sampleMethod = methods[0];

    if (samplePath && sampleMethod) {
      return `Discovered from ${controllerCount} controller(s), example ${sampleMethod} ${samplePath}.`;
    }

    return `Discovered from ${controllerCount} controller(s) with explicit ACL metadata.`;
  }

  private resourcesEqual(left: AclResourceConfig, right: AclResourceConfig): boolean {
    return JSON.stringify(left) === JSON.stringify(right);
  }
}
