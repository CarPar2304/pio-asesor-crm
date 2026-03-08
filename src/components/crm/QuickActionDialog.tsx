import { useState } from 'react';
import { format } from 'date-fns';
import { showSuccess } from '@/lib/toast';
import { es } from 'date-fns/locale';
import { CompanyAction, ActionType, Milestone, MilestoneType, CompanyTask, ACTION_TYPE_LABELS, MILESTONE_TYPE_LABELS } from '@/types/crm';
import { useCRM } from '@/contexts/CRMContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  type: 'action' | 'task' | 'milestone' | null;
  companyId: string;
  onClose: () => void;
}

export default function QuickActionDialog({ type, companyId, onClose }: Props) {
  const { addAction, addMilestone, addTask } = useCRM();
  const [date, setDate] = useState<Date>(new Date());
  const [dueDate, setDueDate] = useState<Date>(new Date());
  const [actionType, setActionType] = useState<ActionType>('meeting');
  const [milestoneType, setMilestoneType] = useState<MilestoneType>('capital');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');

  const reset = () => {
    setDate(new Date());
    setDueDate(new Date());
    setActionType('meeting');
    setMilestoneType('capital');
    setTitle('');
    setDescription('');
    setNotes('');
  };

  const handleSave = async () => {
    if (type === 'action') {
      const action: CompanyAction = {
        id: crypto.randomUUID(),
        type: actionType,
        description,
        date: format(date, 'yyyy-MM-dd'),
        notes: notes || undefined,
      };
      await addAction(companyId, action);
      showSuccess('Acción registrada', `${ACTION_TYPE_LABELS[actionType]} guardada exitosamente`);
    } else if (type === 'milestone') {
      const milestone: Milestone = {
        id: crypto.randomUUID(),
        type: milestoneType,
        title,
        description,
        date: format(date, 'yyyy-MM-dd'),
      };
      await addMilestone(companyId, milestone);
      showSuccess('Hito registrado', `"${title}" guardado exitosamente`);
    } else if (type === 'task') {
      const task: CompanyTask = {
        id: crypto.randomUUID(),
        title,
        description,
        status: 'pending',
        dueDate: format(dueDate, 'yyyy-MM-dd'),
      };
      await addTask(companyId, task);
      showSuccess('Tarea creada', `"${title}" creada exitosamente`);
    }
    reset();
    onClose();
  };

  const titles: Record<string, string> = {
    action: 'Registrar acción',
    task: 'Crear tarea',
    milestone: 'Registrar hito',
  };

  const DatePicker = ({ value, onSelect }: { value: Date; onSelect: (d: Date | undefined) => void }) => (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className={cn('h-9 w-full justify-start text-left text-sm font-normal')}>
          <CalendarIcon className="mr-2 h-3.5 w-3.5" />
          {format(value, 'PPP', { locale: es })}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar mode="single" selected={value} onSelect={onSelect} className="pointer-events-auto" />
      </PopoverContent>
    </Popover>
  );

  return (
    <Dialog open={!!type} onOpenChange={() => { reset(); onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{type ? titles[type] : ''}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          {type === 'action' && (
            <>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Tipo de acción</label>
                <Select value={actionType} onValueChange={v => setActionType(v as ActionType)}>
                  <SelectTrigger className="mt-1 h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(ACTION_TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Descripción</label>
                <Textarea className="mt-1 text-sm" rows={2} value={description} onChange={e => setDescription(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Fecha</label>
                <div className="mt-1"><DatePicker value={date} onSelect={d => d && setDate(d)} /></div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Notas (opcional)</label>
                <Input className="mt-1 h-9 text-sm" value={notes} onChange={e => setNotes(e.target.value)} />
              </div>
            </>
          )}

          {type === 'milestone' && (
            <>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Tipo de hito</label>
                <Select value={milestoneType} onValueChange={v => setMilestoneType(v as MilestoneType)}>
                  <SelectTrigger className="mt-1 h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(MILESTONE_TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Título</label>
                <Input className="mt-1 h-9 text-sm" value={title} onChange={e => setTitle(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Descripción</label>
                <Textarea className="mt-1 text-sm" rows={2} value={description} onChange={e => setDescription(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Fecha</label>
                <div className="mt-1"><DatePicker value={date} onSelect={d => d && setDate(d)} /></div>
              </div>
            </>
          )}

          {type === 'task' && (
            <>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Título</label>
                <Input className="mt-1 h-9 text-sm" value={title} onChange={e => setTitle(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Descripción</label>
                <Textarea className="mt-1 text-sm" rows={2} value={description} onChange={e => setDescription(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Fecha de vencimiento</label>
                <div className="mt-1"><DatePicker value={dueDate} onSelect={d => d && setDueDate(d)} /></div>
              </div>
            </>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => { reset(); onClose(); }}>Cancelar</Button>
            <Button size="sm" onClick={handleSave}>Guardar</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
