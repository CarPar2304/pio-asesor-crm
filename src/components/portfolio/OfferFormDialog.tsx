import { useState } from 'react';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { PortfolioOffer, OfferType, OfferStatus } from '@/types/portfolio';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Plus, X } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  offer?: PortfolioOffer;
}

const TYPE_LABELS: Record<OfferType, string> = { product: 'Producto', service: 'Servicio' };
const STATUS_LABELS: Record<OfferStatus, string> = { active: 'Activo', inactive: 'Inactivo', draft: 'Borrador' };

export default function OfferFormDialog({ open, onClose, offer }: Props) {
  const { categories, createCategory, createOffer, updateOffer } = usePortfolio();
  const [name, setName] = useState(offer?.name ?? '');
  const [description, setDescription] = useState(offer?.description ?? '');
  const [type, setType] = useState<OfferType>(offer?.type ?? 'service');
  const [categoryId, setCategoryId] = useState<string>(offer?.categoryId ?? '');
  const [startDate, setStartDate] = useState(offer?.startDate ?? '');
  const [endDate, setEndDate] = useState(offer?.endDate ?? '');
  const [status, setStatus] = useState<OfferStatus>(offer?.status ?? 'active');
  const [saving, setSaving] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatColor, setNewCatColor] = useState('#6366f1');
  const [showNewCat, setShowNewCat] = useState(false);

  const handleAddCategory = async () => {
    if (!newCatName.trim()) return;
    const cat = await createCategory(newCatName.trim(), newCatColor);
    if (cat) { setCategoryId(cat.id); setShowNewCat(false); setNewCatName(''); }
  };

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    const payload = {
      name: name.trim(), description, type, categoryId: categoryId || null,
      startDate: startDate || null, endDate: endDate || null, status,
    };
    if (offer) {
      await updateOffer(offer.id, payload);
    } else {
      await createOffer(payload);
    }
    setSaving(false);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{offer ? 'Editar oferta' : 'Nueva oferta'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label>Nombre *</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Nombre de la oferta" />
          </div>

          <div className="space-y-1.5">
            <Label>Descripción</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Describe esta oferta..." rows={3} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={type} onValueChange={v => setType(v as OfferType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(TYPE_LABELS) as OfferType[]).map(t => (
                    <SelectItem key={t} value={t}>{TYPE_LABELS[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Estado</Label>
              <Select value={status} onValueChange={v => setStatus(v as OfferStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(STATUS_LABELS) as OfferStatus[]).map(s => (
                    <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Category */}
          <div className="space-y-1.5">
            <Label>Categoría</Label>
            <div className="flex gap-2">
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Seleccionar categoría" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      <div className="flex items-center gap-2">
                        <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c.color }} />
                        {c.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button type="button" variant="outline" size="icon" onClick={() => setShowNewCat(v => !v)}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {showNewCat && (
              <div className="flex items-center gap-2 rounded-md border border-border p-2">
                <input type="color" value={newCatColor} onChange={e => setNewCatColor(e.target.value)} className="h-8 w-8 cursor-pointer rounded border-0 bg-transparent p-0" />
                <Input value={newCatName} onChange={e => setNewCatName(e.target.value)} placeholder="Nueva categoría" className="h-8 flex-1" onKeyDown={e => e.key === 'Enter' && handleAddCategory()} />
                <Button type="button" size="sm" onClick={handleAddCategory}>Crear</Button>
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowNewCat(false)}><X className="h-3.5 w-3.5" /></Button>
              </div>
            )}
            {categoryId && (
              <div className="flex items-center gap-1">
                {(() => { const c = categories.find(c => c.id === categoryId); return c ? <Badge style={{ backgroundColor: c.color + '20', color: c.color, borderColor: c.color + '40' }} className="border text-xs">{c.name}</Badge> : null; })()}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Fecha inicio</Label>
              <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Fecha fin</Label>
              <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={saving || !name.trim()}>
              {saving ? 'Guardando...' : offer ? 'Guardar cambios' : 'Crear oferta'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
