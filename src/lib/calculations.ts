import { MetricByYear } from '@/types/crm';

export function calculateGrowth(salesByYear: MetricByYear) {
  const years = Object.keys(salesByYear).map(Number).sort();
  if (years.length < 2) return { avgYoY: null, lastYoY: null };

  const growths: number[] = [];
  for (let i = 1; i < years.length; i++) {
    const prev = salesByYear[years[i - 1]];
    const curr = salesByYear[years[i]];
    if (prev > 0) growths.push(((curr - prev) / prev) * 100);
  }

  if (growths.length === 0) return { avgYoY: null, lastYoY: null };

  const avgYoY = growths.reduce((a, b) => a + b, 0) / growths.length;
  const lastYoY = growths[growths.length - 1];

  return { avgYoY, lastYoY };
}

export function getLastYearSales(salesByYear: MetricByYear) {
  const years = Object.keys(salesByYear).map(Number).sort();
  if (years.length === 0) return null;
  const year = years[years.length - 1];
  return { year, value: salesByYear[year] };
}

/** Returns the sales value from the latest year with data, or null. Used for filtering & sorting. */
export function getLatestSalesValue(salesByYear: MetricByYear): number | null {
  const years = Object.keys(salesByYear).map(Number).sort();
  if (years.length === 0) return null;
  return salesByYear[years[years.length - 1]];
}

export function formatCOP(value: number): string {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(0)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toLocaleString('es-CO')}`;
}

export function formatUSD(value: number): string {
  if (value >= 1_000_000) return `USD ${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `USD ${(value / 1_000).toFixed(0)}K`;
  return `USD ${value.toLocaleString('en-US')}`;
}

export function formatPercentage(value: number | null): string {
  if (value === null) return '—';
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;
}

export function formatFullCOP(value: number): string {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(value);
}

/** Dynamic currency formatter — short format for cards/tables */
export function formatSales(value: number, currencyCode: string = 'COP'): string {
  if (currencyCode === 'USD') return formatUSD(value);
  return formatCOP(value);
}

/** Dynamic currency formatter — full format for tooltips/details */
export function formatFullSales(value: number, currencyCode: string = 'COP'): string {
  const locale = currencyCode === 'USD' ? 'en-US' : 'es-CO';
  return new Intl.NumberFormat(locale, { style: 'currency', currency: currencyCode, maximumFractionDigits: 0 }).format(value);
}

/** Currency label for display */
export function currencyLabel(currencyCode: string = 'COP'): string {
  return currencyCode;
}
