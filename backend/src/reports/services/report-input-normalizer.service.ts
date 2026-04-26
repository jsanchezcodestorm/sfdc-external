import { BadRequestException, Injectable } from '@nestjs/common';
import {
  ReportFolderAccessMode,
  ReportShareMode
} from '@prisma/client';

import type {
  ReportColumn,
  ReportFilter,
  ReportGrouping,
  ReportShareGrant,
  ReportSort
} from '../reports.types';
import type { ReportRecordWithRelations } from '../report-record.types';
import { ReportShareGrantNormalizerService } from './report-share-grant-normalizer.service';
import { ReportValueParserService } from './report-value-parser.service';

const MAX_PAGE_SIZE = 2000;
const DEFAULT_PAGE_SIZE = 50;
const MAX_REPORT_GROUPINGS = 2;

@Injectable()
export class ReportInputNormalizerService {
  constructor(
    private readonly shareGrantNormalizer: ReportShareGrantNormalizerService,
    private readonly valueParser: ReportValueParserService
  ) {}

  normalizeFolderInput(value: unknown): {
    label: string;
    description?: string;
    accessMode: 'personal' | 'shared';
    shares: ReportShareGrant[];
  } {
    const payload = this.valueParser.requireObject(value, 'folder payload must be an object');
    const label = this.valueParser.requireString(payload.label, 'folder.label is required');
    const accessMode = this.normalizeFolderAccessMode(payload.accessMode);
    const shares = this.normalizeShareGrants(Array.isArray(payload.shares) ? payload.shares : [], 'folder.shares');

    if (accessMode === 'personal' && shares.length > 0) {
      throw new BadRequestException('Personal folder does not accept share grants');
    }

    if (accessMode === 'shared' && shares.length === 0) {
      throw new BadRequestException('Shared folder requires at least one share grant');
    }

    return {
      label,
      description: this.valueParser.asOptionalString(payload.description),
      accessMode,
      shares
    };
  }

  normalizeReportInput(
    value: unknown,
    existing?: Pick<ReportRecordWithRelations, 'objectApiName'>
  ): {
    folderId: string;
    label: string;
    description?: string;
    objectApiName: string;
    columns: ReportColumn[];
    filters: ReportFilter[];
    groupings: ReportGrouping[];
    sort: ReportSort[];
    pageSize: number;
    shareMode: 'inherit' | 'restricted' | 'personal';
    shares: ReportShareGrant[];
  } {
    const payload = this.valueParser.requireObject(value, 'report payload must be an object');
    const folderId = this.valueParser.requireUuidString(payload.folderId, 'report.folderId');
    const label = this.valueParser.requireString(payload.label, 'report.label is required');
    const objectApiName = this.normalizeReportObjectApiName(payload.objectApiName, existing?.objectApiName);
    const columns = this.normalizeColumns(payload.columns);
    const filters = this.normalizeFilters(payload.filters);
    const groupings = this.normalizeGroupings(payload.groupings);
    const sort = this.normalizeSort(payload.sort);
    const pageSize = this.normalizePageSize(payload.pageSize);
    const shareMode = this.normalizeReportShareMode(payload.shareMode);
    const shares = this.normalizeShareGrants(Array.isArray(payload.shares) ? payload.shares : [], 'report.shares');

    if ((shareMode === 'inherit' || shareMode === 'personal') && shares.length > 0) {
      throw new BadRequestException(`Report shareMode ${shareMode} does not accept explicit share grants`);
    }

    if (shareMode === 'restricted' && shares.length === 0) {
      throw new BadRequestException('Restricted report requires at least one share grant');
    }

    return {
      folderId,
      label,
      description: this.valueParser.asOptionalString(payload.description),
      objectApiName,
      columns,
      filters,
      groupings,
      sort,
      pageSize,
      shareMode,
      shares
    };
  }

  normalizeShareGrants(value: unknown[], fieldName: string): ReportShareGrant[] {
    return this.shareGrantNormalizer.normalizeShareGrants(value, fieldName);
  }

  toFolderAccessMode(value: 'personal' | 'shared'): ReportFolderAccessMode {
    return value === 'shared' ? ReportFolderAccessMode.SHARED : ReportFolderAccessMode.PERSONAL;
  }

  fromFolderAccessMode(value: ReportFolderAccessMode): 'personal' | 'shared' {
    return value === ReportFolderAccessMode.SHARED ? 'shared' : 'personal';
  }

  toReportShareMode(value: 'inherit' | 'restricted' | 'personal'): ReportShareMode {
    switch (value) {
      case 'restricted':
        return ReportShareMode.RESTRICTED;
      case 'personal':
        return ReportShareMode.PERSONAL;
      default:
        return ReportShareMode.INHERIT;
    }
  }

  fromReportShareMode(value: ReportShareMode): 'inherit' | 'restricted' | 'personal' {
    switch (value) {
      case ReportShareMode.RESTRICTED:
        return 'restricted';
      case ReportShareMode.PERSONAL:
        return 'personal';
      default:
        return 'inherit';
    }
  }

  toShareSubjectType(value: 'contact' | 'permission') {
    return this.shareGrantNormalizer.toShareSubjectType(value);
  }

