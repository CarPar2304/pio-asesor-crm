import { Company } from '@/types/crm';
import { calculateGrowth, formatPercentage } from '@/lib/calculations';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { User, Phone, CheckSquare, Flag, ChevronRight } from 'lucide-react';

interface Props {
  company: Company;
  onOpenProfile: (id: string) => void;
  onQuickAction: (type: 'action' | 'task' | 'milestone', companyId: string) => void;
}

export default function CompanyCard({ company, onOpenProfile, onQuickAction }: Props) {
  const { avgYoY, lastYoY } = calculateGrowth(company.salesByYear);
  const pendingTasks = company.tasks.filter(t => t.status === 'pending').length;
  const overdueTasks = company.tasks.filter(t => t.status === 'pending' && new Date(t.dueDate) < new Date()).length;
  const primaryContact = company.contacts.find(c => c.isPrimary);

  return (
    <Card className="group relative flex flex-col overflow-hidden border border-border transition-all duration-200 hover:border-accent/40 hover:shadow-md">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-base font-bold">{company.tradeName}</h3>
            <p className="mt-0.5 truncate text-sm text-muted-foreground">{company.legalName}</p>
            <p className="font-mono text-xs text-muted-foreground">{company.nit}</p>
          </div>
          {company.logo ? (
            <img src={company.logo} alt={company.tradeName} className="h-10 w-10 shrink-0 rounded-lg border border-border object-cover" />
          ) : (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">
              {company.tradeName.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          <Badge variant="outline" className="text-[11px] font-medium">{company.category}</Badge>
          <Badge variant="secondary" className="text-[11px]">{company.vertical}</Badge>
          <Badge variant="secondary" className="text-[11px]">{company.city}</Badge>
        </div>
      </CardHeader>

      <CardContent className="flex-1 space-y-3 pb-3">
        {primaryContact && (
          <div className="flex items-center gap-2 text-sm">
            <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">{primaryContact.name}</span>
            <span className="shrink-0 text-xs text-muted-foreground">· {primaryContact.position}</span>
            {company.contacts.length > 1 && (
              <span className="shrink-0 text-xs text-muted-foreground">+{company.contacts.length - 1}</span>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-md bg-secondary/60 px-2.5 py-2">
            <p className="text-[11px] text-muted-foreground">Avg YoY</p>
            <p className={cn('text-sm font-semibold', avgYoY !== null ? (avgYoY > 0 ? 'text-success' : 'text-destructive') : 'text-muted-foreground')}>
              {formatPercentage(avgYoY)}
            </p>
          </div>
          <div className="rounded-md bg-secondary/60 px-2.5 py-2">
            <p className="text-[11px] text-muted-foreground">Último YoY</p>
            <p className={cn('text-sm font-semibold', lastYoY !== null ? (lastYoY > 0 ? 'text-success' : 'text-destructive') : 'text-muted-foreground')}>
              {formatPercentage(lastYoY)}
            </p>
          </div>
        </div>

        {(pendingTasks > 0 || overdueTasks > 0) && (
          <p className="text-xs text-muted-foreground">
            {pendingTasks} pendientes
            {overdueTasks > 0 && <span className="text-warning-crm"> · {overdueTasks} vencidas</span>}
          </p>
        )}
      </CardContent>

      <CardFooter className="border-t border-border/50 pt-3">
        <div className="flex w-full items-center justify-between">
          <Button size="sm" onClick={() => onOpenProfile(company.id)} className="gap-1 text-xs">
            Abrir perfil <ChevronRight className="h-3 w-3" />
          </Button>
          <div className="flex gap-0.5">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); onQuickAction('action', company.id); }} title="Registrar acción">
              <Phone className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); onQuickAction('task', company.id); }} title="Crear tarea">
              <CheckSquare className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); onQuickAction('milestone', company.id); }} title="Registrar hito">
              <Flag className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardFooter>
    </Card>
  );
}
