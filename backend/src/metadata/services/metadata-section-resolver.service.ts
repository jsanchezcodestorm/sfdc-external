import { BadRequestException, Injectable } from '@nestjs/common';

import type { MetadataSectionName, MetadataTypeName } from '../metadata.types';
import { requireString, SECTION_TO_TYPES, TYPE_ORDER } from './metadata-common';

@Injectable()
export class MetadataSectionResolverService {
  resolveRequestedTypeNames(sectionInputs?: string[]): MetadataTypeName[] {
    if (!sectionInputs || sectionInputs.length === 0) {
      return [...TYPE_ORDER];
    }

    const resolved = new Set<MetadataTypeName>();
    for (const sectionInput of sectionInputs) {
      const section = this.normalizeSectionName(sectionInput);
      for (const typeName of SECTION_TO_TYPES[section]) {
        resolved.add(typeName);
      }
    }

    return TYPE_ORDER.filter((typeName) => resolved.has(typeName));
  }

  private normalizeSectionName(value: string): MetadataSectionName {
    const normalized = requireString(value, 'section name is required') as MetadataSectionName;
    if (!Object.hasOwn(SECTION_TO_TYPES, normalized)) {
      throw new BadRequestException(`Unsupported metadata section ${value}`);
    }

    return normalized;
  }
}
