import { BadRequestException, Injectable } from '@nestjs/common';

import type { ReportColumn } from '../../reports/reports.types';
import {
  GRID_COLUMNS,
  MAX_DASHBOARD_WIDGETS,
  MAX_WIDGET_LIMIT
} from '../dashboard-runtime.constants';
import type {
  DashboardChartWidgetDefinition,
  DashboardMetricDefinition,
  DashboardWidgetDefinition
} from '../dashboards.types';
import { DashboardValueService } from './dashboard-value.service';

@Injectable()
export class DashboardWidgetInputNormalizerService {
  constructor(private readonly valueService: DashboardValueService) {}

  normalizeDashboardWidgets(value: unknown): DashboardWidgetDefinition[] {
    if (!Array.isArray(value)) {
      throw new BadRequestException('dashboard.widgets must be an array');
    }

    if (value.length === 0) {
      throw new BadRequestException('dashboard.widgets must contain at least one widget');
    }

    if (value.length > MAX_DASHBOARD_WIDGETS) {
      throw new BadRequestException(`dashboard.widgets supports at most ${MAX_DASHBOARD_WIDGETS} widgets`);
    }

    const widgets = value.map((entry, index) => this.normalizeDashboardWidget(entry, index));
    const uniqueIds = new Set(widgets.map((widget) => widget.id));
    if (uniqueIds.size !== widgets.length) {
      throw new BadRequestException('dashboard.widgets must not contain duplicate ids');
    }

    return widgets;
  }

  normalizeDashboardWidget(value: unknown, index: number): DashboardWidgetDefinition {
    const widget = this.valueService.requireObject(value, `dashboard.widgets[${index}] must be an object`);
    const type = this.valueService.requireString(widget.type, `dashboard.widgets[${index}].type is required`);
    const id = this.valueService.requireString(widget.id, `dashboard.widgets[${index}].id is required`);
    const title = this.valueService.requireString(widget.title, `dashboard.widgets[${index}].title is required`);
    const layout = this.normalizeWidgetLayout(widget.layout, `dashboard.widgets[${index}].layout`, id);

    switch (type) {
      case 'kpi':
        return {
          id,
          type,
          title,
          layout,
          metric: this.normalizeMetricDefinition(widget.metric, `dashboard.widgets[${index}].metric`)
        };
      case 'chart':
        return {
          id,
          type,
          title,
          layout,
          chartType: this.normalizeChartType(widget.chartType, `dashboard.widgets[${index}].chartType`),
          dimensionField: this.valueService.requireString(widget.dimensionField, `dashboard.widgets[${index}].dimensionField is required`),
          dimensionLabel: this.valueService.asOptionalString(widget.dimensionLabel),
          metric: this.normalizeMetricDefinition(widget.metric, `dashboard.widgets[${index}].metric`),
          limit: this.normalizeOptionalWidgetLimit(widget.limit, `dashboard.widgets[${index}].limit`),
          sortDirection: this.normalizeOptionalSortDirection(widget.sortDirection, `dashboard.widgets[${index}].sortDirection`)
        };
      case 'table': {
        const displayMode = this.normalizeTableDisplayMode(widget.displayMode, `dashboard.widgets[${index}].displayMode`);

        if (displayMode === 'rows') {
          return {
            id,
            type,
            title,
            layout,
            displayMode,
            columns: this.normalizeTableColumns(widget.columns, `dashboard.widgets[${index}].columns`),
            limit: this.normalizeOptionalWidgetLimit(widget.limit, `dashboard.widgets[${index}].limit`)
          };
        }

        return {
          id,
          type,
          title,
          layout,
          displayMode,
          dimensionField: this.valueService.requireString(widget.dimensionField, `dashboard.widgets[${index}].dimensionField is required`),
          dimensionLabel: this.valueService.asOptionalString(widget.dimensionLabel),
          metric: this.normalizeMetricDefinition(widget.metric, `dashboard.widgets[${index}].metric`),
          limit: this.normalizeOptionalWidgetLimit(widget.limit, `dashboard.widgets[${index}].limit`),
          sortDirection: this.normalizeOptionalSortDirection(widget.sortDirection, `dashboard.widgets[${index}].sortDirection`)
        };
      }
      default:
        throw new BadRequestException(`dashboard.widgets[${index}].type is invalid`);
    }
  }

