import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, CheckSquare, Square } from 'lucide-react';
import { useCustomFields } from '@/contexts/CustomFieldsContext';
import { useCRM } from '@/contexts/CRMContext';

export interface FieldOption {
  id: string;
  label: string;
  group: string;
  type: 'base' | 'sales_year' | 'contact' | 'custom';
  year?: number;
  fieldId?: string;
}

const METRIC_YEARS = [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026];

export function useAvailableFields(): FieldOption[] {
  const { fields } = useCustomFields();
  const { companies } = useCRM();

  return useMemo(() => {
    // Collect all sales years from companies
    const salesYears = new Set<number>();
    companies.forEach(c => Object.keys(c.salesByYear).forEach(y => salesYears.add(Number(y))));
    METRIC_YEARS.forEach(y => salesYears.add(y));
    const sortedYears = Array.from(salesYears).sort((a, b) => a - b);

    const result: FieldOption[] = [
      { id: 'tradeName', label: 'Nombre comercial', group: 'Información general', type: 'base' },
      { id: 'legalName', label: 'Razón social', group: 'Información general', type: 'base' },
      { id: 'nit', label: 'NIT', group: 'Información general', type: 'base' },
      { id: 'category', label: 'Categoría', group: 'Información general', type: 'base' },
      { id: 'vertical', label: 'Vertical', group: 'Información general', type: 'base' },
      { id: 'economicActivity', label: 'Sub-vertical', group: 'Información general', type: 'base' },
      { id: 'description', label: 'Descripción', group: 'Información general', type: 'base' },
      { id: 'city', label: 'Ciudad', group: 'Información general', type: 'base' },
      { id: 'website', label: 'Sitio web', group: 'Información general', type: 'base' },
      { id: 'exportsUSD', label: 'Exportaciones USD', group: 'Información general', type: 'base' },
    ];

    sortedYears.forEach(y => {
      result.push({ id: `sales_${y}`, label: `Ventas ${y}`, group: 'Ventas por año', type: 'sales_year', year: y });
    });

    result.push(
      { id: 'contactName', label: 'Nombre contacto', group: 'Contacto principal', type: 'contact' },
      { id: 'contactPosition', label: 'Cargo contacto', group: 'Contacto principal', type: 'contact' },
      { id: 'contactEmail', label: 'Email contacto', group: 'Contacto principal', type: 'contact' },
      { id: 'contactPhone', label: 'Teléfono contacto', group: 'Contacto principal', type: 'contact' },
      { id: 'contactGender', label: 'Género contacto', group: 'Contacto principal', type: 'contact' },
    );

    const simpleFields = fields.filter(f => f.fieldType !== 'metric_by_year');
    const metricFields = fields.filter(f => f.fieldType === 'metric_by_year');

    simpleFields.forEach(f => {
      result.push({ id: `custom_${f.id}`, label: f.name, group: 'Campos personalizados', type: 'custom', fieldId: f.id });
    });

    metricFields.forEach(f => {
      METRIC_YEARS.forEach(y => {
        result.push({ id: `custom_${f.id}_${y}`, label: `${f.name} ${y}`, group: 'Métricas personalizadas', type: 'custom', fieldId: f.id, year: y });
      });
    });

    return result;
  }, [fields, companies]);
}

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: (selectedFields: FieldOption[]) => void;
  title: string;
  confirmLabel: string;
  /** Pre-selected field IDs */
  defaultSelected?: string[];
}

export default function FieldSelectorDialog({ open, onClose, onConfirm, title, confirmLabel, defaultSelected }: Props) {
  const allFields = useAvailableFields();
  const [selected, setSelected] = useState<Set<string>>(new Set(defaultSelected || allFields.map(f => f.id)));
  const [search, setSearch] = useState('');

  // Reset selection when opening
  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      setSelected(new Set(defaultSelected || allFields.map(f => f.id)));
      setSearch('');
    } else {
      onClose();
    }
  };

  const groups = useMemo(() => {
    const map = new Map<string, FieldOption[]>();
    const s = search.toLowerCase();
    allFields.forEach(f => {
      if (s && !f.label.toLowerCase().includes(s) && !f.group.toLowerCase().includes(s)) return;
      const list = map.get(f.group) || [];
      list.push(f);
      map.set(f.group, list);
    });
    return map;
  }, [allFields, search]);

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleGroup = (group: string) => {
    const groupFields = groups.get(group) || [];
    const allSelected = groupFields.every(f => selected.has(f.id));
    setSelected(prev => {
      const next = new Set(prev);
      groupFields.forEach(f => { if (allSelected) next.delete(f.id); else next.add(f.id); });
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(allFields.map(f => f.id)));
  const selectNone = () => setSelected(new Set());

  const handleConfirm = () => {
    const selectedFields = allFields.filter(f => selected.has(f.id));
    onConfirm(selectedFields);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="w-[min(92vw,56rem)] max-w-3xl h-[min(90vh,48rem)] overflow-hidden p-0 gap-0 flex flex-col">
        <DialogHeader className="border-b border-border px-5 py-4 shrink-0">
          <DialogTitle className="text-base">{title}</DialogTitle>
        </DialogHeader>

        <div className="px-5 pt-3 pb-2 space-y-2 shrink-0">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input placeholder="Buscar campos..." value={search} onChange={e => setSearch(e.target.value)} className="h-9 pl-8 text-sm" />
          </div>
          <div className="flex items-center justify-between">
            <Badge variant="secondary" className="text-xs">{selected.size} de {allFields.length} campos</Badge>
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={selectAll}>
                <CheckSquare className="h-3 w-3" /> Todos
              </Button>
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={selectNone}>
                <Square className="h-3 w-3" /> Ninguno
              </Button>
            </div>
          </div>
        </div>

        <ScrollArea className="flex-1 min-h-0">
          <div className="px-5 pb-4 space-y-4">
            {Array.from(groups.entries()).map(([group, fieldsList]) => {
              const allGroupSelected = fieldsList.every(f => selected.has(f.id));
              const someGroupSelected = fieldsList.some(f => selected.has(f.id));
              return (
                <div key={group}>
                  <button
                    type="button"
                    className="flex items-center gap-2 mb-2 group"
                    onClick={() => toggleGroup(group)}
                  >
                    <Checkbox
                      checked={allGroupSelected ? true : someGroupSelected ? 'indeterminate' : false}
                      className="pointer-events-none"
                    />
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground group-hover:text-foreground transition-colors">
                      {group}
                    </span>
                    <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                      {fieldsList.filter(f => selected.has(f.id)).length}/{fieldsList.length}
                    </Badge>
                  </button>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 pl-6">
                    {fieldsList.map(f => (
                      <label key={f.id} className="flex items-center gap-2 py-1 cursor-pointer hover:bg-accent/50 rounded px-1.5 -mx-1.5 transition-colors">
                        <Checkbox checked={selected.has(f.id)} onCheckedChange={() => toggle(f.id)} />
                        <span className="text-sm truncate">{f.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>

        <DialogFooter className="border-t border-border px-5 py-3 shrink-0">
          <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
          <Button size="sm" onClick={handleConfirm} disabled={selected.size === 0}>{confirmLabel} ({selected.size})</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
