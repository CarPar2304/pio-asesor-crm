import { useState, useMemo } from 'react';
import { useWidgets } from '@/contexts/WidgetsContext';
import { useCustomFields } from '@/contexts/CustomFieldsContext';
import { SectionWidget, WidgetType, WidgetCalculation, WidgetSourceType, WidgetSize, WIDGET_TYPE_LABELS, CALCULATION_LABELS, SIZE_LABELS, NATIVE_FIELDS } from '@/types/widgets';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Pencil, Trash2, BarChart3, LineChart, PieChart, Sparkles, Table as TableIcon, ArrowUp, ArrowDown } from 'lucide-react';
import { showSuccess } from '@/lib/toast';
import { cn } from '@/lib/utils';

const WIDGET_ICONS: Record<WidgetType, any> = {
  kpi: Sparkles, bar: BarChart3, line: LineChart, pie: PieChart, table: TableIcon,
};

interface EditState {
  open: boolean;
  widget: Partial<SectionWidget> | null;
}

export default function WidgetsSettings() {
  const { sections, fields } = useCustomFields();
  const { widgets, addWidget, updateWidget, deleteWidget, reorderWidgets } = useWidgets();
  const [activeSection, setActiveSection] = useState<string>(sections[0]?.id || '');
  const [edit, setEdit] = useState<EditState>({ open: false, widget: null });

  const sectionWidgets = useMemo(
    () => widgets.filter(w => w.sectionId === activeSection).sort((a, b) => a.displayOrder - b.displayOrder),
    [widgets, activeSection]
  );

  const sectionFields = fields.filter(f => f.sectionId === activeSection);

  const openCreate = () => setEdit({ open: true, widget: { sectionId: activeSection, widgetType: 'kpi', sourceType: 'custom_field', sourceKey: '', calculation: 'last', title: '', config: { size: 'md', color: 'hsl(var(--primary))' } } });
  const openEdit = (w: SectionWidget) => setEdit({ open: true, widget: { ...w } });

  const handleSave = async () => {
    const w = edit.widget;
    if (!w || !w.sourceKey || !w.sectionId) return;
    if ('id' in w && w.id) {
      await updateWidget(w as SectionWidget);
      showSuccess('Widget actualizado');
    } else {
      await addWidget({
        sectionId: w.sectionId!,
        title: w.title || '',
        widgetType: w.widgetType as WidgetType,
        sourceType: w.sourceType as WidgetSourceType,
        sourceKey: w.sourceKey,
        calculation: w.calculation as WidgetCalculation,
        config: w.config || {},
      });
      showSuccess('Widget creado');
    }
    setEdit({ open: false, widget: null });
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este widget?')) return;
    await deleteWidget(id);
    showSuccess('Widget eliminado');
  };

  const move = async (idx: number, dir: -1 | 1) => {
    const newOrder = [...sectionWidgets];
    const target = idx + dir;
    if (target < 0 || target >= newOrder.length) return;
    [newOrder[idx], newOrder[target]] = [newOrder[target], newOrder[idx]];
    await reorderWidgets(activeSection, newOrder.map(w => w.id));
  };

  const w = edit.widget;
  const sourceOptions = w?.sourceType === 'native'
    ? NATIVE_FIELDS.map(n => ({ value: n.key, label: n.label, type: n.type }))
    : fields.map(f => ({ value: f.id, label: `${f.name}${f.sectionId ? '' : ' (sin sección)'}`, type: f.fieldType }));

  const selectedSource = sourceOptions.find(o => o.value === w?.sourceKey);
  const isNumeric = selectedSource?.type === 'metric_by_year' || selectedSource?.type === 'number';

  if (sections.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-8 text-center">
        <p className="text-sm text-muted-foreground">Crea primero secciones de empresa para configurar visualizaciones.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">Visualizaciones por sección</h2>
        <p className="text-xs text-muted-foreground">Configura gráficas, KPIs y tablas que aparecerán en cada sección del perfil de empresa.</p>
      </div>

      {/* Section selector */}
      <div className="flex flex-wrap gap-1.5">
        {sections.map(s => (
          <button
            key={s.id}
            onClick={() => setActiveSection(s.id)}
            className={cn(
              'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
              activeSection === s.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/70'
            )}
          >
            {s.name}
          </button>
        ))}
      </div>

      {/* Widgets list */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex justify-between items-center">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Widgets de la sección</p>
          <Button size="sm" onClick={openCreate} className="gap-1"><Plus className="h-3.5 w-3.5" /> Nuevo widget</Button>
        </div>

        {sectionWidgets.length === 0 ? (
          <p className="text-xs text-muted-foreground py-4 text-center">Sin widgets configurados. Agrega uno para empezar.</p>
        ) : (
          <div className="space-y-2">
            {sectionWidgets.map((widget, idx) => {
              const Icon = WIDGET_ICONS[widget.widgetType];
              const sourceLabel = widget.sourceType === 'native'
                ? NATIVE_FIELDS.find(n => n.key === widget.sourceKey)?.label
                : fields.find(f => f.id === widget.sourceKey)?.name;
              return (
                <div key={widget.id} className="flex items-center gap-3 rounded-lg border border-border/50 p-3">
                  <Icon className="h-4 w-4 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{widget.title || sourceLabel || 'Sin título'}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {WIDGET_TYPE_LABELS[widget.widgetType]} · {sourceLabel || '—'}
                      {widget.widgetType === 'kpi' && ` · ${CALCULATION_LABELS[widget.calculation]}`}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => move(idx, -1)} disabled={idx === 0}><ArrowUp className="h-3.5 w-3.5" /></Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => move(idx, 1)} disabled={idx === sectionWidgets.length - 1}><ArrowDown className="h-3.5 w-3.5" /></Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(widget)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDelete(widget.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Edit dialog */}
      <Dialog open={edit.open} onOpenChange={(o) => !o && setEdit({ open: false, widget: null })}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{w && 'id' in w && w.id ? 'Editar widget' : 'Nuevo widget'}</DialogTitle>
          </DialogHeader>
          {w && (
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Título (opcional)</Label>
                <Input className="mt-1" value={w.title || ''} onChange={e => setEdit({ ...edit, widget: { ...w, title: e.target.value } })} placeholder="Ej. Ventas históricas" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Tipo de visualización</Label>
                  <Select value={w.widgetType} onValueChange={(v: WidgetType) => setEdit({ ...edit, widget: { ...w, widgetType: v } })}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(WIDGET_TYPE_LABELS).map(([k, lbl]) => <SelectItem key={k} value={k}>{lbl}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Tamaño</Label>
                  <Select value={w.config?.size || 'md'} onValueChange={(v: WidgetSize) => setEdit({ ...edit, widget: { ...w, config: { ...w.config, size: v } } })}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(SIZE_LABELS).map(([k, lbl]) => <SelectItem key={k} value={k}>{lbl}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label className="text-xs">Origen de la variable</Label>
                <Select value={w.sourceType} onValueChange={(v: WidgetSourceType) => setEdit({ ...edit, widget: { ...w, sourceType: v, sourceKey: '' } })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="custom_field">Campo personalizado</SelectItem>
                    <SelectItem value="native">Campo nativo de empresa</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs">Variable</Label>
                <Select value={w.sourceKey} onValueChange={(v) => setEdit({ ...edit, widget: { ...w, sourceKey: v } })}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Selecciona una variable" /></SelectTrigger>
                  <SelectContent>
                    {sourceOptions.length === 0 && <div className="p-2 text-xs text-muted-foreground">No hay variables disponibles</div>}
                    {sourceOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                {w.sourceType === 'custom_field' && sectionFields.length > 0 && (
                  <p className="text-[10px] text-muted-foreground mt-1">Tip: hay {sectionFields.length} campo(s) en esta sección. También puedes usar campos de otras secciones.</p>
                )}
              </div>

              {w.widgetType === 'kpi' && isNumeric && (
                <div>
                  <Label className="text-xs">Cálculo</Label>
                  <Select value={w.calculation} onValueChange={(v: WidgetCalculation) => setEdit({ ...edit, widget: { ...w, calculation: v } })}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(CALCULATION_LABELS).map(([k, lbl]) => <SelectItem key={k} value={k}>{lbl}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Color</Label>
                  <div className="flex gap-2 mt-1 flex-wrap">
                    {['hsl(var(--primary))', 'hsl(var(--success))', 'hsl(var(--gold))', 'hsl(var(--destructive))', '#8b5cf6', '#06b6d4'].map(c => (
                      <button
                        key={c}
                        onClick={() => setEdit({ ...edit, widget: { ...w, config: { ...w.config, color: c } } })}
                        className={cn('h-7 w-7 rounded-md border-2', w.config?.color === c ? 'border-foreground' : 'border-transparent')}
                        style={{ background: c }}
                      />
                    ))}
                  </div>
                </div>
                {w.widgetType === 'kpi' && (
                  <div>
                    <Label className="text-xs">Sufijo (opcional)</Label>
                    <Input className="mt-1" value={w.config?.suffix || ''} onChange={e => setEdit({ ...edit, widget: { ...w, config: { ...w.config, suffix: e.target.value } } })} placeholder="Ej. /año" />
                  </div>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEdit({ open: false, widget: null })}>Cancelar</Button>
            <Button onClick={handleSave} disabled={!w?.sourceKey}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
