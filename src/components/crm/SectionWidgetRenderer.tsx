import { useMemo } from 'react';
import { Company, CustomField, MetricByYear } from '@/types/crm';
import { SectionWidget, WidgetSource, NATIVE_FIELDS, SIZE_COL_SPAN, WIDGET_PALETTE } from '@/types/widgets';
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
  isUSD?: boolean;
}

function resolveOne(src: WidgetSource, company: Company, fields: CustomField[]): Resolved | null {
  if (src.sourceType === 'native') {
    const native = NATIVE_FIELDS.find(n => n.key === src.sourceKey);
    if (!native) return null;
    if (native.key === 'salesByYear') return { label: src.label || native.label, fieldType: 'metric_by_year', yearValues: company.salesByYear };
    if (native.key === 'exportsUSD') return { label: src.label || native.label, fieldType: 'number', numberValue: company.exportsUSD, isUSD: true };
    if (native.key === 'vertical') return { label: src.label || native.label, fieldType: 'select', textValue: company.vertical };
    if (native.key === 'city') return { label: src.label || native.label, fieldType: 'select', textValue: company.city };
    if (native.key === 'category') return { label: src.label || native.label, fieldType: 'select', textValue: company.category };
    return null;
  }
  const field = fields.find(f => f.id === src.sourceKey);
  if (!field) return null;
  const fv = (company.fieldValues || []).find(v => v.fieldId === field.id);
  return {
    label: src.label || field.name,
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
    .filter(e => !isNaN(e.year) && !isNaN(e.value))
    .sort((a, b) => a.year - b.year);
}

function isEmpty(r: Resolved): boolean {
  if (r.fieldType === 'metric_by_year') return getYearEntries(r.yearValues).length === 0;
  if (r.fieldType === 'number') return r.numberValue === null || r.numberValue === undefined;
  return !r.textValue;
}

function calcSingle(calculation: SectionWidget['calculation'], r: Resolved): number | null {
  if (r.fieldType === 'metric_by_year') {
    const entries = getYearEntries(r.yearValues);
    if (entries.length === 0) return null;
    const values = entries.map(e => e.value);
    if (calculation === 'last') return entries[entries.length - 1].value;
    if (calculation === 'sum') return values.reduce((a, b) => a + b, 0);
    if (calculation === 'avg') return values.reduce((a, b) => a + b, 0) / values.length;
    if (calculation === 'max') return Math.max(...values);
    if (calculation === 'min') return Math.min(...values);
    if (calculation === 'count') return entries.length;
    if (calculation === 'yoy') {
      if (entries.length < 2) return null;
      const last = entries[entries.length - 1].value;
      const prev = entries[entries.length - 2].value;
      return prev !== 0 ? ((last - prev) / prev) * 100 : null;
    }
  }
  if (r.fieldType === 'number') return r.numberValue ?? null;
  return null;
}

function PrettyKPI({ title, value, trend, color, breakdown }: { title: string; value: string; trend?: number | null; color?: string; breakdown?: string }) {
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
        {breakdown && <p className="mt-1 text-[10px] text-muted-foreground truncate">{breakdown}</p>}
      </div>
    </div>
  );
}

const PIE_COLORS = WIDGET_PALETTE;

