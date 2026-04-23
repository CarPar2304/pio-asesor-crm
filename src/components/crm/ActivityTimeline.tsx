import { useState, useMemo } from 'react';
import { Company, ACTION_TYPE_LABELS, MILESTONE_TYPE_LABELS } from '@/types/crm';
import { useCRM } from '@/contexts/CRMContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Phone, Flag, CheckSquare, Check, Calendar as CalIcon, Layers, MousePointerClick } from 'lucide-react';
import { cn } from '@/lib/utils';
import CompanyPortfolioTab from './CompanyPortfolioTab';

interface Props {
  company: Company;
}

type TabType = 'all' | 'actions' | 'milestones' | 'tasks' | 'portfolio';

export default function ActivityTimeline({ company }: Props) {
  const { updateTask } = useCRM();
  const [tab, setTab] = useState<TabType>('all');

  const items = useMemo(() => {
    const all: { type: 'action' | 'milestone' | 'task'; date: string; data: any }[] = [];
    if (tab === 'all' || tab === 'actions') {
      company.actions.forEach(a => all.push({ type: 'action', date: a.date, data: a }));
    }
    if (tab === 'all' || tab === 'milestones') {
      company.milestones.forEach(m => all.push({ type: 'milestone', date: m.date, data: m }));
    }
    if (tab === 'all' || tab === 'tasks') {
      company.tasks.forEach(t => all.push({ type: 'task', date: t.dueDate, data: t }));
    }
    return all.sort((a, b) => b.date.localeCompare(a.date));
  }, [company, tab]);

  const icons = { action: MousePointerClick, milestone: Flag, task: CheckSquare };

  if (tab === 'portfolio') {
    return (
      <div className="space-y-4">
        <Tabs value={tab} onValueChange={v => setTab(v as TabType)}>
          <TabsList className="h-8">
            <TabsTrigger value="all" className="text-xs">Todo</TabsTrigger>
            <TabsTrigger value="actions" className="text-xs">Toques</TabsTrigger>
            <TabsTrigger value="milestones" className="text-xs">Hitos</TabsTrigger>
            <TabsTrigger value="tasks" className="text-xs">Tareas</TabsTrigger>
            <TabsTrigger value="portfolio" className="text-xs gap-1"><Layers className="h-3 w-3" />Portafolio</TabsTrigger>
          </TabsList>
        </Tabs>
        <CompanyPortfolioTab companyId={company.id} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={v => setTab(v as TabType)}>
        <TabsList className="h-8">
          <TabsTrigger value="all" className="text-xs">Todo</TabsTrigger>
          <TabsTrigger value="actions" className="text-xs">Toques</TabsTrigger>
          <TabsTrigger value="milestones" className="text-xs">Hitos</TabsTrigger>
          <TabsTrigger value="tasks" className="text-xs">Tareas</TabsTrigger>
          <TabsTrigger value="portfolio" className="text-xs gap-1"><Layers className="h-3 w-3" />Portafolio</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="space-y-2">
        {items.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">Sin actividad registrada</p>
        )}
        {items.map((item, i) => {
          const Icon = icons[item.type];
          const isTask = item.type === 'task';
          const isCompleted = isTask && item.data.status === 'completed';
          const isOverdue = isTask && item.data.status === 'pending' && new Date(item.data.dueDate) < new Date();

          return (
            <div key={`${item.type}-${item.data.id}`} className="flex items-start gap-3 rounded-lg border border-border/50 bg-card p-3 transition-colors hover:bg-secondary/30">
              <div className={cn(
                'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
                item.type === 'action' && 'bg-secondary text-foreground',
                item.type === 'milestone' && 'bg-gold-light text-gold',
                item.type === 'task' && (isCompleted ? 'bg-success-light text-success' : isOverdue ? 'bg-warning-light text-warning-crm' : 'bg-secondary text-foreground'),
              )}>
                <Icon className="h-3.5 w-3.5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    {item.type === 'action' && (
                      <>
                        <Badge variant="outline" className="mb-1 text-[10px]">{ACTION_TYPE_LABELS[item.data.type]}</Badge>
                        <p className="text-sm">{item.data.description}</p>
                        {item.data.notes && <p className="mt-0.5 text-xs text-muted-foreground">{item.data.notes}</p>}
                      </>
                    )}
                    {item.type === 'milestone' && (
                      <>
                        <Badge className="mb-1 border-0 bg-gold-light text-[10px] text-gold">{MILESTONE_TYPE_LABELS[item.data.type]}</Badge>
                        <p className="text-sm font-medium">{item.data.title}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{item.data.description}</p>
                      </>
                    )}
                    {item.type === 'task' && (
                      <>
                        <p className={cn('text-sm', isCompleted && 'line-through text-muted-foreground')}>{item.data.title}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{item.data.description}</p>
                      </>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <CalIcon className="h-3 w-3" /> {item.date}
                    </span>
                    {isTask && !isCompleted && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => updateTask(company.id, item.data.id, { status: 'completed', completedDate: new Date().toISOString().split('T')[0] })}
                      >
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
