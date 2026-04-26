import { BadRequestException, Injectable } from '@nestjs/common';
import { ReportShareSubjectType } from '@prisma/client';

import type { ReportShareGrant } from '../reports.types';
import { ReportValueParserService } from './report-value-parser.service';

const SALESFORCE_ID_PATTERN = /^[A-Za-z0-9]{15}(?:[A-Za-z0-9]{3})?$/;

@Injectable()
export class ReportShareGrantNormalizerService {
  constructor(private readonly valueParser: ReportValueParserService) {}

  normalizeShareGrants(value: unknown[], fieldName: string): ReportShareGrant[] {
    if (!Array.isArray(value)) {
      throw new BadRequestException(`${fieldName} must be an array`);
    }

    const shares = value.map((entry, index) => {
      const share = this.valueParser.requireObject(entry, `${fieldName}[${index}] must be an object`);
      const subjectType = this.valueParser.requireString(share.subjectType, `${fieldName}[${index}].subjectType is required`);
      const normalizedType = this.normalizeShareSubjectType(subjectType, `${fieldName}[${index}].subjectType`);
      const subjectId = this.valueParser.requireString(share.subjectId, `${fieldName}[${index}].subjectId is required`);

      if (normalizedType === 'contact' && !SALESFORCE_ID_PATTERN.test(subjectId)) {
        throw new BadRequestException(`${fieldName}[${index}].subjectId must be a valid Salesforce Contact id`);
      }

      return {
        subjectType: normalizedType,
        subjectId
      } satisfies ReportShareGrant;
    });

    const uniqueKeys = new Set(shares.map((share) => `${share.subjectType}:${share.subjectId}`));
    if (uniqueKeys.size !== shares.length) {
      throw new BadRequestException(`${fieldName} must not contain duplicates`);
    }

    return shares;
  }

  toShareSubjectType(value: 'contact' | 'permission'): ReportShareSubjectType {
    return value === 'permission' ? ReportShareSubjectType.PERMISSION : ReportShareSubjectType.CONTACT;
  }

  private normalizeShareSubjectType(value: string, fieldName: string): 'contact' | 'permission' {
    const normalized = value.trim().toLowerCase();
    if (normalized !== 'contact' && normalized !== 'permission') {
      throw new BadRequestException(`${fieldName} is invalid`);
    }

    return normalized;
  }
}