  clamp(value: number, min: number, max: number): number {
    return this.valueParser.clamp(value, min, max);
  }

  private normalizeColumns(value: unknown): ReportColumn[] {
    if (!Array.isArray(value)) {
      throw new BadRequestException('report.columns must be an array');
    }

    const columns = value.map((entry, index) => {
      const column = this.valueParser.requireObject(entry, `report.columns[${index}] must be an object`);
      return {
        field: this.valueParser.requireString(column.field, `report.columns[${index}].field is required`),
        label: this.valueParser.asOptionalString(column.label)
      } satisfies ReportColumn;
    });

    if (columns.length === 0) {
      throw new BadRequestException('report.columns must contain at least one field');
    }

    this.valueParser.assertUniqueFieldSequence(columns.map((column) => column.field), 'report.columns');
    return columns;
  }

  private normalizeFilters(value: unknown): ReportFilter[] {
    if (value === undefined || value === null) {
      return [];
    }

    if (!Array.isArray(value)) {
      throw new BadRequestException('report.filters must be an array');
    }

    return value.map((entry, index) => {
      const filter = this.valueParser.requireObject(entry, `report.filters[${index}] must be an object`);
      const operator = this.valueParser.requireString(filter.operator, `report.filters[${index}].operator is required`) as ReportFilter['operator'];
      const normalizedOperator = this.valueParser.normalizeFilterOperator(operator, `report.filters[${index}].operator`);
      const normalizedValue = this.valueParser.normalizeFilterValue(filter.value, normalizedOperator, `report.filters[${index}].value`);

      return {
        field: this.valueParser.requireString(filter.field, `report.filters[${index}].field is required`),
        operator: normalizedOperator,
        value: normalizedValue
      };
    });
  }

  private normalizeGroupings(value: unknown): ReportGrouping[] {
    if (value === undefined || value === null) {
      return [];
    }

    if (!Array.isArray(value)) {
      throw new BadRequestException('report.groupings must be an array');
    }

    if (value.length > MAX_REPORT_GROUPINGS) {
      throw new BadRequestException(`report.groupings supports at most ${MAX_REPORT_GROUPINGS} levels`);
    }

    const groupings = value.map((entry, index) => {
      const grouping = this.valueParser.requireObject(entry, `report.groupings[${index}] must be an object`);
      return {
        field: this.valueParser.requireString(grouping.field, `report.groupings[${index}].field is required`),
        label: this.valueParser.asOptionalString(grouping.label)
      } satisfies ReportGrouping;
    });

    this.valueParser.assertUniqueFieldSequence(groupings.map((grouping) => grouping.field), 'report.groupings');
    return groupings;
  }

  private normalizeSort(value: unknown): ReportSort[] {
    if (value === undefined || value === null) {
      return [];
    }

    if (!Array.isArray(value)) {
      throw new BadRequestException('report.sort must be an array');
    }

    const sort = value.map((entry, index) => {
      const row = this.valueParser.requireObject(entry, `report.sort[${index}] must be an object`);
      const direction = this.valueParser.asOptionalString(row.direction);
      if (direction && direction.toUpperCase() !== 'ASC' && direction.toUpperCase() !== 'DESC') {
        throw new BadRequestException(`report.sort[${index}].direction is invalid`);
      }

      return {
        field: this.valueParser.requireString(row.field, `report.sort[${index}].field is required`),
        direction: direction ? (direction.toUpperCase() as 'ASC' | 'DESC') : undefined
      } satisfies ReportSort;
    });

    this.valueParser.assertUniqueFieldSequence(sort.map((entry) => entry.field), 'report.sort');
    return sort;
  }

  private normalizeReportObjectApiName(value: unknown, existingObjectApiName: string | undefined): string {
    if (existingObjectApiName) {
      const nextValue = this.valueParser.asOptionalString(value);
      if (!nextValue) {
        return existingObjectApiName;
      }

      if (nextValue !== existingObjectApiName) {
        throw new BadRequestException('report.objectApiName cannot change after creation');
      }

      return existingObjectApiName;
    }

    return this.valueParser.requireString(value, 'report.objectApiName is required');
  }

  private normalizeFolderAccessMode(value: unknown): 'personal' | 'shared' {
    const normalized = this.valueParser.asOptionalString(value)?.toLowerCase() ?? 'personal';
    if (normalized !== 'personal' && normalized !== 'shared') {
      throw new BadRequestException('folder.accessMode is invalid');
    }

    return normalized;
  }

  private normalizeReportShareMode(value: unknown): 'inherit' | 'restricted' | 'personal' {
    const normalized = this.valueParser.asOptionalString(value)?.toLowerCase() ?? 'inherit';
    if (normalized !== 'inherit' && normalized !== 'restricted' && normalized !== 'personal') {
      throw new BadRequestException('report.shareMode is invalid');
    }

    return normalized;
  }

  private normalizePageSize(value: unknown): number {
    if (value === undefined || value === null || value === '') {
      return DEFAULT_PAGE_SIZE;
    }

    if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > MAX_PAGE_SIZE) {
      throw new BadRequestException(`report.pageSize must be an integer between 1 and ${MAX_PAGE_SIZE}`);
    }

    return value;
  }

}
