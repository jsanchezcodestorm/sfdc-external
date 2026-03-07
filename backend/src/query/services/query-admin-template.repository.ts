import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import type { QueryTemplate } from '../query.types';

function toNullableJson(
  value: QueryTemplate['defaultParams']
): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput {
  if (!value || Object.keys(value).length === 0) {
    return Prisma.JsonNull;
  }

  return value as Prisma.InputJsonValue;
}

export interface QueryTemplateAdminSummary {
  id: string;
  objectApiName: string;
  description?: string;
  updatedAt: string;
}

@Injectable()
export class QueryAdminTemplateRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listSummaries(): Promise<QueryTemplateAdminSummary[]> {
    const rows = await this.prisma.queryTemplateRecord.findMany({
      orderBy: { id: 'asc' }
    });

    return rows.map((row) => ({
      id: row.id,
      objectApiName: row.objectApiName,
      description: row.description ?? undefined,
      updatedAt: row.updatedAt.toISOString()
    }));
  }

  async getTemplate(templateId: string): Promise<QueryTemplate> {
    const row = await this.prisma.queryTemplateRecord.findUnique({
      where: { id: templateId }
    });

    if (!row) {
      throw new NotFoundException(`Query template not found for ${templateId}`);
    }

    return this.mapTemplate(row);
  }

  async upsertTemplate(template: QueryTemplate): Promise<void> {
    await this.prisma.queryTemplateRecord.upsert({
      where: { id: template.id },
      create: {
        id: template.id,
        objectApiName: template.objectApiName,
        description: template.description ?? null,
        soql: template.soql,
        defaultParamsJson: toNullableJson(template.defaultParams),
        maxLimit: typeof template.maxLimit === 'number' ? template.maxLimit : null
      },
      update: {
        objectApiName: template.objectApiName,
        description: template.description ?? null,
        soql: template.soql,
        defaultParamsJson: toNullableJson(template.defaultParams),
        maxLimit: typeof template.maxLimit === 'number' ? template.maxLimit : null
      }
    });
  }

  async deleteTemplate(templateId: string): Promise<void> {
    try {
      await this.prisma.queryTemplateRecord.delete({
        where: { id: templateId }
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException(`Query template not found for ${templateId}`);
      }

      throw error;
    }
  }

  private mapTemplate(row: Prisma.QueryTemplateRecordGetPayload<object>): QueryTemplate {
    const defaultParams = row.defaultParamsJson;

    return {
      id: row.id,
      objectApiName: row.objectApiName,
      description: row.description ?? undefined,
      soql: row.soql,
      defaultParams:
        defaultParams && !Array.isArray(defaultParams) && typeof defaultParams === 'object'
          ? (defaultParams as QueryTemplate['defaultParams'])
          : undefined,
      maxLimit: typeof row.maxLimit === 'number' ? row.maxLimit : undefined
    };
  }
}
