import { useState, useMemo } from 'react';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { useCRM } from '@/contexts/CRMContext';
import { VERTICALS, CITIES } from '@/types/crm';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Search, Check, X } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  offerId: string;
}

export default function AddCompaniesToPipelineDialog({ open, onClose, offerId }: Props) {
  const { getStagesForOffer, addCompanyToStage, isCompanyInOffer } = usePortfolio();
  const { companies } = useCRM();
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterVertical, setFilterVertical] = useState('');
  const [filterCity, setFilterCity] = useState('');
  const [selectedStageId, setSelectedStageId] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);

  const stages = getStagesForOffer(offerId);
  const defaultStageId = stages[0]?.id ?? '';

  // Derive unique values from companies
  const uniqueVerticals = useMemo(() => [...new Set(companies.map(c => c.vertical).filter(Boolean))].sort(), [companies]);
  const uniqueCities = useMemo(() => [...new Set(companies.map(c => c.city).filter(Boolean))].sort(), [companies]);

  const filtered = useMemo(() => companies.filter(c => {
    if (search && !c.tradeName.toLowerCase().includes(search.toLowerCase()) && !c.legalName.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterCategory && c.category !== filterCategory) return false;
    if (filterVertical && c.vertical !== filterVertical) return false;
    if (filterCity && c.city !== filterCity) return false;
    return true;
  }), [companies, search, filterCategory, filterVertical, filterCity]);

  const hasFilters = filterCategory || filterVertical || filterCity;

  const clearFilters = () => {
    setFilterCategory('');
    setFilterVertical('');
    setFilterCity('');
  };

  const toggle = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleAdd = async () => {
    const stageId = selectedStageId || defaultStageId;
    if (!stageId || selectedIds.size === 0) return;
    setAdding(true);
    for (const companyId of selectedIds) {
      await addCompanyToStage(offerId, stageId, companyId);
    }
    setAdding(false);
    setSelectedIds(new Set());
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Agregar empresas al pipeline</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 pt-2 flex-1 overflow-hidden flex flex-col">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Etapa destino</label>
            <Select value={selectedStageId || defaultStageId} onValueChange={setSelectedStageId}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar etapa" />
              </SelectTrigger>
              <SelectContent>
                {stages.map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar empresas..." className="pl-9" />
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-2">
            <Select value={filterCategory || 'all'} onValueChange={v => setFilterCategory(v === 'all' ? '' : v)}>
              <SelectTrigger className="h-8 w-[120px] text-xs">
                <SelectValue placeholder="Categoría" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Categoría</SelectItem>
                <SelectItem value="EBT">EBT</SelectItem>
                <SelectItem value="Startup">Startup</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterVertical || 'all'} onValueChange={v => setFilterVertical(v === 'all' ? '' : v)}>
              <SelectTrigger className="h-8 w-[130px] text-xs">
                <SelectValue placeholder="Vertical" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Vertical</SelectItem>
                {uniqueVerticals.map(v => (
                  <SelectItem key={v} value={v}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterCity || 'all'} onValueChange={v => setFilterCity(v === 'all' ? '' : v)}>
              <SelectTrigger className="h-8 w-[120px] text-xs">
                <SelectValue placeholder="Ciudad" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Ciudad</SelectItem>
                {uniqueCities.map(c => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {hasFilters && (
              <Button variant="ghost" size="sm" className="h-8 px-2 text-xs gap-1" onClick={clearFilters}>
                <X className="h-3 w-3" /> Limpiar
              </Button>
            )}
          </div>

          {selectedIds.size > 0 && (
            <div className="text-xs text-muted-foreground">{selectedIds.size} empresa(s) seleccionada(s)</div>
          )}

          <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
            {filtered.map(company => {
              const inOffer = isCompanyInOffer(offerId, company.id);
              const selected = selectedIds.has(company.id);
              return (
                <button
                  key={company.id}
                  onClick={() => !inOffer && toggle(company.id)}
                  disabled={inOffer}
                  className={`w-full flex items-center gap-3 rounded-lg border p-2.5 text-left transition-colors ${
                    inOffer ? 'border-border/30 opacity-50 cursor-not-allowed bg-muted/30' :
                    selected ? 'border-primary bg-primary/5' :
                    'border-border/50 hover:border-primary/40 hover:bg-muted/30'
                  }`}
                >
                  <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors ${selected ? 'border-primary bg-primary' : 'border-border'}`}>
                    {selected && <Check className="h-3 w-3 text-primary-foreground" />}
                  </div>
                  {company.logo ? (
                    <img src={company.logo} alt="" className="h-8 w-8 shrink-0 rounded-md border border-border/40 object-contain bg-white p-0.5" />
                  ) : (
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-xs font-bold text-primary">
                      {company.tradeName.charAt(0)}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{company.tradeName}</p>
                    <p className="truncate text-xs text-muted-foreground">{company.vertical} · {company.city}</p>
                  </div>
                  {inOffer && <Badge variant="secondary" className="shrink-0 text-[10px]">Ya en pipeline</Badge>}
                </button>
              );
            })}
            {filtered.length === 0 && (
              <div className="text-center py-8 text-sm text-muted-foreground">No se encontraron empresas</div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-1 border-t border-border/40">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button onClick={handleAdd} disabled={selectedIds.size === 0 || adding}>
              {adding ? 'Agregando...' : `Agregar ${selectedIds.size > 0 ? `(${selectedIds.size})` : ''}`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
