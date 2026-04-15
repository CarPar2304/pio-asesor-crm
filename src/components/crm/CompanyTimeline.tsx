import { useState, useEffect, useRef, useMemo } from 'react';
import { fetchCompanyHistory, HistoryEvent } from '@/lib/historyHelper';
import { useProfile } from '@/contexts/ProfileContext';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Phone, Flag, CheckSquare, GitBranch, StickyNote, Briefcase, Clock, FileText } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';

const EVENT_CONFIG: Record<string, { icon: typeof Phone; color: string; bgColor: string; label: string }> = {
  action: { icon: Phone, color: 'text-primary', bgColor: 'bg-primary/10', label: 'Acción' },
  milestone: { icon: Flag, color: 'text-gold', bgColor: 'bg-gold-light', label: 'Hito' },
  task_created: { icon: CheckSquare, color: 'text-success', bgColor: 'bg-success-light', label: 'Tarea' },
  task_completed: { icon: CheckSquare, color: 'text-success', bgColor: 'bg-success-light', label: 'Tarea completada' },
  pipeline_add: { icon: GitBranch, color: 'text-secondary', bgColor: 'bg-secondary/10', label: 'Pipeline' },
  pipeline_move: { icon: GitBranch, color: 'text-secondary', bgColor: 'bg-secondary/10', label: 'Movimiento' },
  pipeline_remove: { icon: GitBranch, color: 'text-destructive', bgColor: 'bg-destructive/10', label: 'Removido' },
  note: { icon: StickyNote, color: 'text-muted-foreground', bgColor: 'bg-muted', label: 'Nota' },
  company_created: { icon: Briefcase, color: 'text-primary', bgColor: 'bg-primary/10', label: 'Creación' },
  company_updated: { icon: Briefcase, color: 'text-primary', bgColor: 'bg-primary/10', label: 'Edición' },
  form_submission: { icon: FileText, color: 'text-accent-foreground', bgColor: 'bg-accent/20', label: 'Formulario' },
  form_creation: { icon: FileText, color: 'text-success', bgColor: 'bg-success-light', label: 'Creación por form' },
  form_update: { icon: FileText, color: 'text-primary', bgColor: 'bg-primary/10', label: 'Actualización por form' },
};

const DEFAULT_CONFIG = { icon: Clock, color: 'text-muted-foreground', bgColor: 'bg-muted', label: 'Evento' };

interface Props {
  companyId: string;
}

export default function CompanyTimeline({ companyId }: Props) {
  const [events, setEvents] = useState<HistoryEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const { allProfiles } = useProfile();
  const scrollRef = useRef<HTMLDivElement>(null);
  const eventRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const profileMap = new Map(allProfiles.map(p => [p.userId, p]));

  useEffect(() => {
    setLoading(true);
    fetchCompanyHistory(companyId).then(data => {
      setEvents(data);
      setLoading(false);
    });
  }, [companyId]);

  // Scroll to end (latest) on load
  useEffect(() => {
    if (!loading && scrollRef.current) {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
    }
  }, [loading, events.length]);

  // Available months for navigation
  const monthOptions = useMemo(() => {
    const seen = new Map<string, string>();
    events.forEach(ev => {
      const d = new Date(ev.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!seen.has(key)) {
        seen.set(key, format(d, 'MMM yyyy', { locale: es }));
      }
    });
    return Array.from(seen.entries()).map(([key, label]) => ({ key, label }));
  }, [events]);

  const scrollToMonth = (monthKey: string) => {
    // Find first event matching this month
    const idx = events.findIndex(ev => {
      const d = new Date(ev.createdAt);
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      return k === monthKey;
    });
    if (idx >= 0) {
      const el = eventRefs.current.get(events[idx].id);
      if (el && scrollRef.current) {
        const container = scrollRef.current;
        const scrollLeft = el.offsetLeft - container.offsetLeft - 40;
        container.scrollTo({ left: scrollLeft, behavior: 'smooth' });
      }
    }
  };

  if (loading) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">Cargando timeline...</div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        Sin histórico registrado. Las nuevas acciones, hitos, tareas y movimientos aparecerán aquí.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Timeline</h3>
        {monthOptions.length > 1 && (
          <Select onValueChange={scrollToMonth}>
            <SelectTrigger className="h-8 w-44 text-xs">
              <SelectValue placeholder="Ir a mes..." />
            </SelectTrigger>
            <SelectContent>
              {monthOptions.map(opt => (
                <SelectItem key={opt.key} value={opt.key} className="text-xs capitalize">
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <div
        ref={scrollRef}
        className="w-full overflow-x-auto pb-3"
        style={{ scrollbarWidth: 'thin' }}
      >
        <div className="flex items-start gap-0 pt-2" style={{ minWidth: `${Math.max(events.length * 200, 600)}px` }}>
          <div className="relative flex items-start w-full">
            {/* Horizontal line */}
            <div className="absolute top-[60px] left-0 right-0 h-[2px] bg-gradient-to-r from-primary/40 via-secondary/40 to-primary/40" />

            <div className="flex w-full">
              {events.map((ev) => {
                const config = EVENT_CONFIG[ev.eventType] || DEFAULT_CONFIG;
                const Icon = config.icon;
                const performer = ev.performedBy ? profileMap.get(ev.performedBy) : null;
                const d = new Date(ev.createdAt);

                return (
                  <div
                    key={ev.id}
                    ref={el => { if (el) eventRefs.current.set(ev.id, el); }}
                    className="flex flex-col items-center flex-shrink-0"
                    style={{ width: '180px' }}
                  >
                    {/* Card above line */}
                    <div className="relative mx-2 mb-3 rounded-xl border border-border/50 bg-card p-3 shadow-sm hover:shadow-md transition-shadow" style={{ minHeight: '100px' }}>
                      <div className="absolute -bottom-[7px] left-1/2 -translate-x-1/2 w-3 h-3 rotate-45 bg-card border-b border-r border-border/50" />

                      <Badge variant="outline" className={cn('text-[9px] mb-1.5', config.color)}>
                        {config.label}
                      </Badge>
                      <p className="text-xs font-medium leading-tight line-clamp-2">{ev.title}</p>
                      {ev.description && (
                        <p className="mt-1 text-[10px] text-muted-foreground line-clamp-2">{ev.description}</p>
                      )}

                      {performer && (
                        <div className="mt-2 flex items-center gap-1.5">
                          <Avatar className="h-4 w-4">
                            <AvatarImage src={performer.avatarUrl || ''} />
                            <AvatarFallback className="text-[7px] bg-secondary/20">
                              {performer.name?.charAt(0) || '?'}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-[9px] text-muted-foreground truncate max-w-[100px]">
                            {performer.name || 'Usuario'}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Dot on the line */}
                    <div className={cn('relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 border-background', config.bgColor)}>
                      <Icon className={cn('h-3.5 w-3.5', config.color)} />
                    </div>

                    {/* Date below line */}
                    <div className="mt-2 text-center">
                      <p className="text-[10px] font-semibold text-foreground">
                        {format(d, 'dd MMM', { locale: es })}
                      </p>
                      <p className="text-[9px] text-muted-foreground">
                        {format(d, 'yyyy')}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
