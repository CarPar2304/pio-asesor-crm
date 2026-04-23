import { useState, useEffect, useRef, useMemo } from 'react';
import { fetchCompanyHistory, HistoryEvent } from '@/lib/historyHelper';
import { useProfile } from '@/contexts/ProfileContext';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { MousePointerClick, Flag, CheckSquare, GitBranch, StickyNote, Briefcase, Clock, FileText, CalendarIcon, X } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';

const EVENT_CONFIG: Record<string, { icon: typeof MousePointerClick; color: string; bgColor: string; label: string }> = {
  action: { icon: MousePointerClick, color: 'text-primary', bgColor: 'bg-primary/10', label: 'Toque' },
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

/** Effective date: event_date if present, else created_at */
const effectiveDate = (ev: HistoryEvent) => ev.eventDate || ev.createdAt;

export default function CompanyTimeline({ companyId }: Props) {
  const [events, setEvents] = useState<HistoryEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [fromDate, setFromDate] = useState<Date | undefined>(undefined);
  const [toDate, setToDate] = useState<Date | undefined>(undefined);
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

  // Apply date range filter
  const filteredEvents = useMemo(() => {
    if (!fromDate && !toDate) return events;
    return events.filter(ev => {
      const d = new Date(effectiveDate(ev));
      if (fromDate && d < new Date(fromDate.setHours(0, 0, 0, 0))) return false;
      if (toDate && d > new Date(new Date(toDate).setHours(23, 59, 59, 999))) return false;
      return true;
    });
  }, [events, fromDate, toDate]);

  // Scroll to end (latest) on load / when filter changes
  useEffect(() => {
    if (!loading && scrollRef.current) {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
    }
  }, [loading, filteredEvents.length]);

  // Available months for navigation (based on filtered events)
  const monthOptions = useMemo(() => {
    const seen = new Map<string, string>();
    filteredEvents.forEach(ev => {
      const d = new Date(effectiveDate(ev));
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!seen.has(key)) {
        seen.set(key, format(d, 'MMM yyyy', { locale: es }));
      }
    });
    return Array.from(seen.entries()).map(([key, label]) => ({ key, label }));
  }, [filteredEvents]);

  const scrollToMonth = (monthKey: string) => {
    const idx = filteredEvents.findIndex(ev => {
      const d = new Date(effectiveDate(ev));
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      return k === monthKey;
    });
    if (idx >= 0) {
      const el = eventRefs.current.get(filteredEvents[idx].id);
      if (el && scrollRef.current) {
        const container = scrollRef.current;
        const scrollLeft = el.offsetLeft - container.offsetLeft - 40;
        container.scrollTo({ left: scrollLeft, behavior: 'smooth' });
      }
    }
  };

  const clearDates = () => {
    setFromDate(undefined);
    setToDate(undefined);
  };

  const hasFilter = !!(fromDate || toDate);

  if (loading) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">Cargando timeline...</div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Timeline</h3>
        <div className="flex flex-wrap items-center gap-2">
          {/* Date range filter */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                <CalendarIcon className="h-3 w-3" />
                {fromDate ? format(fromDate, 'dd MMM yy', { locale: es }) : 'Desde'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar mode="single" selected={fromDate} onSelect={setFromDate} className="pointer-events-auto" />
            </PopoverContent>
          </Popover>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                <CalendarIcon className="h-3 w-3" />
                {toDate ? format(toDate, 'dd MMM yy', { locale: es }) : 'Hasta'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar mode="single" selected={toDate} onSelect={setToDate} className="pointer-events-auto" />
            </PopoverContent>
          </Popover>
          {hasFilter && (
            <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs text-muted-foreground" onClick={clearDates}>
              <X className="h-3 w-3" /> Limpiar
            </Button>
          )}
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
      </div>

      {filteredEvents.length === 0 ? (
        <div className="py-8 text-center text-sm text-muted-foreground">
          {hasFilter
            ? 'Sin eventos en el rango seleccionado.'
            : 'Sin histórico registrado. Las nuevas acciones, hitos, tareas y movimientos aparecerán aquí.'}
        </div>
      ) : (
        <div
          ref={scrollRef}
          className="w-full overflow-x-auto pb-3"
          style={{ scrollbarWidth: 'thin' }}
        >
          <div className="flex items-start gap-0 pt-2" style={{ minWidth: `${Math.max(filteredEvents.length * 200, 600)}px` }}>
            <div className="relative flex items-start w-full">
              {/* Horizontal line */}
              <div className="absolute top-[60px] left-0 right-0 h-[2px] bg-gradient-to-r from-primary/40 via-secondary/40 to-primary/40" />

              <div className="flex w-full">
                {filteredEvents.map((ev) => {
                  const config = EVENT_CONFIG[ev.eventType] || DEFAULT_CONFIG;
                  const Icon = config.icon;
                  const performer = ev.performedBy ? profileMap.get(ev.performedBy) : null;
                  const d = new Date(effectiveDate(ev));

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
      )}
    </div>
  );
}
