import { useState, useEffect, useCallback } from 'react';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { PortfolioOffer, OfferStatus, PRODUCT_OPTIONS } from '@/types/portfolio';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, X, Users, Upload, Clipboard } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface Props {
  open: boolean;
  onClose: () => void;
  offer?: PortfolioOffer;
}

const STATUS_LABELS: Record<OfferStatus, string> = { active: 'Activo', inactive: 'Inactivo', draft: 'Borrador' };

export default function OfferFormDialog({ open, onClose, offer }: Props) {
  const { categories, createCategory, createOffer, updateOffer, allies, createAlly, linkAllyToOffer, unlinkAllyFromOffer, getAlliesForOffer } = usePortfolio();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [product, setProduct] = useState('');
  const [customProduct, setCustomProduct] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [status, setStatus] = useState<OfferStatus>('active');
  const [saving, setSaving] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatColor, setNewCatColor] = useState('#6366f1');
  const [showNewCat, setShowNewCat] = useState(false);

  const [selectedAllyIds, setSelectedAllyIds] = useState<string[]>([]);
  const [showNewAlly, setShowNewAlly] = useState(false);
  const [newAllyName, setNewAllyName] = useState('');
  const [newAllyLogo, setNewAllyLogo] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  useEffect(() => {
    if (open) {
      setName(offer?.name ?? '');
      setDescription(offer?.description ?? '');
      const offerProduct = offer?.product ?? '';
      const isStandard = PRODUCT_OPTIONS.includes(offerProduct as any) || offerProduct === '';
      setProduct(isStandard ? offerProduct : 'Otro');
      setCustomProduct(isStandard ? '' : offerProduct);
      setCategoryId(offer?.categoryId ?? '');
      setStartDate(offer?.startDate ?? '');
      setEndDate(offer?.endDate ?? '');
      setStatus(offer?.status ?? 'active');
      setShowNewCat(false);
      setShowNewAlly(false);
      setNewAllyName('');
      setNewAllyLogo(null);
      if (offer) {
        const offerAllyList = getAlliesForOffer(offer.id);
        setSelectedAllyIds(offerAllyList.map(a => a.id));
      } else {
        setSelectedAllyIds([]);
      }
    }
  }, [open, offer]);

  const handleAddCategory = async () => {
    if (!newCatName.trim()) return;
    const cat = await createCategory(newCatName.trim(), newCatColor);
    if (cat) { setCategoryId(cat.id); setShowNewCat(false); setNewCatName(''); }
  };

  const uploadFile = async (file: File): Promise<string | null> => {
    const ext = file.name?.split('.').pop() || 'png';
    const path = `ally-logos/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('company-logos').upload(path, file);
    if (error) return null;
    const { data: { publicUrl } } = supabase.storage.from('company-logos').getPublicUrl(path);
    return publicUrl;
  };

  const handleAllyLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLogo(true);
    const url = await uploadFile(file);
    if (url) setNewAllyLogo(url);
    setUploadingLogo(false);
  };

  const handleAllyLogoPaste = useCallback(async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file) return;
        setUploadingLogo(true);
        const url = await uploadFile(file);
        if (url) setNewAllyLogo(url);
        setUploadingLogo(false);
        return;
      }
    }
  }, []);

  const handleAddAlly = async () => {
    if (!newAllyName.trim()) return;
    const ally = await createAlly(newAllyName.trim(), newAllyLogo);
    if (ally) {
      setSelectedAllyIds(prev => [...prev, ally.id]);
      setShowNewAlly(false);
      setNewAllyName('');
      setNewAllyLogo(null);
    }
  };

  const toggleAlly = (allyId: string) => {
    setSelectedAllyIds(prev => prev.includes(allyId) ? prev.filter(id => id !== allyId) : [...prev, allyId]);
  };

  const resolvedProduct = product === 'Otro' ? customProduct.trim() : product;

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    const payload = {
      name: name.trim(), description, type: 'service',
      product: resolvedProduct,
      categoryId: categoryId || null,
      startDate: startDate || null, endDate: endDate || null, status,
    };

    let offerId: string;
    if (offer) {
      await updateOffer(offer.id, payload);
      offerId = offer.id;
      const currentAllies = getAlliesForOffer(offer.id);
      const currentIds = currentAllies.map(a => a.id);
      for (const id of selectedAllyIds) {
        if (!currentIds.includes(id)) await linkAllyToOffer(offerId, id);
      }
      for (const id of currentIds) {
        if (!selectedAllyIds.includes(id)) await unlinkAllyFromOffer(offerId, id);
      }
    } else {
      const created = await createOffer(payload);
      if (created) {
        offerId = created.id;
        for (const allyId of selectedAllyIds) {
          await linkAllyToOffer(offerId, allyId);
        }
      }
    }
    setSaving(false);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle>{offer ? 'Editar oferta' : 'Nueva oferta'}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 pb-6">
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>Nombre *</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="Nombre de la oferta" />
            </div>

            <div className="space-y-1.5">
              <Label>Descripción</Label>
              <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Describe esta oferta..." rows={3} />
            </div>

            <div className="space-y-1.5">
              <Label>Producto</Label>
              <Select value={product || 'placeholder'} onValueChange={v => { setProduct(v === 'placeholder' ? '' : v); if (v !== 'Otro') setCustomProduct(''); }}>
                <SelectTrigger><SelectValue placeholder="Seleccionar producto" /></SelectTrigger>
                <SelectContent>
                  {PRODUCT_OPTIONS.map(p => (<SelectItem key={p} value={p}>{p}</SelectItem>))}
                </SelectContent>
              </Select>
              {product === 'Otro' && (
                <Input value={customProduct} onChange={e => setCustomProduct(e.target.value)} placeholder="¿Cuál?" className="mt-1.5" />
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Categoría</Label>
                <div className="flex gap-1.5">
                  <Select value={categoryId || 'none'} onValueChange={v => setCategoryId(v === 'none' ? '' : v)}>
                    <SelectTrigger className="flex-1"><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sin categoría</SelectItem>
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
                  <Button type="button" variant="outline" size="icon" className="shrink-0" onClick={() => setShowNewCat(v => !v)}>
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

            {categoryId && (
              <div className="flex items-center gap-1">
                {(() => { const c = categories.find(c => c.id === categoryId); return c ? <Badge style={{ backgroundColor: c.color + '20', color: c.color, borderColor: c.color + '40' }} className="border text-xs">{c.name}</Badge> : null; })()}
              </div>
            )}

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

            {/* Aliados section */}
            <div className="space-y-2 border-t border-border/40 pt-4">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> Aliados</Label>
                <Button type="button" variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => setShowNewAlly(v => !v)}>
                  <Plus className="h-3 w-3" /> Nuevo aliado
                </Button>
              </div>

              {showNewAlly && (
                <div className="rounded-md border border-border p-3 space-y-2" onPaste={handleAllyLogoPaste}>
                  <div className="flex items-center gap-2">
                    {newAllyLogo ? (
                      <img src={newAllyLogo} alt="" className="h-10 w-10 rounded-md border border-border/40 object-contain bg-white p-0.5" />
                    ) : (
                      <label className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-md border border-dashed border-border bg-muted/30 hover:bg-muted/50 transition-colors" title="Clic para cargar o Ctrl+V para pegar">
                        <Upload className="h-4 w-4 text-muted-foreground" />
                        <input type="file" accept="image/*" className="hidden" onChange={handleAllyLogoUpload} disabled={uploadingLogo} />
                      </label>
                    )}
                    <Input value={newAllyName} onChange={e => setNewAllyName(e.target.value)} placeholder="Nombre del aliado" className="h-8 flex-1" onKeyDown={e => e.key === 'Enter' && handleAddAlly()} />
                    <Button type="button" size="sm" onClick={handleAddAlly} disabled={!newAllyName.trim()}>Crear</Button>
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setShowNewAlly(false); setNewAllyName(''); setNewAllyLogo(null); }}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <p className="text-[10px] text-muted-foreground flex items-center gap-1"><Clipboard className="h-3 w-3" /> Ctrl+V para pegar logo desde portapapeles</p>
                </div>
              )}

              {allies.length > 0 && (
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {allies.map(ally => {
                    const selected = selectedAllyIds.includes(ally.id);
                    return (
                      <button key={ally.id} type="button" onClick={() => toggleAlly(ally.id)}
                        className={`w-full flex items-center gap-2 rounded-md border p-2 text-left transition-colors text-sm ${selected ? 'border-primary bg-primary/5' : 'border-border/50 hover:border-primary/40'}`}>
                        {ally.logo ? (
                          <img src={ally.logo} alt="" className="h-6 w-6 rounded object-contain bg-white" />
                        ) : (
                          <div className="flex h-6 w-6 items-center justify-center rounded bg-primary/10 text-[10px] font-bold text-primary">{ally.name.charAt(0)}</div>
                        )}
                        <span className="flex-1 truncate">{ally.name}</span>
                        {selected && <Badge variant="secondary" className="text-[10px]">Vinculado</Badge>}
                      </button>
                    );
                  })}
                </div>
              )}

              {selectedAllyIds.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {selectedAllyIds.map(id => {
                    const ally = allies.find(a => a.id === id);
                    if (!ally) return null;
                    return (
                      <Badge key={id} variant="outline" className="gap-1 text-xs">
                        {ally.name}
                        <X className="h-3 w-3 cursor-pointer" onClick={() => toggleAlly(id)} />
                      </Badge>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={onClose}>Cancelar</Button>
              <Button onClick={handleSubmit} disabled={saving || !name.trim()}>
                {saving ? 'Guardando...' : offer ? 'Guardar cambios' : 'Crear oferta'}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
