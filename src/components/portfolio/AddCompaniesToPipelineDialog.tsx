import { useState, useMemo } from 'react';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { useCRM } from '@/contexts/CRMContext';
import { useProfile } from '@/contexts/ProfileContext';
import { useAuth } from '@/hooks/useAuth';
import { useCustomFields } from '@/contexts/CustomFieldsContext';
import { VERTICALS, CITIES, CATEGORIES } from '@/types/crm';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { FilterBadge } from '@/components/ui/filter-badge';
import { Search, Check, X, SlidersHorizontal, Filter } from 'lucide-react';
import { calculateGrowth } from '@/lib/calculations';

interface Props {
  open: boolean;
  onClose: () => void;
  offerId: string;
}

interface Filters {
  search: string;
  category: string;
  vertical: string;
  subVertical: string;
  city: string;
  nitFilter: '' | 'has' | 'no';
  salesMin: string;
  salesMax: string;
  avgYoYMin: string;
  avgYoYMax: string;
  lastYoYMin: string;
  lastYoYMax: string;
  customFieldFilters: Record<string, string>;
}

const EMPTY_FILTERS: Filters = {
  search: '', category: '', vertical: '', subVertical: '', city: '',
  nitFilter: '', salesMin: '', salesMax: '', avgYoYMin: '', avgYoYMax: '',
  lastYoYMin: '', lastYoYMax: '', customFieldFilters: {},
};

