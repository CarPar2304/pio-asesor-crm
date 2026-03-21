import { useState } from 'react';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { PipelineStage, STAGE_ICONS, STAGE_COLORS } from '@/types/portfolio';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import * as Icons from 'lucide-react';
import { Plus, Trash2, GripVertical, Pencil, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  open: boolean;
  onClose: () => void;
  offerId: string;
}

export default function StageManagerDialog({ open, onClose, offerId }: Props) {
  const { getStagesForOffer, createStage, updateStage, deleteStage, reorderStages } = usePortfolio();
  const stagesForOffer = getStagesForOffer(offerId);

  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState<string>(STAGE_COLORS[0]);
  const [newIcon, setNewIcon] = useState('Circle');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');
  const [editIcon, setEditIcon] = useState('');
  const [iconSearch, setIconSearch] = useState('');

  const filteredIcons = iconSearch
    ? STAGE_ICONS.filter(i => i.toLowerCase().includes(iconSearch.toLowerCase()))
    : STAGE_ICONS;

  const handleCreate = async () => {
    if (!newName.trim()) return;
    await createStage(offerId, newName.trim(), newColor, newIcon);
    setNewName('');
  };

  const startEdit = (s: PipelineStage) => {
    setEditingId(s.id);
    setEditName(s.name);
    setEditColor(s.color);
    setEditIcon(s.icon);
  };

  const saveEdit = async () => {
    if (!editingId || !editName.trim()) return;
    await updateStage(editingId, { name: editName.trim(), color: editColor, icon: editIcon });
    setEditingId(null);
  };

  const handleDelete = async (id: string) => {
    if (stagesForOffer.length <= 1) { alert('Debe haber al menos una etapa'); return; }
    if (confirm('¿Eliminar esta etapa? Las empresas serán movidas a la primera etapa.')) {
      await deleteStage(id, offerId);
    }
  };

  const moveUp = async (idx: number) => {
    if (idx === 0) return;
    const ids = stagesForOffer.map(s => s.id);
    [ids[idx - 1], ids[idx]] = [ids[idx], ids[idx - 1]];
    await reorderStages(offerId, ids);
  };

  const moveDown = async (idx: number) => {
    if (idx >= stagesForOffer.length - 1) return;
    const ids = stagesForOffer.map(s => s.id);
    [ids[idx], ids[idx + 1]] = [ids[idx + 1], ids[idx]];
    await reorderStages(offerId, ids);
  };

  const IconComponent = ({ name, ...props }: { name: string; [k: string]: any }) => {
    const Comp = (Icons as any)[name] || Icons.Circle;
    return <Comp {...props} />;
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Gestionar etapas del pipeline</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 pt-2">
          {stagesForOffer.map((stage, idx) => (
            <div key={stage.id} className="rounded-lg border border-border/50 p-3">
              {editingId === stage.id ? (
                <div className="space-y-2">
                  <Input value={editName} onChange={e => setEditName(e.target.value)} className="h-8" />
                  <div className="flex flex-wrap gap-1">
                    {STAGE_COLORS.map(c => (
                      <button key={c} onClick={() => setEditColor(c)}
                        className={cn('h-5 w-5 rounded-full border-2 transition-transform hover:scale-110', editColor === c ? 'border-foreground scale-110' : 'border-transparent')}
                        style={{ backgroundColor: c }} />
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {STAGE_ICONS.map(icon => (
                      <button key={icon} onClick={() => setEditIcon(icon)}
                        className={cn('rounded p-1 transition-colors hover:bg-muted', editIcon === icon && 'bg-muted ring-1 ring-primary')}>
                        <IconComponent name={icon} className="h-3.5 w-3.5" />
                      </button>
                    ))}
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}><X className="h-3.5 w-3.5" /></Button>
                    <Button size="sm" onClick={saveEdit}><Check className="h-3.5 w-3.5" /></Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <div className="flex flex-col gap-0.5">
                    <button onClick={() => moveUp(idx)} className="p-0.5 text-muted-foreground/40 hover:text-muted-foreground disabled:opacity-20" disabled={idx === 0}>▲</button>
                    <button onClick={() => moveDown(idx)} className="p-0.5 text-muted-foreground/40 hover:text-muted-foreground disabled:opacity-20" disabled={idx === stagesForOffer.length - 1}>▼</button>
                  </div>
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md" style={{ backgroundColor: stage.color + '20' }}>
                    <IconComponent name={stage.icon} className="h-3.5 w-3.5" style={{ color: stage.color }} />
                  </div>
                  <span className="flex-1 text-sm font-medium">{stage.name}</span>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" onClick={() => startEdit(stage)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => handleDelete(stage.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>
          ))}

          {/* New stage */}
          <div className="rounded-lg border border-dashed border-border p-3 space-y-2">
            <Label className="text-xs text-muted-foreground">Nueva etapa</Label>
            <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nombre de la etapa" className="h-8" onKeyDown={e => e.key === 'Enter' && handleCreate()} />
            <div className="flex flex-wrap gap-1">
              {STAGE_COLORS.map(c => (
                <button key={c} onClick={() => setNewColor(c)}
                  className={cn('h-5 w-5 rounded-full border-2 transition-transform hover:scale-110', newColor === c ? 'border-foreground scale-110' : 'border-transparent')}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
            <div className="flex flex-wrap gap-1">
              {STAGE_ICONS.map(icon => (
                <button key={icon} onClick={() => setNewIcon(icon)}
                  className={cn('rounded p-1 transition-colors hover:bg-muted', newIcon === icon && 'bg-muted ring-1 ring-primary')}>
                  <IconComponent name={icon} className="h-3.5 w-3.5" />
                </button>
              ))}
            </div>
            <Button size="sm" onClick={handleCreate} disabled={!newName.trim()} className="gap-1">
              <Plus className="h-3.5 w-3.5" /> Agregar etapa
            </Button>
          </div>

          <div className="flex justify-end pt-1">
            <Button onClick={onClose}>Cerrar</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
