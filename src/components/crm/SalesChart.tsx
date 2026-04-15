import { useMemo } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts';
import { MetricByYear } from '@/types/crm';
import { formatSales, formatFullSales } from '@/lib/calculations';
import { convertWithTRM } from '@/lib/exchangeRate';

interface Props {
  salesByYear: MetricByYear;
  currency?: string;
  sourceCurrency?: string;
  trm?: number;
}

export default function SalesChart({ salesByYear, currency = 'COP', sourceCurrency = 'COP', trm = 4200 }: Props) {
  const data = useMemo(() => {
    return Object.entries(salesByYear)
      .map(([year, value]) => ({
        year: Number(year),
        sales: convertWithTRM(Number(value) || 0, sourceCurrency, currency, trm),
      }))
      .sort((a, b) => a.year - b.year);
  }, [salesByYear, currency, sourceCurrency, trm]);

  if (data.length < 2) return null;

  return (
    <div className="h-64 w-full rounded-lg border border-border/50 bg-card p-3">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" />
          <XAxis dataKey="year" className="fill-muted-foreground text-xs" tickLine={false} axisLine={false} />
          <YAxis
            className="fill-muted-foreground text-xs"
            tickLine={false}
            axisLine={false}
            tickFormatter={(value: number) => formatSales(value, currency)}
          />
          <Tooltip
            cursor={{ className: 'fill-muted/40' }}
            contentStyle={{
              background: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '0.5rem',
              color: 'hsl(var(--foreground))',
            }}
            formatter={(value: number) => [formatFullSales(value, currency), 'Ventas']}
            labelFormatter={(label) => `Año ${label}`}
          />
          <Line
            type="monotone"
            dataKey="sales"
            stroke="hsl(var(--primary))"
            strokeWidth={2.5}
            dot={{ r: 3, fill: 'hsl(var(--primary))' }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
