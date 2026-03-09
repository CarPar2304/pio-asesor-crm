import { useState } from 'react';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { useCRM } from '@/contexts/CRMContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Package, GitBranch } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  companyId: string;
  companyName: string;
}

export default function AddToPipelineDialog({ open, onClose, companyId, companyName }: Props) {
  const { offers, getStagesForOffer, addCompanyToStage, isCompanyInOffer, categories } = usePortfolio();
  const [selectedOfferId, setSelectedOfferId] = useState('');
  const [selectedStageId, setSelectedStageId] = useState('');
  const [adding, setAdding] = useState(false);

  const activeOffers = offers.filter(o => o.status === 'active');
  const selectedOffer = offers.find(o => o.id === selectedOfferId);
  const stages = selectedOfferId ? getStagesForOffer(selectedOfferId) : [];
  const alreadyIn = selectedOfferId ? isCompanyInOffer(selectedOfferId, companyId) : false;

  const handleOfferChange = (id: string) => {
    setSelectedOfferId(id);
    const stgs = getStagesForOffer(id);
    setSelectedStageId(stgs[0]?.id ?? '');
  };

  const handleAdd = async () => {
    if (!selectedOfferId || !selectedStageId) return;
    setAdding(true);
    await addCompanyToStage(selectedOfferId, selectedStageId, companyId);
    setAdding(false);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitBranch className="h-4 w-4" /> Agregar a Pipeline
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <p className="text-sm text-muted-foreground">
            Agregar <span className="font-medium text-foreground">"{companyName}"</span> a un pipeline
          </p>

          {activeOffers.length === 0 ? (
            <div className="rounded-lg border border-border/50 p-4 text-center">
              <Package className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
              <p className="text-sm text-muted-foreground">No hay ofertas activas</p>
              <p className="text-xs text-muted-foreground mt-1">Crea una oferta primero en Portafolio</p>
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Oferta</label>
                <Select value={selectedOfferId} onValueChange={handleOfferChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar oferta" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeOffers.map(o => {
                      const cat = categories.find(c => c.id === o.categoryId);
                      const inOffer = isCompanyInOffer(o.id, companyId);
                      return (
                        <SelectItem key={o.id} value={o.id} disabled={inOffer}>
                          <div className="flex items-center gap-2">
                            {o.name}
                            {cat && (
                              <Badge className="text-[9px] px-1 py-0 ml-1" style={{ backgroundColor: cat.color + '20', color: cat.color }}>{cat.name}</Badge>
                            )}
                            {inOffer && <span className="text-xs text-muted-foreground">(ya agregada)</span>}
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              {selectedOfferId && !alreadyIn && stages.length > 0 && (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Etapa</label>
                  <Select value={selectedStageId} onValueChange={setSelectedStageId}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {stages.map(s => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {alreadyIn && (
                <p className="text-sm text-amber-600">Esta empresa ya está en el pipeline de esta oferta</p>
              )}
            </>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button onClick={handleAdd} disabled={!selectedOfferId || !selectedStageId || alreadyIn || adding}>
              {adding ? 'Agregando...' : 'Agregar'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
