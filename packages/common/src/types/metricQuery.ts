import {
    CompactOrAlias,
    CompiledMetric,
    CompiledTableCalculation,
    FieldId,
    Format,
    friendlyName,
    MetricType,
    TableCalculation,
} from './field';
import { Filters, MetricFilterRule } from './filter';

export interface AdditionalMetric {
    label?: string;
    type: MetricType;
    description?: string;
    sql: string;
    hidden?: boolean;
    round?: number;
    compact?: CompactOrAlias;
    format?: Format;
    table: string;
    name: string;
    index?: number;
    filters?: MetricFilterRule[];
    baseDimensionName?: string;
    uuid?: string | null;
    percentile?: number;
}

export enum BinType {
    FIXED_NUMBER = 'fixed_number',
    // TODO not supported yet
    // FIXED_WIDTH = 'fixed_width',
    // CUSTOM_RANGE = 'custom_range',
}

export interface CustomDimension {
    name: string;
    dimensionId: FieldId; // Parent dimension id
    binType: BinType;
    binNumber?: number;
    // binWidth?: number;
    // binRange?: BinRange[];
}

export const getCustomDimensionId = (dimension: CustomDimension) =>
    dimension.name.replace(' ', '_');

export const isAdditionalMetric = (value: any): value is AdditionalMetric =>
    value?.table && value?.name && !value?.fieldType;

export const getCustomMetricDimensionId = (metric: AdditionalMetric) =>
    `${metric.table}_${metric.baseDimensionName}`;

export const isCustomDimension = (value: any): value is CustomDimension =>
    'binType' in value;

// Object used to query an explore. Queries only happen within a single explore
export type MetricQuery = {
    dimensions: FieldId[]; // Dimensions to group by in the explore
    metrics: FieldId[]; // Metrics to compute in the explore
    filters: Filters;
    sorts: SortField[]; // Sorts for the data
    limit: number; // Max number of rows to return from query
    tableCalculations: TableCalculation[]; // calculations to append to results
    additionalMetrics?: AdditionalMetric[]; // existing metric type
    customDimensions?: CustomDimension[];
};
export type CompiledMetricQuery = MetricQuery & {
    compiledTableCalculations: CompiledTableCalculation[];
    compiledAdditionalMetrics: CompiledMetric[];
};
// Sort by
export type SortField = {
    fieldId: string; // Field must exist in the explore
    descending: boolean; // Direction of the sort
};

const idPattern = /(.+)id$/i;
export const extractEntityNameFromIdColumn = (
    columnName: string,
): string | null => {
    const match = columnName.match(idPattern);
    if (!match || columnName.toLowerCase().endsWith('valid')) {
        return null;
    }
    return (
        match[1]
            .toLowerCase()
            .split(/[^a-z]/)
            .filter((x) => x)
            .join('_') || null
    );
};

export const getAdditionalMetricLabel = (item: AdditionalMetric) =>
    `${friendlyName(item.table)} ${item.label}`;

type FilterGroupResponse =
    | {
          id: string;
          or: any[];
      }
    | {
          id: string;
          and: any[];
      };
export type FiltersResponse = {
    dimensions?: FilterGroupResponse;
    metrics?: FilterGroupResponse;
};
export type MetricQueryResponse = {
    dimensions: FieldId[]; // Dimensions to group by in the explore
    metrics: FieldId[]; // Metrics to compute in the explore
    filters: FiltersResponse;
    sorts: SortField[]; // Sorts for the data
    limit: number; // Max number of rows to return from query
    tableCalculations: TableCalculation[]; // calculations to append to results
    additionalMetrics?: AdditionalMetric[]; // existing metric type
    customDimensions?: CustomDimension[];
};
