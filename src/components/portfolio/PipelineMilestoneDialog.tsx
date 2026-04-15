import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCRM } from '@/contexts/CRMContext';
import { Milestone, MilestoneType, MILESTONE_TYPE_LABELS } from '@/types/crm';
import { showSuccess, showError } from '@/lib/toast';
import { format } from 'date-fns';

interface Props {
  open: boolean;
  onClose: () => void;
  companyId: string;
  companyName: string;
}

const MILESTONE_TYPES = Object.entries(MILESTONE_TYPE_LABELS).map(([value, label]) => ({ value: value as MilestoneType, label }));

export default function PipelineMilestoneDialog({ open, onClose, companyId, companyName }: Props) {
  const { addMilestone } = useCRM();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [type, setType] = useState<MilestoneType>('capital');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      const milestone: Milestone = {
        id: crypto.randomUUID(),
        title: title.trim(),
        description: description.trim(),
        date,
        type,
      };
      await addMilestone(companyId, milestone);
      showSuccess('Hito registrado', `"${title}" guardado para ${companyName}`);
      setTitle('');
      setDescription('');
      setType('capital');
      setDate(format(new Date(), 'yyyy-MM-dd'));
      onClose();
    } catch {
      showError('Error', 'No se pudo guardar el hito');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Nuevo hito · {companyName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-2">
          <div>
            <Label className="text-xs">Título</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Ej: Ganó convocatoria..." className="mt-1" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Tipo</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger className="mt-1 h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MILESTONE_TYPES.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Fecha</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="mt-1 h-9 text-xs" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Descripción (opcional)</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} className="mt-1 text-xs" />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
            <Button size="sm" onClick={handleSave} disabled={!title.trim() || saving}>
              {saving ? 'Guardando…' : 'Guardar hito'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
