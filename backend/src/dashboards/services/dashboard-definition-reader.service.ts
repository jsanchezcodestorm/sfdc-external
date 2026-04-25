import { BadRequestException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import type { ReportColumn, ReportFilter } from '../../reports/reports.types';
import type { SourceReportRecord } from '../dashboard-records.types';
import type {
  DashboardFilterDefinition,
  DashboardMetricDefinition,
  DashboardRuntimeReportContext,
  DashboardWidgetDefinition
} from '../dashboards.types';
import { DashboardValueService } from './dashboard-value.service';
import { DashboardWidgetInputNormalizerService } from './dashboard-widget-input-normalizer.service';

@Injectable()
export class DashboardDefinitionReaderService {
  constructor(
    private readonly widgetInputNormalizer: DashboardWidgetInputNormalizerService,
    private readonly valueService: DashboardValueService
  ) {}

  readDashboardSourceReportContext(report: SourceReportRecord): DashboardRuntimeReportContext {
    return {
      objectApiName: report.objectApiName,
      filters: this.readReportFilters(report.filtersJson, `sourceReport ${report.id}.filters`)
    };
  }

  readDashboardFilters(value: Prisma.JsonValue, fieldName: string): DashboardFilterDefinition[] {
    if (!Array.isArray(value)) {
      throw new BadRequestException(`${fieldName} is invalid`);
    }

    return value.map((entry, index) => {
      const filter = this.valueService.requireObject(entry, `${fieldName}[${index}] must be an object`);
      return {
        field: this.valueService.requireString(filter.field, `${fieldName}[${index}].field is required`),
        label: this.valueService.asOptionalString(filter.label)
      };
    });
  }

  readDashboardWidgets(
    widgetsValue: Prisma.JsonValue,
    layoutValue: Prisma.JsonValue,
    fieldName: string
  ): DashboardWidgetDefinition[] {
    if (!Array.isArray(widgetsValue) || !Array.isArray(layoutValue)) {
      throw new BadRequestException(`${fieldName} is invalid`);
    }

    const layoutMap = new Map(
      layoutValue.map((entry, index) => {
        const layout = this.valueService.requireObject(entry, `${fieldName}.layout[${index}] must be an object`);
        const widgetId = this.valueService.requireString(layout.widgetId, `${fieldName}.layout[${index}].widgetId is required`);
        return [
          widgetId,
          {
            widgetId,
            x: this.valueService.requireInteger(layout.x, `${fieldName}.layout[${index}].x is required`),
            y: this.valueService.requireInteger(layout.y, `${fieldName}.layout[${index}].y is required`),
            w: this.valueService.requireInteger(layout.w, `${fieldName}.layout[${index}].w is required`),
            h: this.valueService.requireInteger(layout.h, `${fieldName}.layout[${index}].h is required`)
          }
        ];
      })
    );

    return widgetsValue.map((entry, index) => {
      const widget = this.valueService.requireObject(entry, `${fieldName}[${index}] must be an object`);
      const id = this.valueService.requireString(widget.id, `${fieldName}[${index}].id is required`);
      const title = this.valueService.requireString(widget.title, `${fieldName}[${index}].title is required`);
      const layout = layoutMap.get(id);
      if (!layout) {
        throw new BadRequestException(`${fieldName}[${index}] is invalid: missing layout entry`);
      }
      const type = this.valueService.requireString(widget.type, `${fieldName}[${index}].type is required`);

      switch (type) {
        case 'kpi':
          return {
            id,
            type,
            title,
            layout,
            metric: this.readMetricDefinition(widget.metric, `${fieldName}[${index}].metric`)
          };
        case 'chart':
          return {
            id,
            type,
            title,
            layout,
            chartType: this.widgetInputNormalizer.normalizeChartType(widget.chartType, `${fieldName}[${index}].chartType`),
            dimensionField: this.valueService.requireString(widget.dimensionField, `${fieldName}[${index}].dimensionField is required`),
            dimensionLabel: this.valueService.asOptionalString(widget.dimensionLabel),
            metric: this.readMetricDefinition(widget.metric, `${fieldName}[${index}].metric`),
            limit: this.valueService.asOptionalNumber(widget.limit) ?? undefined,
            sortDirection: this.valueService.asOptionalString(widget.sortDirection)?.toUpperCase() as 'ASC' | 'DESC' | undefined
          };
        case 'table': {
          const displayMode = this.widgetInputNormalizer.normalizeTableDisplayMode(widget.displayMode, `${fieldName}[${index}].displayMode`);
          if (displayMode === 'rows') {
            return {
              id,
              type,
              title,
              layout,
              displayMode,
              columns: this.readReportColumns(widget.columns, `${fieldName}[${index}].columns`),
              limit: this.valueService.asOptionalNumber(widget.limit) ?? undefined
            };
          }

          return {
            id,
            type,
            title,
            layout,
            displayMode,
            dimensionField: this.valueService.requireString(widget.dimensionField, `${fieldName}[${index}].dimensionField is required`),
            dimensionLabel: this.valueService.asOptionalString(widget.dimensionLabel),
            metric: this.readMetricDefinition(widget.metric, `${fieldName}[${index}].metric`),
            limit: this.valueService.asOptionalNumber(widget.limit) ?? undefined,
            sortDirection: this.valueService.asOptionalString(widget.sortDirection)?.toUpperCase() as 'ASC' | 'DESC' | undefined
          };
        }
        default:
          throw new BadRequestException(`${fieldName}[${index}].type is invalid`);
      }
    });
  }

  readMetricDefinition(value: unknown, path: string): DashboardMetricDefinition {
    const metric = this.valueService.requireObject(value, `${path} must be an object`);
    const operation = this.valueService.requireString(metric.operation, `${path}.operation is required`).toUpperCase();

    if (operation === 'COUNT') {
      return {
        operation,
        label: this.valueService.asOptionalString(metric.label)
      };
    }

    if (operation === 'SUM' || operation === 'AVG' || operation === 'MIN' || operation === 'MAX') {
      return {
        operation,
        field: this.valueService.requireString(metric.field, `${path}.field is required`),
        label: this.valueService.asOptionalString(metric.label)
      };
    }

    throw new BadRequestException(`${path}.operation is invalid`);
  }

  readReportColumns(value: unknown, fieldName: string): ReportColumn[] {
    if (!Array.isArray(value)) {
      throw new BadRequestException(`${fieldName} is invalid`);
    }

    return value.map((entry, index) => {
      const column = this.valueService.requireObject(entry, `${fieldName}[${index}] must be an object`);
      return {
        field: this.valueService.requireString(column.field, `${fieldName}[${index}].field is required`),
        label: this.valueService.asOptionalString(column.label)
      };
    });
  }

  readReportFilters(value: Prisma.JsonValue, fieldName: string): ReportFilter[] {
    if (!Array.isArray(value)) {
      throw new BadRequestException(`${fieldName} is invalid`);
    }

    return value.map((entry, index) => {
      const filter = this.valueService.requireObject(entry, `${fieldName}[${index}] must be an object`);
      const operator = this.valueService.requireString(filter.operator, `${fieldName}[${index}].operator is required`) as ReportFilter['operator'];
      return {
        field: this.valueService.requireString(filter.field, `${fieldName}[${index}].field is required`),
        operator: this.valueService.normalizeReportFilterOperator(operator, `${fieldName}[${index}].operator`),
        value: this.valueService.normalizeReportFilterValue(filter.value, operator, `${fieldName}[${index}].value`)
      };
    });
  }

  toWidgetsJson(widgets: DashboardWidgetDefinition[]): Prisma.InputJsonValue {
    return widgets.map((widget) => {
      const { layout, ...storedWidget } = widget;
      return storedWidget;
    }) as unknown as Prisma.InputJsonValue;
  }

  toLayoutJson(widgets: DashboardWidgetDefinition[]): Prisma.InputJsonValue {
    return widgets.map((widget) => widget.layout) as unknown as Prisma.InputJsonValue;
  }
}