export default function AddCompaniesToPipelineDialog({ open, onClose, offerId }: Props) {
  const { getStagesForOffer, addCompanyToStage, isCompanyInOffer } = usePortfolio();
  const { companies } = useCRM();
  const { allProfiles } = useProfile();
  const { session } = useAuth();
  const { fields } = useCustomFields();
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [selectedStageId, setSelectedStageId] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);

  const stages = getStagesForOffer(offerId);
  const defaultStageId = stages[0]?.id ?? '';

  const update = (partial: Partial<Filters>) => setFilters(prev => ({ ...prev, ...partial }));
  const updateCustomFilter = (fieldId: string, value: string) => {
    setFilters(prev => ({ ...prev, customFieldFilters: { ...prev.customFieldFilters, [fieldId]: value } }));
  };
  const clearCustomFilter = (fieldId: string) => {
    setFilters(prev => {
      const { [fieldId]: _, ...rest } = prev.customFieldFilters;
      return { ...prev, customFieldFilters: rest };
    });
  };

  const { uniqueVerticals, uniqueSubVerticals, uniqueCities, uniqueCategories } = useMemo(() => {
    const vertSet = new Set<string>(VERTICALS);
    const citySet = new Set<string>(CITIES);
    const subVertSet = new Set<string>();
    const catSet = new Set<string>(CATEGORIES);
    companies.forEach(c => {
      if (c.vertical) vertSet.add(c.vertical);
      if (c.city) citySet.add(c.city);
      if (c.economicActivity) subVertSet.add(c.economicActivity);
      if (c.category) catSet.add(c.category);
    });
    return {
      uniqueVerticals: Array.from(vertSet).sort(),
      uniqueSubVerticals: Array.from(subVertSet).sort(),
      uniqueCities: Array.from(citySet).sort(),
      uniqueCategories: Array.from(catSet).sort(),
    };
  }, [companies]);

  const activeYear = new Date().getFullYear() - 1;

  const filtered = useMemo(() => companies.filter(c => {
    const { search, category, vertical, subVertical, city, nitFilter, salesMin, salesMax, avgYoYMin, avgYoYMax, lastYoYMin, lastYoYMax, customFieldFilters } = filters;
    if (search && !c.tradeName.toLowerCase().includes(search.toLowerCase()) && !c.legalName.toLowerCase().includes(search.toLowerCase()) && !c.nit.includes(search)) return false;
    if (category && c.category !== category) return false;
    if (vertical && c.vertical !== vertical) return false;
    if (subVertical && c.economicActivity !== subVertical) return false;
    if (city && c.city !== city) return false;
    if (nitFilter === 'has' && (!c.nit || c.nit === '0')) return false;
    if (nitFilter === 'no' && c.nit && c.nit !== '0') return false;

    const sales = c.salesByYear?.[activeYear] ?? 0;
    const salesM = sales / 1_000_000;
    if (salesMin && salesM < Number(salesMin)) return false;
    if (salesMax && salesM > Number(salesMax)) return false;

    const growth = calculateGrowth(c.salesByYear);
    if (avgYoYMin && (growth.avgYoY === null || growth.avgYoY < Number(avgYoYMin))) return false;
    if (avgYoYMax && (growth.avgYoY === null || growth.avgYoY > Number(avgYoYMax))) return false;
    if (lastYoYMin && (growth.lastYoY === null || growth.lastYoY < Number(lastYoYMin))) return false;
    if (lastYoYMax && (growth.lastYoY === null || growth.lastYoY > Number(lastYoYMax))) return false;

    // Custom field filters
    for (const [fieldId, val] of Object.entries(customFieldFilters)) {
      if (!val) continue;
      const fv = c.fieldValues?.find(v => v.fieldId === fieldId);
      if (!fv) return false;
      const field = fields.find(f => f.id === fieldId);
      if (field?.fieldType === 'select') {
        if (fv.textValue !== val) return false;
      } else {
        if (!fv.textValue?.toLowerCase().includes(val.toLowerCase())) return false;
      }
    }

    return true;
  }), [companies, filters, fields, activeYear]);

  // Active chips
  const activeChips: { label: string; value: string; clear: () => void }[] = [];
  if (filters.category) activeChips.push({ label: 'Categoría', value: filters.category, clear: () => update({ category: '' }) });
  if (filters.vertical) activeChips.push({ label: 'Vertical', value: filters.vertical, clear: () => update({ vertical: '' }) });
  if (filters.subVertical) activeChips.push({ label: 'Sub-vertical', value: filters.subVertical, clear: () => update({ subVertical: '' }) });
  if (filters.city) activeChips.push({ label: 'Ciudad', value: filters.city, clear: () => update({ city: '' }) });
  if (filters.nitFilter) activeChips.push({ label: 'NIT', value: filters.nitFilter === 'has' ? 'Con NIT' : 'Sin NIT', clear: () => update({ nitFilter: '' }) });
  if (filters.salesMin) activeChips.push({ label: 'Ventas ≥', value: `${filters.salesMin}M`, clear: () => update({ salesMin: '' }) });
  if (filters.salesMax) activeChips.push({ label: 'Ventas ≤', value: `${filters.salesMax}M`, clear: () => update({ salesMax: '' }) });
  if (filters.avgYoYMin) activeChips.push({ label: 'Avg YoY ≥', value: `${filters.avgYoYMin}%`, clear: () => update({ avgYoYMin: '' }) });
  if (filters.avgYoYMax) activeChips.push({ label: 'Avg YoY ≤', value: `${filters.avgYoYMax}%`, clear: () => update({ avgYoYMax: '' }) });
  if (filters.lastYoYMin) activeChips.push({ label: 'Último YoY ≥', value: `${filters.lastYoYMin}%`, clear: () => update({ lastYoYMin: '' }) });
  if (filters.lastYoYMax) activeChips.push({ label: 'Último YoY ≤', value: `${filters.lastYoYMax}%`, clear: () => update({ lastYoYMax: '' }) });
  Object.entries(filters.customFieldFilters).forEach(([fieldId, val]) => {
    if (!val) return;
    const field = fields.find(f => f.id === fieldId);
    if (field) activeChips.push({ label: field.name, value: val, clear: () => clearCustomFilter(fieldId) });
  });

  const hasFilters = activeChips.length > 0;
  const filterableFields = fields.filter(f => f.fieldType === 'text' || f.fieldType === 'select');

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
    const finalAssignedTo = assignedTo || session?.user?.id || null;
    for (const companyId of selectedIds) {
      await addCompanyToStage(offerId, stageId, companyId, finalAssignedTo);
    }
    setAdding(false);
    setSelectedIds(new Set());
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Agregar empresas al pipeline</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 pt-2 flex-1 overflow-hidden flex flex-col">
          {/* Stage selector */}
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

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={filters.search} onChange={e => update({ search: e.target.value })} placeholder="Buscar por nombre, razón social o NIT..." className="pl-9" />
          </div>

          {/* Inline filters */}
          <div className="flex flex-wrap gap-1.5">
            <Select value={filters.category || 'all'} onValueChange={v => update({ category: v === 'all' ? '' : v })}>
              <SelectTrigger className="h-7 w-auto min-w-[90px] text-xs gap-1">
                <SelectValue placeholder="Categoría" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Categoría</SelectItem>
                {uniqueCategories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value={filters.vertical || 'all'} onValueChange={v => update({ vertical: v === 'all' ? '' : v })}>
              <SelectTrigger className="h-7 w-auto min-w-[90px] text-xs gap-1">
                <SelectValue placeholder="Vertical" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Vertical</SelectItem>
                {uniqueVerticals.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
              </SelectContent>
            </Select>

            {uniqueSubVerticals.length > 0 && (
              <Select value={filters.subVertical || 'all'} onValueChange={v => update({ subVertical: v === 'all' ? '' : v })}>
                <SelectTrigger className="h-7 w-auto min-w-[90px] text-xs gap-1">
                  <SelectValue placeholder="Sub-vertical" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Sub-vertical</SelectItem>
                  {uniqueSubVerticals.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            )}

            <Select value={filters.city || 'all'} onValueChange={v => update({ city: v === 'all' ? '' : v })}>
              <SelectTrigger className="h-7 w-auto min-w-[90px] text-xs gap-1">
                <SelectValue placeholder="Ciudad" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Ciudad</SelectItem>
                {uniqueCities.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value={filters.nitFilter || 'all'} onValueChange={v => update({ nitFilter: v === 'all' ? '' : v as any })}>
              <SelectTrigger className="h-7 w-auto min-w-[70px] text-xs gap-1">
                <SelectValue placeholder="NIT" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">NIT</SelectItem>
                <SelectItem value="has">Con NIT</SelectItem>
                <SelectItem value="no">Sin NIT</SelectItem>
              </SelectContent>
            </Select>

            {/* More filters popover */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 px-2 text-xs gap-1">
                  <SlidersHorizontal className="h-3 w-3" /> Más filtros
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72 space-y-3 p-4" align="start">
                <p className="text-sm font-medium">Filtros avanzados</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-muted-foreground">Ventas mín (M)</label>
                    <Input className="mt-1 h-7 text-xs" type="number" value={filters.salesMin} onChange={e => update({ salesMin: e.target.value })} placeholder="0" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Ventas máx (M)</label>
                    <Input className="mt-1 h-7 text-xs" type="number" value={filters.salesMax} onChange={e => update({ salesMax: e.target.value })} placeholder="∞" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-muted-foreground">Avg YoY mín %</label>
                    <Input className="mt-1 h-7 text-xs" type="number" value={filters.avgYoYMin} onChange={e => update({ avgYoYMin: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Avg YoY máx %</label>
                    <Input className="mt-1 h-7 text-xs" type="number" value={filters.avgYoYMax} onChange={e => update({ avgYoYMax: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-muted-foreground">Último YoY mín %</label>
                    <Input className="mt-1 h-7 text-xs" type="number" value={filters.lastYoYMin} onChange={e => update({ lastYoYMin: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Último YoY máx %</label>
                    <Input className="mt-1 h-7 text-xs" type="number" value={filters.lastYoYMax} onChange={e => update({ lastYoYMax: e.target.value })} />
                  </div>
                </div>

                {filterableFields.length > 0 && (
                  <>
                    <div className="border-t border-border pt-2">
                      <p className="text-xs font-medium text-muted-foreground mb-2">Campos personalizados</p>
                    </div>
                    {filterableFields.map(field => (
                      <div key={field.id}>
                        <label className="text-xs text-muted-foreground">{field.name}</label>
                        {field.fieldType === 'select' ? (
                          <Select value={filters.customFieldFilters[field.id] || ''} onValueChange={v => v === 'all' ? clearCustomFilter(field.id) : updateCustomFilter(field.id, v)}>
                            <SelectTrigger className="mt-1 h-7 text-xs"><SelectValue placeholder="Todos" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">Todos</SelectItem>
                              {field.options.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input className="mt-1 h-7 text-xs" value={filters.customFieldFilters[field.id] || ''} onChange={e => e.target.value ? updateCustomFilter(field.id, e.target.value) : clearCustomFilter(field.id)} placeholder="Buscar..." />
                        )}
                      </div>
                    ))}
                  </>
                )}
              </PopoverContent>
            </Popover>

            {hasFilters && (
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1" onClick={() => setFilters(EMPTY_FILTERS)}>
                <X className="h-3 w-3" /> Limpiar
              </Button>
            )}
          </div>

          {/* Active filter chips */}
          {activeChips.length > 0 && (
            <div className="flex flex-wrap items-center gap-1">
              <Filter className="h-3 w-3 text-muted-foreground" />
              {activeChips.map((chip, i) => (
                <FilterBadge key={i} variant="pill" label={chip.label} value={chip.value} onRemove={chip.clear} />
              ))}
            </div>
          )}

          {/* Count */}
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{filtered.length} empresa(s) encontrada(s)</span>
            {selectedIds.size > 0 && <span className="font-medium text-foreground">{selectedIds.size} seleccionada(s)</span>}
          </div>

          {/* Company list */}
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
                    <p className="truncate text-xs text-muted-foreground">
                      {[company.category, company.vertical, company.city].filter(Boolean).join(' · ')}
                    </p>
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
