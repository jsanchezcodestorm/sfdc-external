import { readFile } from 'node:fs/promises';

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { resolveConfigFile } from '../../common/utils/config-path.util';
import type { QueryTemplate } from '../query.types';

@Injectable()
export class QueryTemplateRepository {
  private readonly templateCache = new Map<string, QueryTemplate>();
  private readonly inFlightLoads = new Map<string, Promise<QueryTemplate>>();

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

  private async loadTemplate(templateId: string): Promise<QueryTemplate> {
    const filePath = resolveConfigFile(`queries/templates/${templateId}.json`);

    if (!filePath) {
      throw new NotFoundException(`Query template not found for ${templateId}`);
    }

    const rawTemplate = await readFile(filePath, 'utf8');
    const template = this.parseTemplate(rawTemplate, templateId);

    if (!template.soql || !template.objectApiName) {
      throw new BadRequestException(`Template ${templateId} is invalid`);
    }

    this.templateCache.set(templateId, template);
    return template;
  }

  private parseTemplate(rawTemplate: string, templateId: string): QueryTemplate {
    try {
      return JSON.parse(rawTemplate) as QueryTemplate;
    } catch {
      throw new BadRequestException(`Template ${templateId} is invalid JSON`);
    }
  }
}
