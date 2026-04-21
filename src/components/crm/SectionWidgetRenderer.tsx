import { useMemo } from 'react';
import { Company, CustomField, MetricByYear } from '@/types/crm';
import { SectionWidget, NATIVE_FIELDS, SIZE_COL_SPAN } from '@/types/widgets';
import { formatSales, formatPercentage, formatUSD } from '@/lib/calculations';
import { cn } from '@/lib/utils';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, ResponsiveContainer, Tooltip as RTooltip, Legend } from 'recharts';

interface Props {
  widget: SectionWidget;
  company: Company;
  fields: CustomField[];
  viewCurrency: string;
}

interface Resolved {
  label: string;
  fieldType: 'metric_by_year' | 'number' | 'select' | 'text';
  yearValues?: MetricByYear;
  numberValue?: number | null;
  textValue?: string | null;
  options?: string[];
}

function resolveSource(widget: SectionWidget, company: Company, fields: CustomField[]): Resolved | null {
  if (widget.sourceType === 'native') {
    const native = NATIVE_FIELDS.find(n => n.key === widget.sourceKey);
    if (!native) return null;
    if (native.key === 'salesByYear') {
      return { label: native.label, fieldType: 'metric_by_year', yearValues: company.salesByYear };
    }
    if (native.key === 'exportsUSD') {
      return { label: native.label, fieldType: 'number', numberValue: company.exportsUSD };
    }
    if (native.key === 'vertical') return { label: native.label, fieldType: 'select', textValue: company.vertical };
    if (native.key === 'city') return { label: native.label, fieldType: 'select', textValue: company.city };
    if (native.key === 'category') return { label: native.label, fieldType: 'select', textValue: company.category };
    return null;
  }

  const field = fields.find(f => f.id === widget.sourceKey);
  if (!field) return null;
  const fv = (company.fieldValues || []).find(v => v.fieldId === field.id);
  return {
    label: field.name,
    fieldType: field.fieldType as any,
    yearValues: fv?.yearValues,
    numberValue: fv?.numberValue,
    textValue: fv?.textValue,
    options: field.options,
  };
}

function getYearEntries(yv?: MetricByYear) {
  if (!yv) return [];
  return Object.entries(yv)
    .map(([y, v]) => ({ year: Number(y), value: Number(v) }))
    .filter(e => !isNaN(e.year))
    .sort((a, b) => a.year - b.year);
}

function calcKPI(widget: SectionWidget, src: Resolved): { value: string; trend?: number | null } {
  const c = widget.calculation;
  const isUSD = widget.sourceKey === 'exportsUSD';
  const fmt = (n: number) => isUSD ? formatUSD(n) : formatSales(n, 'COP');

  if (src.fieldType === 'metric_by_year') {
    const entries = getYearEntries(src.yearValues);
    if (entries.length === 0) return { value: '—' };
    const values = entries.map(e => e.value);
    if (c === 'last') {
      const last = entries[entries.length - 1];
      const prev = entries.length > 1 ? entries[entries.length - 2].value : null;
      const trend = prev && prev !== 0 ? ((last.value - prev) / prev) * 100 : null;
      return { value: fmt(last.value), trend };
    }
    if (c === 'sum') return { value: fmt(values.reduce((a, b) => a + b, 0)) };
    if (c === 'avg') return { value: fmt(values.reduce((a, b) => a + b, 0) / values.length) };
    if (c === 'max') return { value: fmt(Math.max(...values)) };
    if (c === 'min') return { value: fmt(Math.min(...values)) };
    if (c === 'yoy') {
      if (entries.length < 2) return { value: '—' };
      const last = entries[entries.length - 1].value;
      const prev = entries[entries.length - 2].value;
      const yoy = prev !== 0 ? ((last - prev) / prev) * 100 : null;
      return { value: formatPercentage(yoy), trend: yoy };
    }
    if (c === 'count') return { value: String(entries.length) };
  }
  if (src.fieldType === 'number') {
    if (src.numberValue === null || src.numberValue === undefined) return { value: '—' };
    return { value: fmt(src.numberValue) };
  }
  return { value: src.textValue || '—' };
}

function PrettyKPI({ title, value, trend, color }: { title: string; value: string; trend?: number | null; color?: string }) {
  return (
    <div className="rounded-lg border border-border/50 bg-card p-4 h-full flex flex-col justify-between">
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{title}</p>
      <div>
        <p className="mt-2 text-2xl font-bold" style={color ? { color } : undefined}>{value}</p>
        {trend !== null && trend !== undefined && !isNaN(trend) && (
          <p className={cn('mt-1 text-xs font-medium', trend > 0 ? 'text-success' : 'text-destructive')}>
            {trend > 0 ? '↑' : '↓'} {formatPercentage(Math.abs(trend))}
          </p>
        )}
      </div>
    </div>
  );
}

const PIE_COLORS = ['hsl(var(--primary))', 'hsl(var(--success))', 'hsl(var(--gold))', 'hsl(var(--destructive))', '#8b5cf6', '#06b6d4', '#f59e0b', '#ec4899'];

