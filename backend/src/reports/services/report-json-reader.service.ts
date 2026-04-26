import { BadRequestException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import type { ReportColumn, ReportFilter, ReportGrouping, ReportSort } from '../reports.types';
import { ReportValueParserService } from './report-value-parser.service';

@Injectable()
export class ReportJsonReaderService {
  constructor(private readonly valueParser: ReportValueParserService) {}

  readColumns(value: Prisma.JsonValue, fieldName: string): ReportColumn[] {
    if (!Array.isArray(value)) {
      throw new BadRequestException(`${fieldName} is invalid`);
    }

    return value.map((entry, index) => {
      const column = this.valueParser.requireObject(entry, `${fieldName}[${index}] must be an object`);
      return {
        field: this.valueParser.requireString(column.field, `${fieldName}[${index}].field is required`),
        label: this.valueParser.asOptionalString(column.label)
      };
    });
  }

  readFilters(value: Prisma.JsonValue, fieldName: string): ReportFilter[] {
    if (!Array.isArray(value)) {
      throw new BadRequestException(`${fieldName} is invalid`);
    }

    return value.map((entry, index) => {
      const filter = this.valueParser.requireObject(entry, `${fieldName}[${index}] must be an object`);
      const operator = this.valueParser.normalizeFilterOperator(
        this.valueParser.requireString(filter.operator, `${fieldName}[${index}].operator is required`),
        `${fieldName}[${index}].operator`
      );

      return {
        field: this.valueParser.requireString(filter.field, `${fieldName}[${index}].field is required`),
        operator,
        value: this.valueParser.normalizeFilterValue(filter.value, operator, `${fieldName}[${index}].value`)
      };
    });
  }

  readGroupings(value: Prisma.JsonValue, fieldName: string): ReportGrouping[] {
    if (!Array.isArray(value)) {
      throw new BadRequestException(`${fieldName} is invalid`);
    }

    return value.map((entry, index) => {
      const grouping = this.valueParser.requireObject(entry, `${fieldName}[${index}] must be an object`);
      return {
        field: this.valueParser.requireString(grouping.field, `${fieldName}[${index}].field is required`),
        label: this.valueParser.asOptionalString(grouping.label)
      };
    });
  }

  readSort(value: Prisma.JsonValue, fieldName: string): ReportSort[] {
    if (!Array.isArray(value)) {
      throw new BadRequestException(`${fieldName} is invalid`);
    }

    return value.map((entry, index) => {
      const sort = this.valueParser.requireObject(entry, `${fieldName}[${index}] must be an object`);
      const direction = this.valueParser.asOptionalString(sort.direction);
      return {
        field: this.valueParser.requireString(sort.field, `${fieldName}[${index}].field is required`),
        direction: direction ? (direction.toUpperCase() as 'ASC' | 'DESC') : undefined
      };
    });
  }
}
