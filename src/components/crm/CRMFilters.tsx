import { useState, useMemo } from 'react';
import { FilterState, SavedView, VERTICALS, CITIES, CATEGORIES, DEFAULT_FILTERS, SortField, SortDirection } from '@/types/crm';
import { useCRM } from '@/contexts/CRMContext';
import { useCustomFields } from '@/contexts/CustomFieldsContext';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { FilterBadge } from '@/components/ui/filter-badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
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

function MultiSelectDropdown({ label, values, selected, onChange }: { label: string; values: string[]; selected: string[]; onChange: (v: string[]) => void }) {
  const displayLabel = selected.length === 0 ? label : selected.length === 1 ? selected[0] : `${label} (${selected.length})`;

  const toggle = (val: string) => {
    if (selected.includes(val)) {
      onChange(selected.filter(v => v !== val));
    } else {
      onChange([...selected, val]);
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 gap-1.5 text-sm shadow-sm shadow-black/5">
          {displayLabel}
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 max-h-64 overflow-y-auto p-2" align="start">
        {selected.length > 0 && (
          <button
            className="mb-1 w-full text-left rounded-md px-2 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            onClick={() => onChange([])}
          >
            Limpiar selección
          </button>
        )}
        {values.map(val => (
          <label
            key={val}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm cursor-pointer hover:bg-accent transition-colors"
          >
            <Checkbox
              checked={selected.includes(val)}
              onCheckedChange={() => toggle(val)}
              className="h-3.5 w-3.5"
            />
            <span className="truncate">{val}</span>
          </label>
        ))}
      </PopoverContent>
    </Popover>
  );
}

export default function CRMFilters({ filters, onChange }: Props) {
  const { companies, savedViews, saveView, deleteView } = useCRM();
  const { sections, fields } = useCustomFields();
  const { offers, stages } = usePortfolio();
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

  // Offer/stage filter options
  const offerOptions = useMemo(() => offers.map(o => ({ id: o.id, name: o.name })), [offers]);
  const stageOptions = useMemo(() => {
    if (filters.offerFilter.length === 0) return [];
    return stages
      .filter(s => filters.offerFilter.includes(s.offerId))
      .map(s => {
        const offer = offers.find(o => o.id === s.offerId);
        const prefix = filters.offerFilter.length > 1 && offer ? `${offer.name} | ` : '';
        return { id: s.id, name: `${prefix}${s.name}`, offerId: s.offerId };
      });
  }, [stages, filters.offerFilter, offers]);

  const update = (partial: Partial<FilterState>) => onChange({ ...filters, ...partial });

  const updateCustomFilter = (fieldId: string, value: string | string[]) => {
    onChange({ ...filters, customFieldFilters: { ...filters.customFieldFilters, [fieldId]: value } });
  };
  const clearCustomFilter = (fieldId: string) => {
    const { [fieldId]: _, ...rest } = filters.customFieldFilters || {};
    onChange({ ...filters, customFieldFilters: rest });
  };

  const activeChips: { label: string; value: string; clear: () => void }[] = [];
  if (filters.category.length > 0) {
    filters.category.forEach(cat => {
      activeChips.push({ label: 'Categoría', value: cat, clear: () => update({ category: filters.category.filter(v => v !== cat) }) });
    });
  }
  if (filters.vertical.length > 0) {
    filters.vertical.forEach(v => {
      activeChips.push({ label: 'Vertical', value: v, clear: () => update({ vertical: filters.vertical.filter(x => x !== v) }) });
    });
  }
  if (filters.city.length > 0) {
    filters.city.forEach(c => {
      activeChips.push({ label: 'Ciudad', value: c, clear: () => update({ city: filters.city.filter(x => x !== c) }) });
    });
  }
  if (filters.economicActivity.length > 0) {
    filters.economicActivity.forEach(ea => {
      activeChips.push({ label: 'Sub-vertical', value: ea, clear: () => update({ economicActivity: filters.economicActivity.filter(x => x !== ea) }) });
    });
  }
  if (filters.nitFilter) activeChips.push({ label: 'NIT', value: filters.nitFilter === 'has' ? 'Con NIT' : 'Sin NIT', clear: () => update({ nitFilter: '' }) });
  if (filters.salesMin) activeChips.push({ label: 'Ventas ≥', value: `${filters.salesMin}M (último dato)`, clear: () => update({ salesMin: '' }) });
  if (filters.salesMax) activeChips.push({ label: 'Ventas ≤', value: `${filters.salesMax}M (último dato)`, clear: () => update({ salesMax: '' }) });
  if (filters.avgYoYMin) activeChips.push({ label: 'Avg YoY ≥', value: `${filters.avgYoYMin}%`, clear: () => update({ avgYoYMin: '' }) });
  if (filters.lastYoYMin) activeChips.push({ label: 'Último YoY ≥', value: `${filters.lastYoYMin}%`, clear: () => update({ lastYoYMin: '' }) });

  // Offer/stage filter chips
  if (filters.offerFilter.length > 0) {
    filters.offerFilter.forEach(offerId => {
      const offer = offers.find(o => o.id === offerId);
      if (offer) activeChips.push({ label: 'Oferta', value: offer.name, clear: () => update({ offerFilter: filters.offerFilter.filter(x => x !== offerId), stageFilter: filters.stageFilter.filter(sid => { const s = stages.find(st => st.id === sid); return s && s.offerId !== offerId; }) }) });
    });
  }
  if (filters.stageFilter.length > 0) {
    filters.stageFilter.forEach(stageId => {
      const stage = stages.find(s => s.id === stageId);
      if (stage) {
        const offer = offers.find(o => o.id === stage.offerId);
        const label = filters.offerFilter.length > 1 && offer ? `${offer.name} | ${stage.name}` : stage.name;
        activeChips.push({ label: 'Etapa', value: label, clear: () => update({ stageFilter: filters.stageFilter.filter(x => x !== stageId) }) });
      }
    });
  }

  Object.entries(filters.customFieldFilters || {}).forEach(([fieldId, val]) => {
    if (!val || (Array.isArray(val) && val.length === 0)) return;
    const field = fields.find(f => f.id === fieldId);
    if (field) {
      if (Array.isArray(val)) {
        val.forEach(v => {
          activeChips.push({ label: field.name, value: v, clear: () => {
            const current = filters.customFieldFilters[fieldId];
            if (Array.isArray(current)) {
              const newVal = current.filter(x => x !== v);
              if (newVal.length === 0) clearCustomFilter(fieldId);
              else updateCustomFilter(fieldId, newVal);
            } else {
              clearCustomFilter(fieldId);
            }
          }});
        });
      } else {
        activeChips.push({ label: field.name, value: val, clear: () => clearCustomFilter(fieldId) });
      }
    }
  });

  const hasFilters = activeChips.length > 0 || filters.search;

  const handleSaveView = () => {
    if (!viewName.trim()) return;
    saveView({ id: crypto.randomUUID(), name: viewName.trim(), filters: { ...filters } });
    setViewName('');
  };

  const years = useMemo(() => {
    const yearSet = new Set<number>();
    companies.forEach(c => {
      Object.keys(c.salesByYear).forEach(y => yearSet.add(Number(y)));
    });
    if (yearSet.size === 0) {
      for (let i = 0; i < 6; i++) yearSet.add(2020 + i);
    }
    return Array.from(yearSet).sort();
  }, [companies]);
  const filterableFields = fields.filter(f => f.fieldType === 'text' || f.fieldType === 'select');

  return (
    <div className="space-y-3">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-2 shadow-sm">
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

        {/* Multi-select dropdowns */}
        <MultiSelectDropdown label="Categoría" values={allCategories} selected={filters.category} onChange={v => update({ category: v })} />
        <MultiSelectDropdown label="Vertical" values={allVerticals} selected={filters.vertical} onChange={v => update({ vertical: v })} />
        <MultiSelectDropdown label="Ciudad" values={allCities} selected={filters.city} onChange={v => update({ city: v })} />
        <MultiSelectDropdown label="Sub-vertical" values={allSubVerticals} selected={filters.economicActivity} onChange={v => update({ economicActivity: v })} />

        {/* Offer filter */}
        <MultiSelectDropdown
          label="Oferta"
          values={offerOptions.map(o => o.name)}
          selected={filters.offerFilter.map(id => offerOptions.find(o => o.id === id)?.name || '').filter(Boolean)}
          onChange={names => {
            const ids = names.map(n => offerOptions.find(o => o.name === n)?.id).filter(Boolean) as string[];
            // Clean up stage filters for removed offers
            const validStages = filters.stageFilter.filter(sid => {
              const s = stages.find(st => st.id === sid);
              return s && ids.includes(s.offerId);
            });
            update({ offerFilter: ids, stageFilter: validStages });
          }}
        />

        {/* Stage filter - only if offers selected */}
        {filters.offerFilter.length > 0 && stageOptions.length > 0 && (
          <MultiSelectDropdown
            label="Etapa"
            values={stageOptions.map(s => s.name)}
            selected={filters.stageFilter.map(id => stageOptions.find(s => s.id === id)?.name || '').filter(Boolean)}
            onChange={names => {
              const ids = names.map(n => stageOptions.find(s => s.name === n)?.id).filter(Boolean) as string[];
              update({ stageFilter: ids });
            }}
          />
        )}

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
            <div>
              <label className="text-xs text-muted-foreground">Moneda para filtro de ventas</label>
              <Select value={filters.salesFilterCurrency || 'COP'} onValueChange={v => update({ salesFilterCurrency: v as 'COP' | 'USD' })}>
                <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="COP">COP</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground">Ventas mín (M) {filters.salesFilterCurrency || 'COP'}</label>
                <Input className="mt-1 h-8 text-sm bg-background/80" type="number" value={filters.salesMin} onChange={e => update({ salesMin: e.target.value })} placeholder="0" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Ventas máx (M) {filters.salesFilterCurrency || 'COP'}</label>
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
                      <CustomSelectMultiFilter
                        options={field.options}
                        selected={(() => {
                          const v = filters.customFieldFilters?.[field.id];
                          if (!v) return [];
                          if (Array.isArray(v)) return v;
                          return [v];
                        })()}
                        onChange={vals => {
                          if (vals.length === 0) clearCustomFilter(field.id);
                          else updateCustomFilter(field.id, vals);
                        }}
                      />
                    ) : (
                      <Input className="mt-1 h-8 text-sm bg-background/80" value={typeof filters.customFieldFilters?.[field.id] === 'string' ? (filters.customFieldFilters[field.id] as string) : ''} onChange={e => e.target.value ? updateCustomFilter(field.id, e.target.value) : clearCustomFilter(field.id)} placeholder="Buscar..." />
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

function CustomSelectMultiFilter({ options, selected, onChange }: { options: string[]; selected: string[]; onChange: (vals: string[]) => void }) {
  const toggle = (val: string) => {
    if (selected.includes(val)) {
      onChange(selected.filter(v => v !== val));
    } else {
      onChange([...selected, val]);
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="mt-1 w-full h-8 justify-between text-xs">
          {selected.length === 0 ? 'Todos' : selected.length === 1 ? selected[0] : `${selected.length} seleccionados`}
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-48 max-h-48 overflow-y-auto p-2" align="start">
        {selected.length > 0 && (
          <button className="mb-1 w-full text-left rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent" onClick={() => onChange([])}>
            Limpiar
          </button>
        )}
        {options.map(opt => (
          <label key={opt} className="flex items-center gap-2 rounded-md px-2 py-1 text-xs cursor-pointer hover:bg-accent">
            <Checkbox checked={selected.includes(opt)} onCheckedChange={() => toggle(opt)} className="h-3 w-3" />
            <span className="truncate">{opt}</span>
          </label>
        ))}
      </PopoverContent>
    </Popover>
  );
}
