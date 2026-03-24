import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCRM } from '@/contexts/CRMContext';
import { useProfile } from '@/contexts/ProfileContext';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { useAuth } from '@/hooks/useAuth';
import { CompanyTask } from '@/types/crm';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Check, Pencil, UserCircle, GitBranch } from 'lucide-react';

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
  const { allProfiles } = useProfile();
  const { offers } = usePortfolio();
  const { session } = useAuth();
  const [filter, setFilter] = useState<TaskFilter>('all');
  const [editing, setEditing] = useState<TaskItem | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [status, setStatus] = useState<'pending' | 'completed'>('pending');
  const [assignedTo, setAssignedTo] = useState('');

  const myUserId = session?.user?.id;

  const getProfileName = (userId?: string) => {
    if (!userId) return null;
    const p = allProfiles.find(pr => pr.userId === userId);
    return p?.name || p?.email || null;
  };

  const getProfileAvatar = (userId?: string) => {
    if (!userId) return undefined;
    const p = allProfiles.find(pr => pr.userId === userId);
    return { url: p?.avatarUrl || undefined, initials: p?.name ? p.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() : '?' };
  };

  // Only show tasks created by me OR assigned to me
  const allTasks = useMemo<TaskItem[]>(() => {
    return companies
      .flatMap((company) =>
        company.tasks
          .filter(task => task.assignedTo === myUserId || task.createdBy === myUserId)
          .map((task) => ({
            companyId: company.id,
            companyName: company.tradeName,
            task,
          }))
      )
      .sort((a, b) => a.task.dueDate.localeCompare(b.task.dueDate));
  }, [companies, myUserId]);

  const counts = useMemo(() => {
    const pending = allTasks.filter((item) => item.task.status === 'pending').length;
    const overdue = allTasks.filter((item) => isOverdueTask(item.task)).length;
    const completed = allTasks.filter((item) => item.task.status === 'completed').length;
    return { total: allTasks.length, pending, overdue, completed };
  }, [allTasks]);

  const filteredTasks = useMemo(() => {
    switch (filter) {
      case 'pending': return allTasks.filter((item) => item.task.status === 'pending');
      case 'overdue': return allTasks.filter((item) => isOverdueTask(item.task));
      case 'completed': return allTasks.filter((item) => item.task.status === 'completed');
      default: return allTasks;
    }
  }, [allTasks, filter]);

  const openEditor = (item: TaskItem) => {
    setEditing(item);
    setTitle(item.task.title);
    setDescription(item.task.description || '');
    setDueDate(item.task.dueDate);
    setStatus(item.task.status);
    setAssignedTo(item.task.assignedTo || '');
  };

  const handleSave = async () => {
    if (!editing || !title.trim() || !dueDate) return;
    await updateTask(editing.companyId, editing.task.id, {
      title: title.trim(), description: description.trim(), dueDate, status,
      completedDate: status === 'completed' ? editing.task.completedDate || todayISO() : null,
      assignedTo: assignedTo || undefined,
    });
    setEditing(null);
  };

  return (
    <div className="container py-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold">Mis tareas</h1>
        <p className="text-sm text-muted-foreground">Tareas asignadas a ti o creadas por ti</p>
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
            const avatar = getProfileAvatar(item.task.assignedTo);
            const assigneeName = getProfileName(item.task.assignedTo);
            const creatorName = getProfileName(item.task.createdBy);
            const isAssignedToMe = item.task.assignedTo === myUserId;
            const wasAssignedByOther = item.task.createdBy && item.task.createdBy !== myUserId;
            const offerName = item.task.offerId ? offers.find(o => o.id === item.task.offerId)?.name : null;
            const wasAssignedByOther = item.task.createdBy && item.task.createdBy !== myUserId;

            return (
              <div key={item.task.id} className="flex flex-col gap-3 rounded-lg border border-border/60 bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 flex-1">
                  <button onClick={() => navigate(`/empresa/${item.companyId}`)} className="text-sm font-medium text-left hover:underline">
                    {item.companyName}
                  </button>
                  <p className="text-sm">{item.task.title}</p>
                  {item.task.description && <p className="text-xs text-muted-foreground">{item.task.description}</p>}
                  <div className="mt-1 flex items-center gap-2 flex-wrap">
                    <Badge variant={overdue ? 'destructive' : 'outline'}>{item.task.dueDate}</Badge>
                    {item.task.status === 'completed' && <Badge variant="secondary">Completada</Badge>}
                    {assigneeName && (
                      <div className="flex items-center gap-1.5">
                        <Avatar className="h-5 w-5">
                          <AvatarImage src={avatar?.url} />
                          <AvatarFallback className="bg-primary/10 text-primary text-[9px]">{avatar?.initials}</AvatarFallback>
                        </Avatar>
                        <span className="text-xs text-muted-foreground">{assigneeName}</span>
                      </div>
                    )}
                    {wasAssignedByOther && creatorName && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <UserCircle className="h-3 w-3" />
                        <span>Asignada por {creatorName}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {item.task.status === 'pending' && (
                    <Button size="sm" variant="outline" className="gap-1.5"
                      onClick={() => updateTask(item.companyId, item.task.id, { status: 'completed', completedDate: todayISO() })}>
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
            <DialogDescription>Actualiza título, fecha, responsable y estado de la tarea.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título" />
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descripción" rows={4} />
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            <div>
              <label className="text-xs font-medium text-muted-foreground">Responsable</label>
              <Select value={assignedTo} onValueChange={setAssignedTo}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Seleccionar responsable" /></SelectTrigger>
                <SelectContent>
                  {allProfiles.map(p => (
                    <SelectItem key={p.userId} value={p.userId}>{p.name || p.email || p.userId.slice(0, 8)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <select value={status} onChange={(e) => setStatus(e.target.value as 'pending' | 'completed')} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
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
