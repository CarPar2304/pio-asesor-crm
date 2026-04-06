import { memo } from 'react';
import { Company } from '@/types/crm';
import { calculateGrowth, getLastYearSales, formatCOP, formatPercentage } from '@/lib/calculations';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ExternalLink, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  companies: Company[];
  onOpenProfile: (id: string) => void;
  activeYear: number;
  onDelete?: (id: string) => void;
}

function CompanyTable({ companies, onOpenProfile, activeYear, onDelete }: Props) {
  return (
    <div className="rounded-lg border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="whitespace-nowrap text-xs">Empresa</TableHead>
            <TableHead className="whitespace-nowrap text-xs">Categoría</TableHead>
            <TableHead className="whitespace-nowrap text-xs">Vertical</TableHead>
            <TableHead className="whitespace-nowrap text-xs">Ciudad</TableHead>
            <TableHead className="whitespace-nowrap text-xs">Ventas (último dato)</TableHead>
            <TableHead className="whitespace-nowrap text-xs">Avg YoY</TableHead>
            <TableHead className="whitespace-nowrap text-xs">Último YoY</TableHead>
            <TableHead className="whitespace-nowrap text-xs">Tareas</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {companies.map(c => {
            const { avgYoY, lastYoY } = calculateGrowth(c.salesByYear);
            const lastSales = getLastYearSales(c.salesByYear);
            const pending = c.tasks.filter(t => t.status === 'pending').length;
            const overdue = c.tasks.filter(t => t.status === 'pending' && new Date(t.dueDate) < new Date()).length;
            return (
              <TableRow key={c.id} className="cursor-pointer hover:bg-muted/60" onClick={() => onOpenProfile(c.id)}>
                <TableCell>
                  <div>
                    <p className="text-sm font-semibold">{c.tradeName}</p>
                    <p className="text-xs text-muted-foreground">{c.nit}</p>
                  </div>
                </TableCell>
                <TableCell><Badge variant="outline" className="text-[11px]">{c.category}</Badge></TableCell>
                <TableCell className="text-sm">{c.vertical}</TableCell>
                <TableCell className="text-sm">{c.city}</TableCell>
                <TableCell className="text-sm font-medium">
                  {lastSales ? (
                    <span>{formatCOP(lastSales.value)} <span className="text-[10px] text-muted-foreground">({lastSales.year})</span></span>
                  ) : '—'}
                </TableCell>
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

export default memo(CompanyTable);