export default function SectionWidgetRenderer({ widget, company, fields, viewCurrency }: Props) {
  const src = useMemo(() => resolveSource(widget, company, fields), [widget, company, fields]);
  const size = widget.config.size || 'md';
  const colSpan = SIZE_COL_SPAN[size];
  const color = widget.config.color || 'hsl(var(--primary))';

  if (!src) {
    return (
      <div className={cn(colSpan, 'rounded-lg border border-dashed border-border p-4 text-center')}>
        <p className="text-xs text-muted-foreground">Variable no encontrada</p>
      </div>
    );
  }

  const title = widget.title || src.label;

  // KPI
  if (widget.widgetType === 'kpi') {
    const { value, trend } = calcKPI(widget, src);
    const display = widget.config.prefix ? `${widget.config.prefix}${value}` : value;
    const final = widget.config.suffix ? `${display}${widget.config.suffix}` : display;
    return <div className={colSpan}><PrettyKPI title={title} value={final} trend={trend} color={color} /></div>;
  }

  // Chart data
  const yearEntries = getYearEntries(src.yearValues);

  if (widget.widgetType === 'bar' || widget.widgetType === 'line') {
    if (yearEntries.length === 0) {
      return (
        <div className={cn(colSpan, 'rounded-lg border border-border/50 bg-card p-4')}>
          <p className="text-xs font-medium text-muted-foreground mb-2">{title}</p>
          <p className="text-xs text-muted-foreground">Sin datos por año</p>
        </div>
      );
    }
    const data = yearEntries.map(e => ({ year: String(e.year), value: e.value }));
    return (
      <div className={cn(colSpan, 'rounded-lg border border-border/50 bg-card p-4')}>
        <p className="text-xs font-medium text-muted-foreground mb-3">{title}</p>
        <ResponsiveContainer width="100%" height={180}>
          {widget.widgetType === 'bar' ? (
            <BarChart data={data}>
              <XAxis dataKey="year" fontSize={11} tick={{ fill: 'hsl(var(--muted-foreground))' }} />
              <YAxis fontSize={10} tick={{ fill: 'hsl(var(--muted-foreground))' }} tickFormatter={(v) => formatSales(v, viewCurrency).replace(/[^0-9.,KMB]/g, '')} />
              <RTooltip formatter={(v: any) => formatSales(Number(v), viewCurrency)} contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]} />
            </BarChart>
          ) : (
            <LineChart data={data}>
              <XAxis dataKey="year" fontSize={11} tick={{ fill: 'hsl(var(--muted-foreground))' }} />
              <YAxis fontSize={10} tick={{ fill: 'hsl(var(--muted-foreground))' }} tickFormatter={(v) => formatSales(v, viewCurrency).replace(/[^0-9.,KMB]/g, '')} />
              <RTooltip formatter={(v: any) => formatSales(Number(v), viewCurrency)} contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
              <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
    );
  }

  if (widget.widgetType === 'pie') {
    // Pie: works on metric_by_year (each year as slice) or single select value
    let data: { name: string; value: number }[] = [];
    if (yearEntries.length > 0) {
      data = yearEntries.map(e => ({ name: String(e.year), value: e.value }));
    } else if (src.textValue) {
      data = [{ name: src.textValue, value: 1 }];
    }
    if (data.length === 0) {
      return (
        <div className={cn(colSpan, 'rounded-lg border border-border/50 bg-card p-4')}>
          <p className="text-xs font-medium text-muted-foreground mb-2">{title}</p>
          <p className="text-xs text-muted-foreground">Sin datos para graficar</p>
        </div>
      );
    }
    return (
      <div className={cn(colSpan, 'rounded-lg border border-border/50 bg-card p-4')}>
        <p className="text-xs font-medium text-muted-foreground mb-3">{title}</p>
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={(e: any) => e.name}>
              {data.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
            </Pie>
            <RTooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
            {widget.config.showLegend !== false && <Legend wrapperStyle={{ fontSize: 11 }} />}
          </PieChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (widget.widgetType === 'table') {
    if (yearEntries.length === 0) {
      return (
        <div className={cn(colSpan, 'rounded-lg border border-border/50 bg-card p-4')}>
          <p className="text-xs font-medium text-muted-foreground mb-2">{title}</p>
          <p className="text-sm">{src.textValue || src.numberValue || '—'}</p>
        </div>
      );
    }
    return (
      <div className={cn(colSpan, 'rounded-lg border border-border/50 bg-card p-4')}>
        <p className="text-xs font-medium text-muted-foreground mb-3">{title}</p>
        <div className="space-y-1">
          {yearEntries.map(e => (
            <div key={e.year} className="flex justify-between text-xs border-b border-border/30 py-1">
              <span className="text-muted-foreground">{e.year}</span>
              <span className="font-medium">{formatSales(e.value, viewCurrency)}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return null;
}