  normalizeTableColumns(value: unknown, path: string): ReportColumn[] {
    if (!Array.isArray(value)) {
      throw new BadRequestException(`${path} must be an array`);
    }

    const columns = value.map((entry, index) => {
      const column = this.valueService.requireObject(entry, `${path}[${index}] must be an object`);
      return {
        field: this.valueService.requireString(column.field, `${path}[${index}].field is required`),
        label: this.valueService.asOptionalString(column.label)
      } satisfies ReportColumn;
    });

    if (columns.length === 0) {
      throw new BadRequestException(`${path} must contain at least one column`);
    }

    this.valueService.assertUniqueFieldSequence(columns.map((column) => column.field), path);
    return columns;
  }

  normalizeMetricDefinition(value: unknown, path: string): DashboardMetricDefinition {
    const metric = this.valueService.requireObject(value, `${path} must be an object`);
    const operation = this.valueService.requireString(metric.operation, `${path}.operation is required`).toUpperCase();

    switch (operation) {
      case 'COUNT':
        return {
          operation,
          label: this.valueService.asOptionalString(metric.label)
        };
      case 'SUM':
      case 'AVG':
      case 'MIN':
      case 'MAX':
        return {
          operation,
          field: this.valueService.requireString(metric.field, `${path}.field is required`),
          label: this.valueService.asOptionalString(metric.label)
        };
      default:
        throw new BadRequestException(`${path}.operation is invalid`);
    }
  }

  normalizeWidgetLayout(value: unknown, path: string, widgetId: string) {
    const layout = this.valueService.requireObject(value, `${path} must be an object`);
    const x = this.valueService.requireInteger(layout.x, `${path}.x is required`);
    const y = this.valueService.requireInteger(layout.y, `${path}.y is required`);
    const w = this.valueService.requireInteger(layout.w, `${path}.w is required`);
    const h = this.valueService.requireInteger(layout.h, `${path}.h is required`);

    if (x < 0 || x >= GRID_COLUMNS) {
      throw new BadRequestException(`${path}.x must be between 0 and ${GRID_COLUMNS - 1}`);
    }
    if (y < 0) {
      throw new BadRequestException(`${path}.y must be >= 0`);
    }
    if (w < 1 || w > GRID_COLUMNS) {
      throw new BadRequestException(`${path}.w must be between 1 and ${GRID_COLUMNS}`);
    }
    if (x + w > GRID_COLUMNS) {
      throw new BadRequestException(`${path}.x + w must fit within ${GRID_COLUMNS} columns`);
    }
    if (h < 1 || h > GRID_COLUMNS) {
      throw new BadRequestException(`${path}.h must be between 1 and ${GRID_COLUMNS}`);
    }

    return {
      widgetId,
      x,
      y,
      w,
      h
    };
  }

  normalizeChartType(value: unknown, path: string): DashboardChartWidgetDefinition['chartType'] {
    const chartType = this.valueService.requireString(value, `${path} is required`);
    switch (chartType) {
      case 'bar':
      case 'line':
      case 'pie':
      case 'donut':
        return chartType;
      default:
        throw new BadRequestException(`${path} is invalid`);
    }
  }

  normalizeTableDisplayMode(value: unknown, path: string): 'grouped' | 'rows' {
    const mode = this.valueService.requireString(value, `${path} is required`);
    if (mode !== 'grouped' && mode !== 'rows') {
      throw new BadRequestException(`${path} is invalid`);
    }

    return mode;
  }

  normalizeOptionalWidgetLimit(value: unknown, path: string): number | undefined {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }

    const limit = this.valueService.requireInteger(value, `${path} is invalid`);
    if (limit < 1 || limit > MAX_WIDGET_LIMIT) {
      throw new BadRequestException(`${path} must be between 1 and ${MAX_WIDGET_LIMIT}`);
    }

    return limit;
  }

  normalizeOptionalSortDirection(value: unknown, path: string): 'ASC' | 'DESC' | undefined {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }

    const direction = this.valueService.requireString(value, `${path} is invalid`).toUpperCase();
    if (direction !== 'ASC' && direction !== 'DESC') {
      throw new BadRequestException(`${path} is invalid`);
    }

    return direction;
  }
}
