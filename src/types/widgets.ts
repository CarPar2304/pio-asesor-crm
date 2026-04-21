export type WidgetType = 'kpi' | 'bar' | 'line' | 'pie' | 'table';
export type WidgetCalculation = 'last' | 'sum' | 'avg' | 'max' | 'min' | 'yoy' | 'count';
export type WidgetSourceType = 'custom_field' | 'native';
export type WidgetSize = 'sm' | 'md' | 'lg' | 'full';

export interface WidgetSource {
  sourceType: WidgetSourceType;
  sourceKey: string;
  label?: string;
  color?: string;
}

export type WidgetConditionOperator = 'is_set' | 'is_empty' | 'equals' | 'not_equals';

export interface WidgetCondition {
  sourceType: WidgetSourceType;
  sourceKey: string;
  operator: WidgetConditionOperator;
  value?: string;
}

export interface WidgetConfig {
  color?: string;
  size?: WidgetSize;
  /** Vertical units (1-4). Multiplies the base row height. Default 1. */
  heightUnits?: number;
  showLegend?: boolean;
  prefix?: string;
  suffix?: string;
  /** When KPI has multiple sources: how to combine them */
  combine?: 'sum' | 'avg';
  /** Conditional visibility: only render when this condition is satisfied */
  condition?: WidgetCondition;
  /** Editor-only spacer placeholder; not rendered on the live profile. */
  isSpacer?: boolean;
}

export interface SectionWidget {
  id: string;
  sectionId: string;
  title: string;
  widgetType: WidgetType;
  /** Legacy single source — kept for back-compat. Mirrors sources[0] when present. */
  sourceType: WidgetSourceType;
  sourceKey: string;
  /** New multi-variable list. If empty, falls back to (sourceType, sourceKey). */
  sources: WidgetSource[];
  calculation: WidgetCalculation;
  config: WidgetConfig;
  displayOrder: number;
  hideIfEmpty: boolean;
}

export const WIDGET_TYPE_LABELS: Record<WidgetType, string> = {
  kpi: 'KPI Card',
  bar: 'Gráfica de barras',
  line: 'Gráfica de líneas',
  pie: 'Gráfica de torta',
  table: 'Tabla resumen',
};

export const CALCULATION_LABELS: Record<WidgetCalculation, string> = {
  last: 'Último valor',
  sum: 'Suma total',
  avg: 'Promedio',
  max: 'Máximo',
  min: 'Mínimo',
  yoy: 'Variación YoY (%)',
  count: 'Conteo',
};

export const SIZE_LABELS: Record<WidgetSize, string> = {
  sm: 'Pequeño (1/4)',
  md: 'Mediano (1/2)',
  lg: 'Grande (3/4)',
  full: 'Completo',
};

export const SIZE_COL_SPAN: Record<WidgetSize, string> = {
  sm: 'col-span-1',
  md: 'col-span-2',
  lg: 'col-span-3',
  full: 'col-span-4',
};

export const SIZE_ORDER: WidgetSize[] = ['sm', 'md', 'lg', 'full'];

// Native fields available as widget sources
export interface NativeFieldOption {
  key: string;
  label: string;
  type: 'metric_by_year' | 'number' | 'select' | 'text';
}

export const NATIVE_FIELDS: NativeFieldOption[] = [
  { key: 'salesByYear', label: 'Ventas por año', type: 'metric_by_year' },
  { key: 'exportsUSD', label: 'Exportaciones (USD)', type: 'number' },
  { key: 'vertical', label: 'Vertical', type: 'select' },
  { key: 'city', label: 'Ciudad', type: 'select' },
  { key: 'category', label: 'Categoría', type: 'select' },
];

export const WIDGET_PALETTE = [
  'hsl(var(--primary))',
  'hsl(var(--success))',
  'hsl(var(--gold))',
  'hsl(var(--destructive))',
  '#8b5cf6',
  '#06b6d4',
  '#f59e0b',
  '#ec4899',
];
