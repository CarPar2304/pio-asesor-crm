import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCRM } from '@/contexts/CRMContext';
import { CompanyTask } from '@/types/crm';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Check, Pencil } from 'lucide-react';

type TaskFilter = 'all' | 'pending' | 'overdue' | 'completed';

interface TaskItem {
  companyId: string;
  companyName: string;
  task: CompanyTask;
}

const todayISO = () => new Date().toISOString().split('T')[0];

const isOverdueTask = (task: CompanyTask) => task.status === 'pending' && task.dueDate < todayISO();

export default function Tasks() {
  const navigate = useNavigate();
  const { companies, updateTask } = useCRM();
  const [filter, setFilter] = useState<TaskFilter>('all');
  const [editing, setEditing] = useState<TaskItem | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [status, setStatus] = useState<'pending' | 'completed'>('pending');

  const allTasks = useMemo<TaskItem[]>(() => {
    return companies
      .flatMap((company) =>
        company.tasks.map((task) => ({
          companyId: company.id,
          companyName: company.tradeName,
          task,
        }))
      )
      .sort((a, b) => a.task.dueDate.localeCompare(b.task.dueDate));
  }, [companies]);

  const counts = useMemo(() => {
    const pending = allTasks.filter((item) => item.task.status === 'pending').length;
    const overdue = allTasks.filter((item) => isOverdueTask(item.task)).length;
    const completed = allTasks.filter((item) => item.task.status === 'completed').length;
    return { total: allTasks.length, pending, overdue, completed };
  }, [allTasks]);

  const filteredTasks = useMemo(() => {
    switch (filter) {
      case 'pending':
        return allTasks.filter((item) => item.task.status === 'pending');
      case 'overdue':
        return allTasks.filter((item) => isOverdueTask(item.task));
      case 'completed':
        return allTasks.filter((item) => item.task.status === 'completed');
      default:
        return allTasks;
    }
  }, [allTasks, filter]);

  const openEditor = (item: TaskItem) => {
    setEditing(item);
    setTitle(item.task.title);
    setDescription(item.task.description || '');
    setDueDate(item.task.dueDate);
    setStatus(item.task.status);
  };

  const handleSave = async () => {
    if (!editing || !title.trim() || !dueDate) return;

    await updateTask(editing.companyId, editing.task.id, {
      title: title.trim(),
      description: description.trim(),
      dueDate,
      status,
      completedDate: status === 'completed' ? editing.task.completedDate || todayISO() : null,
    });

    setEditing(null);
  };

  return (
    <div className="container py-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold">Tareas globales</h1>
        <p className="text-sm text-muted-foreground">Gestiona tareas de todas las empresas</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total" value={counts.total} />
        <StatCard label="Pendientes" value={counts.pending} />
        <StatCard label="Vencidas" value={counts.overdue} />
        <StatCard label="Completadas" value={counts.completed} />
      </div>

      <Tabs value={filter} onValueChange={(value) => setFilter(value as TaskFilter)}>
        <TabsList>
          <TabsTrigger value="all">Todas</TabsTrigger>
          <TabsTrigger value="pending">Pendientes</TabsTrigger>
          <TabsTrigger value="overdue">Vencidas</TabsTrigger>
          <TabsTrigger value="completed">Completadas</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="space-y-2">
        {filteredTasks.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No hay tareas para este filtro
          </div>
        ) : (
          filteredTasks.map((item) => {
            const overdue = isOverdueTask(item.task);
            return (
              <div key={item.task.id} className="flex flex-col gap-3 rounded-lg border border-border/60 bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <button
                    onClick={() => navigate(`/empresa/${item.companyId}`)}
                    className="text-sm font-medium text-left hover:underline"
                  >
                    {item.companyName}
                  </button>
                  <p className="text-sm">{item.task.title}</p>
                  {item.task.description && <p className="text-xs text-muted-foreground">{item.task.description}</p>}
                  <div className="mt-1 flex items-center gap-2">
                    <Badge variant={overdue ? 'destructive' : 'outline'}>{item.task.dueDate}</Badge>
                    {item.task.status === 'completed' && <Badge variant="secondary">Completada</Badge>}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {item.task.status === 'pending' && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                      onClick={() => updateTask(item.companyId, item.task.id, { status: 'completed', completedDate: todayISO() })}
                    >
                      <Check className="h-3.5 w-3.5" /> Completar
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => openEditor(item)}>
                    <Pencil className="h-3.5 w-3.5" /> Editar
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </div>

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar tarea</DialogTitle>
            <DialogDescription>Actualiza título, fecha y estado de la tarea.</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título" />
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descripción" rows={4} />
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as 'pending' | 'completed')}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="pending">Pendiente</option>
              <option value="completed">Completada</option>
            </select>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={handleSave}>Guardar cambios</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border/50 bg-card p-3">
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-bold">{value}</p>
    </div>
  );
}
