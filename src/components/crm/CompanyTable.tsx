import { useState } from 'react';
import { Company } from '@/types/crm';
import { calculateGrowth, formatCOP, formatPercentage } from '@/lib/calculations';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronUp, ChevronDown, ExternalLink, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  companies: Company[];
  onOpenProfile: (id: string) => void;
  activeYear: number;
  onDelete?: (id: string) => void;
}

type SortKey = 'tradeName' | 'category' | 'vertical' | 'city' | 'sales' | 'avgYoY' | 'lastYoY' | 'tasks';
type SortDir = 'asc' | 'desc';

export default function CompanyTable({ companies, onOpenProfile, activeYear, onDelete }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('tradeName');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  const sorted = [...companies].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1;
    switch (sortKey) {
      case 'tradeName': return a.tradeName.localeCompare(b.tradeName) * dir;
      case 'category': return a.category.localeCompare(b.category) * dir;
      case 'vertical': return a.vertical.localeCompare(b.vertical) * dir;
      case 'city': return a.city.localeCompare(b.city) * dir;
      case 'sales': return ((a.salesByYear[activeYear] || 0) - (b.salesByYear[activeYear] || 0)) * dir;
      case 'avgYoY': return ((calculateGrowth(a.salesByYear).avgYoY || 0) - (calculateGrowth(b.salesByYear).avgYoY || 0)) * dir;
      case 'lastYoY': return ((calculateGrowth(a.salesByYear).lastYoY || 0) - (calculateGrowth(b.salesByYear).lastYoY || 0)) * dir;
      case 'tasks': return (a.tasks.filter(t => t.status === 'pending').length - b.tasks.filter(t => t.status === 'pending').length) * dir;
      default: return 0;
    }
  });

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return null;
    return sortDir === 'asc' ? <ChevronUp className="inline h-3 w-3" /> : <ChevronDown className="inline h-3 w-3" />;
  };

  const Th = ({ col, children }: { col: SortKey; children: React.ReactNode }) => (
    <TableHead className="cursor-pointer select-none whitespace-nowrap text-xs" onClick={() => toggleSort(col)}>
      {children} <SortIcon col={col} />
    </TableHead>
  );

  return (
    <div className="rounded-lg border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <Th col="tradeName">Empresa</Th>
            <Th col="category">Categoría</Th>
            <Th col="vertical">Vertical</Th>
            <Th col="city">Ciudad</Th>
            <Th col="sales">Ventas {activeYear}</Th>
            <Th col="avgYoY">Avg YoY</Th>
            <Th col="lastYoY">Último YoY</Th>
            <Th col="tasks">Tareas</Th>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map(c => {
            const { avgYoY, lastYoY } = calculateGrowth(c.salesByYear);
            const pending = c.tasks.filter(t => t.status === 'pending').length;
            const overdue = c.tasks.filter(t => t.status === 'pending' && new Date(t.dueDate) < new Date()).length;
            return (
              <TableRow key={c.id} className="cursor-pointer hover:bg-secondary/40" onClick={() => onOpenProfile(c.id)}>
                <TableCell>
                  <div>
                    <p className="text-sm font-semibold">{c.tradeName}</p>
                    <p className="text-xs text-muted-foreground">{c.nit}</p>
                  </div>
                </TableCell>
                <TableCell><Badge variant="outline" className="text-[11px]">{c.category}</Badge></TableCell>
                <TableCell className="text-sm">{c.vertical}</TableCell>
                <TableCell className="text-sm">{c.city}</TableCell>
                <TableCell className="text-sm font-medium">{c.salesByYear[activeYear] ? formatCOP(c.salesByYear[activeYear]) : '—'}</TableCell>
                <TableCell className={cn('text-sm font-medium', avgYoY !== null ? (avgYoY > 0 ? 'text-success' : 'text-destructive') : 'text-muted-foreground')}>
                  {formatPercentage(avgYoY)}
                </TableCell>
                <TableCell className={cn('text-sm font-medium', lastYoY !== null ? (lastYoY > 0 ? 'text-success' : 'text-destructive') : 'text-muted-foreground')}>
                  {formatPercentage(lastYoY)}
                </TableCell>
                <TableCell>
                  {pending > 0 ? (
                    <span className="text-xs">
                      {pending} pend.{overdue > 0 && <span className="text-warning-crm"> · {overdue} venc.</span>}
                    </span>
                  ) : <span className="text-xs text-muted-foreground">—</span>}
                </TableCell>
                <TableCell onClick={e => e.stopPropagation()}>
                  <div className="flex gap-0.5">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onOpenProfile(c.id)}>
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Button>
                    {onDelete && (
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => { if (confirm(`¿Eliminar "${c.tradeName}"?`)) onDelete(c.id); }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
