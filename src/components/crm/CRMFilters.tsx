import { useState, useMemo } from 'react';
import { FilterState, SavedView, VERTICALS, CITIES, DEFAULT_FILTERS, SortField, SortDirection } from '@/types/crm';
import { useCRM } from '@/contexts/CRMContext';
import { useCustomFields } from '@/contexts/CustomFieldsContext';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Search, X, SlidersHorizontal, Bookmark, BookmarkPlus, ArrowUpDown } from 'lucide-react';

const SORT_LABELS: Record<SortField, string> = {
  tradeName: 'Nombre',
  city: 'Ciudad',
  vertical: 'Vertical',
  salesByYear: 'Ventas',
  createdAt: 'Fecha de creación',
};

interface Props {
  filters: FilterState;
  onChange: (filters: FilterState) => void;
}

export default function CRMFilters({ filters, onChange }: Props) {
  const { companies, savedViews, saveView, deleteView } = useCRM();
  const { sections, fields } = useCustomFields();
  const [viewName, setViewName] = useState('');

  // Dynamic options from existing companies
  const { allVerticals, allCities, allSubVerticals } = useMemo(() => {
    const vertSet = new Set<string>(VERTICALS);
    const citySet = new Set<string>(CITIES);
    const subVertSet = new Set<string>();

    companies.forEach(c => {
      if (c.vertical) vertSet.add(c.vertical);
      if (c.city) citySet.add(c.city);
      if (c.economicActivity) subVertSet.add(c.economicActivity);
    });

    return {
      allVerticals: Array.from(vertSet).sort((a, b) => a.localeCompare(b)),
      allCities: Array.from(citySet).sort((a, b) => a.localeCompare(b)),
      allSubVerticals: Array.from(subVertSet).sort((a, b) => a.localeCompare(b)),
    };
  }, [companies]);

  const update = (partial: Partial<FilterState>) => onChange({ ...filters, ...partial });
  const updateCustomFilter = (fieldId: string, value: string) => {
    onChange({ ...filters, customFieldFilters: { ...filters.customFieldFilters, [fieldId]: value } });
  };
  const clearCustomFilter = (fieldId: string) => {
    const { [fieldId]: _, ...rest } = filters.customFieldFilters || {};
    onChange({ ...filters, customFieldFilters: rest });
  };

  const activeChips: { label: string; clear: () => void }[] = [];
  if (filters.category) activeChips.push({ label: `Categoría: ${filters.category}`, clear: () => update({ category: '' }) });
  if (filters.vertical) activeChips.push({ label: `Vertical: ${filters.vertical}`, clear: () => update({ vertical: '' }) });
  if (filters.city) activeChips.push({ label: `Ciudad: ${filters.city}`, clear: () => update({ city: '' }) });
  if (filters.economicActivity) activeChips.push({ label: `Sub-vertical: ${filters.economicActivity}`, clear: () => update({ economicActivity: '' }) });
  if (filters.nitFilter) activeChips.push({ label: filters.nitFilter === 'has' ? 'Con NIT' : 'Sin NIT', clear: () => update({ nitFilter: '' }) });
  if (filters.salesMin) activeChips.push({ label: `Ventas ≥ ${filters.salesMin}`, clear: () => update({ salesMin: '' }) });
  if (filters.salesMax) activeChips.push({ label: `Ventas ≤ ${filters.salesMax}`, clear: () => update({ salesMax: '' }) });
  if (filters.avgYoYMin) activeChips.push({ label: `Avg YoY ≥ ${filters.avgYoYMin}%`, clear: () => update({ avgYoYMin: '' }) });
  if (filters.lastYoYMin) activeChips.push({ label: `Último YoY ≥ ${filters.lastYoYMin}%`, clear: () => update({ lastYoYMin: '' }) });

  Object.entries(filters.customFieldFilters || {}).forEach(([fieldId, value]) => {
    if (!value) return;
    const field = fields.find(f => f.id === fieldId);
    if (field) activeChips.push({ label: `${field.name}: ${value}`, clear: () => clearCustomFilter(fieldId) });
  });

  const hasFilters = activeChips.length > 0 || filters.search;

  const handleSaveView = () => {
    if (!viewName.trim()) return;
    saveView({ id: crypto.randomUUID(), name: viewName.trim(), filters: { ...filters } });
    setViewName('');
  };

  const years = Array.from({ length: 6 }, (_, i) => 2020 + i);
  const filterableFields = fields.filter(f => f.fieldType === 'text' || f.fieldType === 'select');

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar empresa..." value={filters.search} onChange={e => update({ search: e.target.value })} className="h-9 pl-8 text-sm" />
        </div>

        <Select value={filters.category} onValueChange={v => update({ category: v === 'all' ? '' : v })}>
          <SelectTrigger className="h-9 w-[130px] text-sm"><SelectValue placeholder="Categoría" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="EBT">EBT</SelectItem>
            <SelectItem value="Startup">Startup</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filters.vertical} onValueChange={v => update({ vertical: v === 'all' ? '' : v })}>
          <SelectTrigger className="h-9 w-[160px] text-sm"><SelectValue placeholder="Vertical" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            {allVerticals.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={filters.economicActivity} onValueChange={v => update({ economicActivity: v === 'all' ? '' : v })}>
          <SelectTrigger className="h-9 w-[160px] text-sm"><SelectValue placeholder="Sub-vertical" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            {allSubVerticals.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={filters.city} onValueChange={v => update({ city: v === 'all' ? '' : v })}>
          <SelectTrigger className="h-9 w-[130px] text-sm"><SelectValue placeholder="Ciudad" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            {allCities.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={filters.nitFilter || 'all'} onValueChange={v => update({ nitFilter: v === 'all' ? '' : v as 'has' | 'no' })}>
          <SelectTrigger className="h-9 w-[130px] text-sm"><SelectValue placeholder="NIT" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">NIT: Todos</SelectItem>
            <SelectItem value="has">Con NIT</SelectItem>
            <SelectItem value="no">Sin NIT</SelectItem>
          </SelectContent>
        </Select>

        <Select value={String(filters.activeYear)} onValueChange={v => update({ activeYear: Number(v) })}>
          <SelectTrigger className="h-9 w-[100px] text-sm"><SelectValue placeholder="Año" /></SelectTrigger>
          <SelectContent>{years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
        </Select>

        {/* Sorter */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 gap-1.5 text-sm">
              <ArrowUpDown className="h-3.5 w-3.5" /> {SORT_LABELS[filters.sortField]} {filters.sortDirection === 'asc' ? '↑' : '↓'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 space-y-2" align="end">
            <p className="text-sm font-medium">Ordenar por</p>
            {(Object.entries(SORT_LABELS) as [SortField, string][]).map(([field, label]) => (
              <button
                key={field}
                className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-secondary ${filters.sortField === field ? 'bg-secondary font-medium' : ''}`}
                onClick={() => {
                  if (filters.sortField === field) {
                    update({ sortDirection: filters.sortDirection === 'asc' ? 'desc' : 'asc' });
                  } else {
                    update({ sortField: field, sortDirection: 'asc' });
                  }
                }}
              >
                {label}
                {filters.sortField === field && (
                  <span className="text-xs text-muted-foreground">{filters.sortDirection === 'asc' ? '↑ A-Z' : '↓ Z-A'}</span>
                )}
              </button>
            ))}
          </PopoverContent>
        </Popover>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 gap-1.5 text-sm">
              <SlidersHorizontal className="h-3.5 w-3.5" /> Más filtros
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 space-y-3" align="end">
            <p className="text-sm font-medium">Filtros avanzados</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground">Ventas mín (M)</label>
                <Input className="mt-1 h-8 text-sm" type="number" value={filters.salesMin} onChange={e => update({ salesMin: e.target.value })} placeholder="0" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Ventas máx (M)</label>
                <Input className="mt-1 h-8 text-sm" type="number" value={filters.salesMax} onChange={e => update({ salesMax: e.target.value })} placeholder="∞" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground">Avg YoY mín %</label>
                <Input className="mt-1 h-8 text-sm" type="number" value={filters.avgYoYMin} onChange={e => update({ avgYoYMin: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Avg YoY máx %</label>
                <Input className="mt-1 h-8 text-sm" type="number" value={filters.avgYoYMax} onChange={e => update({ avgYoYMax: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground">Último YoY mín %</label>
                <Input className="mt-1 h-8 text-sm" type="number" value={filters.lastYoYMin} onChange={e => update({ lastYoYMin: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Último YoY máx %</label>
                <Input className="mt-1 h-8 text-sm" type="number" value={filters.lastYoYMax} onChange={e => update({ lastYoYMax: e.target.value })} />
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
                      <Select value={filters.customFieldFilters?.[field.id] || ''} onValueChange={v => v === 'all' ? clearCustomFilter(field.id) : updateCustomFilter(field.id, v)}>
                        <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue placeholder="Todos" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todos</SelectItem>
                          {field.options.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input className="mt-1 h-8 text-sm" value={filters.customFieldFilters?.[field.id] || ''} onChange={e => e.target.value ? updateCustomFilter(field.id, e.target.value) : clearCustomFilter(field.id)} placeholder="Buscar..." />
                    )}
                  </div>
                ))}
              </>
            )}
          </PopoverContent>
        </Popover>

        {savedViews.length > 0 && (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 gap-1.5 text-sm"><Bookmark className="h-3.5 w-3.5" /> Vistas</Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 space-y-1" align="end">
              {savedViews.map(v => (
                <div key={v.id} className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-secondary">
                  <button className="text-sm" onClick={() => onChange(v.filters)}>{v.name}</button>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => deleteView(v.id)}><X className="h-3 w-3" /></Button>
                </div>
              ))}
            </PopoverContent>
          </Popover>
        )}

        {hasFilters && (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 gap-1.5 text-sm"><BookmarkPlus className="h-3.5 w-3.5" /> Guardar vista</Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 space-y-2" align="end">
              <Input className="h-8 text-sm" value={viewName} onChange={e => setViewName(e.target.value)} placeholder="Nombre de la vista" />
              <Button size="sm" className="w-full" onClick={handleSaveView}>Guardar</Button>
            </PopoverContent>
          </Popover>
        )}
      </div>

      {activeChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {activeChips.map((chip, i) => (
            <Badge key={i} variant="secondary" className="gap-1 pr-1 text-xs">
              {chip.label}
              <button onClick={chip.clear} className="rounded-sm p-0.5 hover:bg-muted"><X className="h-3 w-3" /></button>
            </Badge>
          ))}
          <button className="text-xs text-muted-foreground hover:text-foreground" onClick={() => onChange(DEFAULT_FILTERS)}>Limpiar todo</button>
        </div>
      )}
    </div>
  );
}
