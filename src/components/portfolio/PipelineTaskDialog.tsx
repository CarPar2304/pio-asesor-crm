import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useProfile } from '@/contexts/ProfileContext';
import { useCRM } from '@/contexts/CRMContext';
import { CompanyTask } from '@/types/crm';
import { showSuccess, showError } from '@/lib/toast';
import { format, addDays } from 'date-fns';

interface Props {
  open: boolean;
  onClose: () => void;
  companyId: string;
  companyName: string;
  offerId: string;
}

export default function PipelineTaskDialog({ open, onClose, companyId, companyName, offerId }: Props) {
  const { allProfiles } = useProfile();
  const { addTask } = useCRM();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState(format(addDays(new Date(), 7), 'yyyy-MM-dd'));
  const [assignedTo, setAssignedTo] = useState('');
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setTitle('');
    setDescription('');
    setDueDate(format(addDays(new Date(), 7), 'yyyy-MM-dd'));
    setAssignedTo('');
  };

  const handleSubmit = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      const task: CompanyTask = {
        id: crypto.randomUUID(),
        title: title.trim(),
        description: description.trim(),
        status: 'pending',
        dueDate,
        assignedTo: assignedTo || undefined,
        offerId,
      };
      await addTask(companyId, task);
      showSuccess('Tarea creada exitosamente');
      reset();
      onClose();
    } catch {
      showError('Error al crear la tarea');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { reset(); onClose(); } }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Asignar tarea a {companyName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Título *</Label>
            <Input
              placeholder="Ej: Enviar propuesta comercial"
              value={title}
              onChange={e => setTitle(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Descripción</Label>
            <Textarea
              placeholder="Detalles de la tarea…"
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Fecha límite</Label>
              <Input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Responsable</Label>
              <Select value={assignedTo} onValueChange={setAssignedTo}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar…" />
                </SelectTrigger>
                <SelectContent>
                  {allProfiles.map(p => (
                    <SelectItem key={p.userId} value={p.userId}>
                      {p.name || 'Sin nombre'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => { reset(); onClose(); }}>
              Cancelar
            </Button>
            <Button size="sm" onClick={handleSubmit} disabled={!title.trim() || saving}>
              {saving ? 'Creando…' : 'Crear tarea'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