export default function SectionWidgetRenderer({ widget, company, fields, viewCurrency }: Props) {
  const sources = widget.sources && widget.sources.length > 0
    ? widget.sources
    : [{ sourceType: widget.sourceType, sourceKey: widget.sourceKey } as WidgetSource];

  const resolved = useMemo(
    () => sources.map(s => ({ src: s, res: resolveOne(s, company, fields) })).filter(x => x.res) as { src: WidgetSource; res: Resolved }[],
    [sources, company, fields]
  );

  const size = widget.config.size || 'md';
  const colSpan = SIZE_COL_SPAN[size];
  const baseColor = widget.config.color || PIE_COLORS[0];

  if (resolved.length === 0) {
    if (widget.hideIfEmpty) return null;
    return (
      <div className={cn(colSpan, 'rounded-lg border border-dashed border-border p-4 text-center')}>
        <p className="text-xs text-muted-foreground">Variable no encontrada</p>
      </div>
    );
  }

  const allEmpty = resolved.every(r => isEmpty(r.res));
  if (allEmpty && widget.hideIfEmpty) return null;

  const title = widget.title || resolved[0].res.label;

  // ============ KPI ============
  if (widget.widgetType === 'kpi') {
    const fmt = (n: number, isUSD?: boolean) => isUSD ? formatUSD(n) : formatSales(n, 'COP');

    if (resolved.length === 1) {
      const r = resolved[0].res;
      const calc = widget.calculation;
      let valueStr = '—';
      let trend: number | null | undefined = undefined;

      if (r.fieldType === 'metric_by_year') {
        const entries = getYearEntries(r.yearValues);
        if (entries.length > 0) {
          if (calc === 'yoy') {
            const v = calcSingle(calc, r);
            valueStr = formatPercentage(v);
            trend = v;
          } else {
            const v = calcSingle(calc, r);
            valueStr = v !== null ? fmt(v, r.isUSD) : '—';
            if (calc === 'last' && entries.length > 1) {
              const prev = entries[entries.length - 2].value;
              const last = entries[entries.length - 1].value;
              trend = prev !== 0 ? ((last - prev) / prev) * 100 : null;
            }
          }
        }
      } else if (r.fieldType === 'number') {
        valueStr = r.numberValue !== null && r.numberValue !== undefined ? fmt(r.numberValue, r.isUSD) : '—';
      } else {
        valueStr = r.textValue || '—';
      }

      const display = `${widget.config.prefix || ''}${valueStr}${widget.config.suffix || ''}`;
      return <div className={colSpan}><PrettyKPI title={title} value={display} trend={trend} color={baseColor} /></div>;
    }

    // Multi-source KPI: combine numeric values
    const values = resolved.map(({ src, res }) => ({
      label: src.label || res.label,
      value: calcSingle(widget.calculation, res),
      isUSD: res.isUSD,
    })).filter(v => v.value !== null) as { label: string; value: number; isUSD?: boolean }[];

    if (values.length === 0) {
      if (widget.hideIfEmpty) return null;
      return <div className={colSpan}><PrettyKPI title={title} value="—" color={baseColor} /></div>;
    }

    const combine = widget.config.combine || 'sum';
    const total = combine === 'avg'
      ? values.reduce((a, b) => a + b.value, 0) / values.length
      : values.reduce((a, b) => a + b.value, 0);
    const breakdown = values.map(v => `${v.label}: ${fmt(v.value, v.isUSD)}`).join(' · ');
    const display = `${widget.config.prefix || ''}${fmt(total)}${widget.config.suffix || ''}`;
    return <div className={colSpan}><PrettyKPI title={title} value={display} color={baseColor} breakdown={breakdown} /></div>;
  }

  // ============ Charts (multi-series) ============
  if (widget.widgetType === 'bar' || widget.widgetType === 'line') {
    // Build year-indexed multi-series data
    const series = resolved
      .map(({ src, res }, i) => ({
        key: `s${i}`,
        label: src.label || res.label,
        color: src.color || (resolved.length === 1 ? baseColor : PIE_COLORS[i % PIE_COLORS.length]),
        entries: getYearEntries(res.yearValues),
      }))
      .filter(s => s.entries.length > 0);

    if (series.length === 0) {
      if (widget.hideIfEmpty) return null;
      return (
        <div className={cn(colSpan, 'rounded-lg border border-border/50 bg-card p-4')}>
          <p className="text-xs font-medium text-muted-foreground mb-2">{title}</p>
          <p className="text-xs text-muted-foreground">Sin datos por año</p>
        </div>
      );
    }

    const yearSet = new Set<number>();
    series.forEach(s => s.entries.forEach(e => yearSet.add(e.year)));
    const years = Array.from(yearSet).sort();
    const data = years.map(y => {
      const row: any = { year: String(y) };
      series.forEach(s => {
        const e = s.entries.find(x => x.year === y);
        row[s.key] = e ? e.value : null;
      });
      return row;
    });

    return (
      <div className={cn(colSpan, 'rounded-lg border border-border/50 bg-card p-4')}>
        <p className="text-xs font-medium text-muted-foreground mb-3">{title}</p>
        <ResponsiveContainer width="100%" height={200}>
          {widget.widgetType === 'bar' ? (
            <BarChart data={data}>
              <XAxis dataKey="year" fontSize={11} tick={{ fill: 'hsl(var(--muted-foreground))' }} />
              <YAxis fontSize={10} tick={{ fill: 'hsl(var(--muted-foreground))' }} tickFormatter={(v) => formatSales(v, viewCurrency).replace(/[^0-9.,KMB]/g, '')} />
              <RTooltip formatter={(v: any) => formatSales(Number(v), viewCurrency)} contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
              {series.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
              {series.map(s => <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} radius={[4, 4, 0, 0]} />)}
            </BarChart>
          ) : (
            <LineChart data={data}>
              <XAxis dataKey="year" fontSize={11} tick={{ fill: 'hsl(var(--muted-foreground))' }} />
              <YAxis fontSize={10} tick={{ fill: 'hsl(var(--muted-foreground))' }} tickFormatter={(v) => formatSales(v, viewCurrency).replace(/[^0-9.,KMB]/g, '')} />
              <RTooltip formatter={(v: any) => formatSales(Number(v), viewCurrency)} contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
              {series.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
              {series.map(s => <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2} dot={{ r: 3 }} />)}
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
    );
  }

  // ============ Pie ============
  if (widget.widgetType === 'pie') {
    let data: { name: string; value: number }[] = [];

    if (resolved.length > 1) {
      data = resolved
        .map(({ src, res }) => ({ name: src.label || res.label, value: calcSingle(widget.calculation, res) }))
        .filter(d => d.value !== null) as { name: string; value: number }[];
    } else {
      const r = resolved[0].res;
      const entries = getYearEntries(r.yearValues);
      if (entries.length > 0) {
        data = entries.map(e => ({ name: String(e.year), value: e.value }));
      } else if (r.textValue) {
        data = [{ name: r.textValue, value: 1 }];
      }
    }

    if (data.length === 0) {
      if (widget.hideIfEmpty) return null;
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
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75} label={(e: any) => e.name}>
              {data.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
            </Pie>
            <RTooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
            {widget.config.showLegend !== false && <Legend wrapperStyle={{ fontSize: 11 }} />}
          </PieChart>
        </ResponsiveContainer>
      </div>
    );
  }

  // ============ Table ============
  if (widget.widgetType === 'table') {
    // Multi-series: columns = sources, rows = years
    const series = resolved.map(({ src, res }) => ({
      label: src.label || res.label,
      entries: getYearEntries(res.yearValues),
      textValue: res.textValue,
      numberValue: res.numberValue,
      isUSD: res.isUSD,
    }));

    const yearSet = new Set<number>();
    series.forEach(s => s.entries.forEach(e => yearSet.add(e.year)));
    const years = Array.from(yearSet).sort();

    if (years.length === 0) {
      // Single non-year value table
      return (
        <div className={cn(colSpan, 'rounded-lg border border-border/50 bg-card p-4')}>
          <p className="text-xs font-medium text-muted-foreground mb-3">{title}</p>
          <div className="space-y-1">
            {series.map((s, i) => {
              const display = s.textValue ?? (s.numberValue !== null && s.numberValue !== undefined ? formatSales(s.numberValue, s.isUSD ? 'USD' : viewCurrency) : '—');
              return (
                <div key={i} className="flex justify-between text-xs border-b border-border/30 py-1">
                  <span className="text-muted-foreground">{s.label}</span>
                  <span className="font-medium">{display}</span>
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    return (
      <div className={cn(colSpan, 'rounded-lg border border-border/50 bg-card p-4 overflow-x-auto')}>
        <p className="text-xs font-medium text-muted-foreground mb-3">{title}</p>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border/50">
              <th className="text-left py-1 font-medium text-muted-foreground">Año</th>
              {series.map((s, i) => <th key={i} className="text-right py-1 font-medium text-muted-foreground">{s.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {years.map(y => (
              <tr key={y} className="border-b border-border/30">
                <td className="py-1 text-muted-foreground">{y}</td>
                {series.map((s, i) => {
                  const e = s.entries.find(x => x.year === y);
                  return <td key={i} className="text-right py-1 font-medium">{e ? formatSales(e.value, s.isUSD ? 'USD' : viewCurrency) : '—'}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return null;
}
