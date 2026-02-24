import { Company } from '@/types/crm';
import { calculateGrowth, formatPercentage, getLastYearSales, formatCOP } from '@/lib/calculations';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { User, Phone, CheckSquare, Flag, ChevronRight, TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface Props {
  company: Company;
  onOpenProfile: (id: string) => void;
  onQuickAction: (type: 'action' | 'task' | 'milestone', companyId: string) => void;
}

export default function CompanyCard({ company, onOpenProfile, onQuickAction }: Props) {
  const { avgYoY, lastYoY } = calculateGrowth(company.salesByYear);
  const lastSales = getLastYearSales(company.salesByYear);
  const pendingTasks = company.tasks.filter(t => t.status === 'pending').length;
  const overdueTasks = company.tasks.filter(t => t.status === 'pending' && new Date(t.dueDate) < new Date()).length;
  const primaryContact = company.contacts.find(c => c.isPrimary);

  const getTrendIcon = (val: number | null) => {
    if (val === null) return <Minus className="h-3 w-3 text-muted-foreground" />;
    if (val > 0) return <TrendingUp className="h-3 w-3 text-success" />;
    return <TrendingDown className="h-3 w-3 text-destructive" />;
  };

  return (
    <Card
      className="group relative flex flex-col overflow-hidden border border-border/60 bg-card transition-all duration-200 hover:shadow-lg hover:shadow-primary/5 hover:border-primary/20 cursor-pointer"
      onClick={() => onOpenProfile(company.id)}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              {company.logo ? (
                <img src={company.logo} alt={company.tradeName} className="h-12 w-12 shrink-0 rounded-lg border border-border/40 object-contain bg-white p-1" />
              ) : (
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-lg font-bold text-primary">
                  {company.tradeName.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <h3 className="truncate text-sm font-bold leading-tight">{company.tradeName}</h3>
                <p className="truncate text-xs text-muted-foreground">{company.legalName}</p>
              </div>
            </div>
            <p className="mt-1.5 font-mono text-[11px] text-muted-foreground/70">{company.nit}</p>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          <Badge variant="outline" className="text-[10px] font-semibold px-1.5 py-0">{company.category}</Badge>
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{company.vertical}</Badge>
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{company.city}</Badge>
        </div>
      </CardHeader>

      <CardContent className="flex-1 space-y-2.5 pb-2.5" onClick={e => e.stopPropagation()}>
        {/* Metrics row */}
        <div className="grid grid-cols-2 gap-1.5">
          <div className="flex items-center gap-1.5 rounded-md border border-border/40 bg-muted/30 px-2 py-1.5">
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-muted-foreground leading-none mb-0.5">Avg YoY</p>
              <p className={cn('text-xs font-semibold leading-none', avgYoY !== null ? (avgYoY > 0 ? 'text-success' : 'text-destructive') : 'text-muted-foreground')}>
                {formatPercentage(avgYoY)}
              </p>
            </div>
            {getTrendIcon(avgYoY)}
          </div>
          <div className="flex items-center gap-1.5 rounded-md border border-border/40 bg-muted/30 px-2 py-1.5">
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-muted-foreground leading-none mb-0.5">Último YoY</p>
              <p className={cn('text-xs font-semibold leading-none', lastYoY !== null ? (lastYoY > 0 ? 'text-success' : 'text-destructive') : 'text-muted-foreground')}>
                {formatPercentage(lastYoY)}
              </p>
            </div>
            {getTrendIcon(lastYoY)}
          </div>
        </div>

        {lastSales && (
          <p className="text-[11px] text-muted-foreground">
            Ventas {lastSales.year} (COP): <span className="font-medium text-foreground">{formatCOP(lastSales.value)}</span>
          </p>
        )}

        {primaryContact && (
          <div className="flex items-center gap-1.5 text-[11px]">
            <User className="h-3 w-3 shrink-0 text-muted-foreground" />
            <span className="truncate font-medium">{primaryContact.name}</span>
            {primaryContact.position && <span className="shrink-0 text-muted-foreground">· {primaryContact.position}</span>}
            {company.contacts.length > 1 && (
              <span className="shrink-0 text-muted-foreground/60">+{company.contacts.length - 1}</span>
            )}
          </div>
        )}

        {(pendingTasks > 0 || overdueTasks > 0) && (
          <p className="text-[11px] text-muted-foreground">
            📋 {pendingTasks} pendientes
            {overdueTasks > 0 && <span className="text-destructive font-medium"> · {overdueTasks} vencidas</span>}
          </p>
        )}
      </CardContent>

      <CardFooter className="border-t border-border/40 px-3 py-2" onClick={e => e.stopPropagation()}>
        <div className="flex w-full items-center justify-between">
          <Button size="sm" variant="ghost" onClick={() => onOpenProfile(company.id)} className="gap-1 text-xs h-7 px-2 text-primary hover:text-primary">
            Abrir perfil <ChevronRight className="h-3 w-3" />
          </Button>
          <div className="flex gap-0.5">
            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-primary" onClick={() => onQuickAction('action', company.id)} title="Registrar acción">
              <Phone className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-primary" onClick={() => onQuickAction('task', company.id)} title="Crear tarea">
              <CheckSquare className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-primary" onClick={() => onQuickAction('milestone', company.id)} title="Registrar hito">
              <Flag className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardFooter>
    </Card>
  );
}
