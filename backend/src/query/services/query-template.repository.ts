import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../../prisma/generated/client';

import { PrismaService } from '../../prisma/prisma.service';
import type { QueryTemplate } from '../query.types';

@Injectable()
export class QueryTemplateRepository {
  private readonly templateCache = new Map<string, QueryTemplate>();
  private readonly inFlightLoads = new Map<string, Promise<QueryTemplate>>();

  constructor(private readonly prisma: PrismaService) {}

  async getTemplate(templateId: string): Promise<QueryTemplate> {
    const cached = this.templateCache.get(templateId);
    if (cached) {
      return cached;
    }

    const inFlight = this.inFlightLoads.get(templateId);
    if (inFlight) {
      return inFlight;
    }

    const loadPromise = this.loadTemplate(templateId).finally(() => {
      this.inFlightLoads.delete(templateId);
    });

    this.inFlightLoads.set(templateId, loadPromise);
    return loadPromise;
  }

  evictTemplate(templateId?: string): void {
    if (!templateId) {
      this.templateCache.clear();
      this.inFlightLoads.clear();
      return;
    }

    this.templateCache.delete(templateId);
    this.inFlightLoads.delete(templateId);
  }

  private async loadTemplate(templateId: string): Promise<QueryTemplate> {
    const record = await this.prisma.queryTemplateRecord.findUnique({
      where: { id: templateId }
    });

    if (!record) {
      throw new NotFoundException(`Query template not found for ${templateId}`);
    }

    const template = this.mapRecord(record);
    this.templateCache.set(templateId, template);
    return template;
  }

  private mapRecord(record: Prisma.QueryTemplateRecordGetPayload<object>): QueryTemplate {
    if (!record.soql || !record.objectApiName) {
      throw new BadRequestException(`Template ${record.id} is invalid`);
    }

    return {
      id: record.id,
      objectApiName: record.objectApiName,
      description: record.description ?? undefined,
      soql: record.soql,
      defaultParams: this.asDefaultParams(record.defaultParamsJson, record.id),
      maxLimit: typeof record.maxLimit === 'number' ? record.maxLimit : undefined
    };
  }

  private asDefaultParams(value: Prisma.JsonValue | null, templateId: string): QueryTemplate['defaultParams'] | undefined {
    if (value === null) {
      return undefined;
    }

    if (Array.isArray(value) || typeof value !== 'object') {
      throw new BadRequestException(`Template ${templateId} has invalid defaultParams`);
    }

    const entries = Object.entries(value);
    const result: NonNullable<QueryTemplate['defaultParams']> = {};

    for (const [key, entry] of entries) {
      if (typeof entry === 'string' || typeof entry === 'boolean') {
        result[key] = entry;
        continue;
      }

      if (typeof entry === 'number' && Number.isFinite(entry)) {
        result[key] = entry;
        continue;
      }

      throw new BadRequestException(`Template ${templateId} has invalid defaultParams.${key}`);
    }

    return Object.keys(result).length > 0 ? result : undefined;
  }
}
