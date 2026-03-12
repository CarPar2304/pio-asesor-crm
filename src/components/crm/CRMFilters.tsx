import { useState, useMemo } from 'react';
import { FilterState, SavedView, VERTICALS, CITIES, CATEGORIES, DEFAULT_FILTERS, SortField, SortDirection } from '@/types/crm';
import { useCRM } from '@/contexts/CRMContext';
import { useCustomFields } from '@/contexts/CustomFieldsContext';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { FilterBadge } from '@/components/ui/filter-badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { Search, X, SlidersHorizontal, Bookmark, BookmarkPlus, ArrowUpDown, ChevronDown, Filter } from 'lucide-react';

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

  const { allVerticals, allCities, allSubVerticals, allCategories } = useMemo(() => {
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
      allVerticals: Array.from(vertSet).sort((a, b) => a.localeCompare(b)),
      allCities: Array.from(citySet).sort((a, b) => a.localeCompare(b)),
      allSubVerticals: Array.from(subVertSet).sort((a, b) => a.localeCompare(b)),
      allCategories: Array.from(catSet).sort((a, b) => a.localeCompare(b)),
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

  const activeChips: { label: string; value: string; clear: () => void }[] = [];
  if (filters.category) activeChips.push({ label: 'Categoría', value: filters.category, clear: () => update({ category: '' }) });
  if (filters.vertical) activeChips.push({ label: 'Vertical', value: filters.vertical, clear: () => update({ vertical: '' }) });
  if (filters.city) activeChips.push({ label: 'Ciudad', value: filters.city, clear: () => update({ city: '' }) });
  if (filters.economicActivity) activeChips.push({ label: 'Sub-vertical', value: filters.economicActivity, clear: () => update({ economicActivity: '' }) });
  if (filters.nitFilter) activeChips.push({ label: 'NIT', value: filters.nitFilter === 'has' ? 'Con NIT' : 'Sin NIT', clear: () => update({ nitFilter: '' }) });
  if (filters.salesMin) activeChips.push({ label: 'Ventas ≥', value: `${filters.salesMin}M`, clear: () => update({ salesMin: '' }) });
  if (filters.salesMax) activeChips.push({ label: 'Ventas ≤', value: `${filters.salesMax}M`, clear: () => update({ salesMax: '' }) });
  if (filters.avgYoYMin) activeChips.push({ label: 'Avg YoY ≥', value: `${filters.avgYoYMin}%`, clear: () => update({ avgYoYMin: '' }) });
  if (filters.lastYoYMin) activeChips.push({ label: 'Último YoY ≥', value: `${filters.lastYoYMin}%`, clear: () => update({ lastYoYMin: '' }) });

  Object.entries(filters.customFieldFilters || {}).forEach(([fieldId, val]) => {
    if (!val) return;
    const field = fields.find(f => f.id === fieldId);
    if (field) activeChips.push({ label: field.name, value: val, clear: () => clearCustomFilter(fieldId) });
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
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card/70 p-2 shadow-sm backdrop-blur-sm">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar empresa..."
            value={filters.search}
            onChange={e => update({ search: e.target.value })}
            className="h-9 pl-9 text-sm bg-background/80 border-border shadow-sm shadow-black/5"
          />
        </div>

        {/* Category dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 gap-1.5 text-sm shadow-sm shadow-black/5">
              {filters.category || 'Categoría'}
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => update({ category: '' })}>Todas</DropdownMenuItem>
            {allCategories.map(cat => (
              <DropdownMenuItem key={cat} onClick={() => update({ category: cat })}>{cat}</DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Vertical dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 gap-1.5 text-sm shadow-sm shadow-black/5">
              {filters.vertical || 'Vertical'}
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
            <DropdownMenuItem onClick={() => update({ vertical: '' })}>Todas</DropdownMenuItem>
            {allVerticals.map(v => (
              <DropdownMenuItem key={v} onClick={() => update({ vertical: v })}>{v}</DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* City dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 gap-1.5 text-sm shadow-sm shadow-black/5">
              {filters.city || 'Ciudad'}
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
            <DropdownMenuItem onClick={() => update({ city: '' })}>Todas</DropdownMenuItem>
            {allCities.map(c => (
              <DropdownMenuItem key={c} onClick={() => update({ city: c })}>{c}</DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Sub-vertical dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 gap-1.5 text-sm shadow-sm shadow-black/5">
              {filters.economicActivity || 'Sub-vertical'}
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
            <DropdownMenuItem onClick={() => update({ economicActivity: '' })}>Todas</DropdownMenuItem>
            {allSubVerticals.map(v => (
              <DropdownMenuItem key={v} onClick={() => update({ economicActivity: v })}>{v}</DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* NIT dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 gap-1.5 text-sm shadow-sm shadow-black/5">
              {filters.nitFilter === 'has' ? 'Con NIT' : filters.nitFilter === 'no' ? 'Sin NIT' : 'NIT'}
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => update({ nitFilter: '' })}>Todos</DropdownMenuItem>
            <DropdownMenuItem onClick={() => update({ nitFilter: 'has' })}>Con NIT</DropdownMenuItem>
            <DropdownMenuItem onClick={() => update({ nitFilter: 'no' })}>Sin NIT</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Year dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 gap-1.5 text-sm shadow-sm shadow-black/5">
              {filters.activeYear}
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {years.map(y => (
              <DropdownMenuItem key={y} onClick={() => update({ activeYear: y })}>{y}</DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Divider */}
        <div className="mx-0.5 h-6 w-px bg-border" />

        {/* Sort */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 gap-1.5 text-sm shadow-sm shadow-black/5">
              <ArrowUpDown className="h-3.5 w-3.5" />
              {SORT_LABELS[filters.sortField]}
              <span className="text-muted-foreground">{filters.sortDirection === 'asc' ? '↑' : '↓'}</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 space-y-1 p-2" align="end">
            <p className="px-2 pb-1 text-xs font-medium text-muted-foreground">Ordenar por</p>
            {(Object.entries(SORT_LABELS) as [SortField, string][]).map(([field, label]) => (
              <button
                key={field}
                className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent ${filters.sortField === field ? 'bg-accent font-medium text-accent-foreground' : 'text-foreground'}`}
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

        {/* Advanced filters */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 gap-1.5 text-sm shadow-sm shadow-black/5">
              <SlidersHorizontal className="h-3.5 w-3.5" /> Más filtros
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 space-y-3 p-4" align="end">
            <p className="text-sm font-medium text-foreground">Filtros avanzados</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground">Ventas mín (M)</label>
                <Input className="mt-1 h-8 text-sm bg-background/80" type="number" value={filters.salesMin} onChange={e => update({ salesMin: e.target.value })} placeholder="0" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Ventas máx (M)</label>
                <Input className="mt-1 h-8 text-sm bg-background/80" type="number" value={filters.salesMax} onChange={e => update({ salesMax: e.target.value })} placeholder="∞" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground">Avg YoY mín %</label>
                <Input className="mt-1 h-8 text-sm bg-background/80" type="number" value={filters.avgYoYMin} onChange={e => update({ avgYoYMin: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Avg YoY máx %</label>
                <Input className="mt-1 h-8 text-sm bg-background/80" type="number" value={filters.avgYoYMax} onChange={e => update({ avgYoYMax: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground">Último YoY mín %</label>
                <Input className="mt-1 h-8 text-sm bg-background/80" type="number" value={filters.lastYoYMin} onChange={e => update({ lastYoYMin: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Último YoY máx %</label>
                <Input className="mt-1 h-8 text-sm bg-background/80" type="number" value={filters.lastYoYMax} onChange={e => update({ lastYoYMax: e.target.value })} />
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
                      <Input className="mt-1 h-8 text-sm bg-background/80" value={filters.customFieldFilters?.[field.id] || ''} onChange={e => e.target.value ? updateCustomFilter(field.id, e.target.value) : clearCustomFilter(field.id)} placeholder="Buscar..." />
                    )}
                  </div>
                ))}
              </>
            )}
          </PopoverContent>
        </Popover>

        {/* Saved views */}
        {savedViews.length > 0 && (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 gap-1.5 text-sm shadow-sm shadow-black/5">
                <Bookmark className="h-3.5 w-3.5" /> Vistas
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 space-y-1 p-2" align="end">
              {savedViews.map(v => (
                <div key={v.id} className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-accent">
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
              <Button variant="outline" size="sm" className="h-9 gap-1.5 text-sm shadow-sm shadow-black/5">
                <BookmarkPlus className="h-3.5 w-3.5" /> Guardar
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 space-y-2 p-3" align="end">
              <Input className="h-8 text-sm" value={viewName} onChange={e => setViewName(e.target.value)} placeholder="Nombre de la vista" />
              <Button size="sm" className="w-full" onClick={handleSaveView}>Guardar</Button>
            </PopoverContent>
          </Popover>
        )}
      </div>

      {/* Active filter chips */}
      {activeChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          {activeChips.map((chip, i) => (
            <FilterBadge
              key={i}
              variant="pill"
              label={chip.label}
              value={chip.value}
              onRemove={chip.clear}
            />
          ))}
          <button
            className="ml-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => onChange(DEFAULT_FILTERS)}
          >
            Limpiar todo
          </button>
        </div>
      )}
    </div>
  );
}
