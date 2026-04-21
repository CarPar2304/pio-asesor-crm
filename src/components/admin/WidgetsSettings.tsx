import { useState, useMemo, useEffect } from 'react';
import { useWidgets } from '@/contexts/WidgetsContext';
import { useCustomFields } from '@/contexts/CustomFieldsContext';
import {
  SectionWidget, WidgetType, WidgetCalculation, WidgetSize, WidgetSource,
  WIDGET_TYPE_LABELS, CALCULATION_LABELS, SIZE_LABELS, SIZE_COL_SPAN, SIZE_ORDER,
  NATIVE_FIELDS, WIDGET_PALETTE,
} from '@/types/widgets';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Dialog, DialogPortal, DialogTitle } from '@/components/ui/dialog';
import { Plus, Pencil, Trash2, BarChart3, LineChart, PieChart, Sparkles, Table as TableIcon, Maximize2, GripVertical, X } from 'lucide-react';
import { showSuccess } from '@/lib/toast';
import { cn } from '@/lib/utils';
import {
  DndContext, DragEndEvent, PointerSensor, useSensor, useSensors, closestCenter,
} from '@dnd-kit/core';
import {
  SortableContext, useSortable, arrayMove, rectSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const WIDGET_ICONS: Record<WidgetType, any> = {
  kpi: Sparkles, bar: BarChart3, line: LineChart, pie: PieChart, table: TableIcon,
};

type VirtualWidget = SectionWidget & { __virtual?: boolean; __fieldKey?: string };

const VIRTUAL_PREFIX = '__v_';

function buildVirtualWidget(sectionId: string, source: WidgetSource, label: string, order: number): VirtualWidget {
  return {
    id: `${VIRTUAL_PREFIX}${source.sourceType}_${source.sourceKey}`,
    sectionId,
    title: label,
    widgetType: 'kpi',
    sourceType: source.sourceType,
    sourceKey: source.sourceKey,
    sources: [source],
    calculation: 'last',
    config: { size: 'sm', color: WIDGET_PALETTE[0] },
    displayOrder: order,
    hideIfEmpty: true,
    __virtual: true,
    __fieldKey: `${source.sourceType}:${source.sourceKey}`,
  };
}

export default function WidgetsSettings() {
  const { sections, fields } = useCustomFields();
  const { widgets, addWidget, updateWidget, deleteWidget, reorderWidgets } = useWidgets();
  const [activeSection, setActiveSection] = useState<string>('');
  const [editId, setEditId] = useState<string | null>(null);
  const [draftWidget, setDraftWidget] = useState<Partial<VirtualWidget> | null>(null);

  useEffect(() => {
    if (!activeSection && sections.length > 0) setActiveSection(sections[0].id);
  }, [sections, activeSection]);

  // Build widget list: persisted + virtual (auto-generated from fields)
  const sectionItems = useMemo<VirtualWidget[]>(() => {
    if (!activeSection) return [];
    const persisted = widgets
      .filter(w => w.sectionId === activeSection)
      .sort((a, b) => a.displayOrder - b.displayOrder) as VirtualWidget[];

    // Identify which sources are already covered
    const covered = new Set<string>();
    persisted.forEach(w => (w.sources.length > 0 ? w.sources : [{ sourceType: w.sourceType, sourceKey: w.sourceKey }]).forEach(s => {
      covered.add(`${s.sourceType}:${s.sourceKey}`);
    }));

    const sectionFields = fields.filter(f => f.sectionId === activeSection);
    const virtuals: VirtualWidget[] = [];
    let order = persisted.length;
    sectionFields.forEach(f => {
      const key = `custom_field:${f.id}`;
      if (!covered.has(key)) {
        virtuals.push(buildVirtualWidget(activeSection, { sourceType: 'custom_field', sourceKey: f.id }, f.name, order++));
      }
    });

    return [...persisted, ...virtuals];
  }, [activeSection, widgets, fields]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = sectionItems.map(w => w.id);
    const oldIdx = ids.indexOf(String(active.id));
    const newIdx = ids.indexOf(String(over.id));
    if (oldIdx < 0 || newIdx < 0) return;
    const reordered = arrayMove(sectionItems, oldIdx, newIdx);
    // Persist any virtual that moved past its natural position by materializing
    const persistedIds = reordered.filter(w => !w.__virtual).map(w => w.id);
    if (persistedIds.length > 0) await reorderWidgets(activeSection, persistedIds);
  };

  const cycleSize = async (w: VirtualWidget) => {
    const idx = SIZE_ORDER.indexOf(w.config.size || 'sm');
    const next = SIZE_ORDER[(idx + 1) % SIZE_ORDER.length];
    const updated = { ...w, config: { ...w.config, size: next } };
    if (w.__virtual) {
      // Materialize on edit
      await materialize(updated);
    } else {
      await updateWidget(updated);
    }
  };

  const materialize = async (w: VirtualWidget): Promise<SectionWidget | null> => {
    const created = await addWidget({
      sectionId: w.sectionId,
      title: w.title,
      widgetType: w.widgetType,
      sourceType: w.sourceType,
      sourceKey: w.sourceKey,
      sources: w.sources,
      calculation: w.calculation,
      config: w.config,
      hideIfEmpty: w.hideIfEmpty,
    });
    return created;
  };

  const handleDelete = async (w: VirtualWidget) => {
    if (w.__virtual) return; // Virtual = not persisted, nothing to delete
    if (!confirm('¿Eliminar este widget?')) return;
    await deleteWidget(w.id);
    showSuccess('Widget eliminado');
  };

  const openEditor = (w: VirtualWidget) => {
    setEditId(w.id);
    setDraftWidget({ ...w });
  };

  const closeEditor = () => {
    setEditId(null);
    setDraftWidget(null);
  };

  const handleSaveDraft = async () => {
    if (!draftWidget) return;
    const w = draftWidget as VirtualWidget;
    if (w.sources.length === 0 || !w.sources[0].sourceKey) return;
    if (w.__virtual || !w.id || w.id.startsWith(VIRTUAL_PREFIX)) {
      const { __virtual, __fieldKey, id, displayOrder, ...rest } = w as any;
      await addWidget(rest);
      showSuccess('Widget guardado');
    } else {
      await updateWidget(w as SectionWidget);
      showSuccess('Widget actualizado');
    }
    closeEditor();
  };

  const handleAddNew = () => {
    if (!activeSection) return;
    setEditId('__new');
    setDraftWidget({
      id: '__new',
      sectionId: activeSection,
      title: '',
      widgetType: 'kpi',
      sourceType: 'custom_field',
      sourceKey: '',
      sources: [],
      calculation: 'last',
      config: { size: 'md', color: WIDGET_PALETTE[0] },
      displayOrder: 0,
      hideIfEmpty: true,
      __virtual: true,
    });
  };

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
        <h2 className="text-base font-semibold">Maquetador de visualizaciones</h2>
        <p className="text-xs text-muted-foreground">
          Cada campo aparece como widget. Arrastra para reordenar, click para editar tipo y tamaño,
          o crea widgets compuestos combinando varias variables.
        </p>
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

      {/* Canvas */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex justify-between items-center mb-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Vista previa del perfil — arrastra para reordenar
          </p>
          <Button size="sm" onClick={handleAddNew} className="gap-1"><Plus className="h-3.5 w-3.5" /> Widget compuesto</Button>
        </div>

        {sectionItems.length === 0 ? (
          <p className="text-xs text-muted-foreground py-8 text-center">
            Esta sección no tiene campos. Crea campos en "Campos" o agrega un widget compuesto.
          </p>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={sectionItems.map(w => w.id)} strategy={rectSortingStrategy}>
              <div className="grid grid-cols-4 gap-3">
                {sectionItems.map(w => (
                  <SortableWidgetCard
                    key={w.id}
                    widget={w}
                    fields={fields}
                    onEdit={() => openEditor(w)}
                    onDelete={() => handleDelete(w)}
                    onCycleSize={() => cycleSize(w)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      {/* Editor panel */}
      <Dialog open={!!editId} onOpenChange={(o) => !o && closeEditor()}>
        <DialogPortal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 backdrop-blur-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <DialogPrimitive.Content className="fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg max-h-[85vh] translate-x-[-50%] translate-y-[-50%] gap-4 overflow-y-auto border bg-background p-6 shadow-lg rounded-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
            <div className="flex items-center justify-between">
              <DialogTitle>{editId === '__new' ? 'Nuevo widget compuesto' : 'Editar widget'}</DialogTitle>
              <DialogPrimitive.Close className="rounded-sm opacity-70 hover:opacity-100 focus:outline-none">
                <X className="h-4 w-4" />
                <span className="sr-only">Close</span>
              </DialogPrimitive.Close>
            </div>
            {draftWidget && (
              <WidgetEditor
                widget={draftWidget as VirtualWidget}
                fields={fields}
                
                onChange={setDraftWidget}
                onSave={handleSaveDraft}
                onCancel={closeEditor}
              />
            )}
          </DialogPrimitive.Content>
        </DialogPortal>
      </Dialog>
    </div>
  );
}

// =============== Sortable card ===============
function SortableWidgetCard({ widget, fields, onEdit, onDelete, onCycleSize }: {
  widget: VirtualWidget; fields: any[]; onEdit: () => void; onDelete: () => void; onCycleSize: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: widget.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  const Icon = WIDGET_ICONS[widget.widgetType];
  const size = widget.config.size || 'md';
  const colSpan = SIZE_COL_SPAN[size];
  const sourceCount = widget.sources.length || 1;
  const primarySrc = widget.sources[0] || { sourceType: widget.sourceType, sourceKey: widget.sourceKey };
  const sourceLabel = primarySrc.sourceType === 'native'
    ? NATIVE_FIELDS.find(n => n.key === primarySrc.sourceKey)?.label
    : fields.find(f => f.id === primarySrc.sourceKey)?.name;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        colSpan,
        'group relative rounded-lg border-2 bg-card p-3 transition-colors',
        widget.__virtual ? 'border-dashed border-border/50' : 'border-border/70',
        'hover:border-primary/50'
      )}
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className="absolute top-1 left-1 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity"
        aria-label="Arrastrar"
      >
        <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
      </button>

      {/* Action buttons */}
      <div className="absolute top-1 right-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => { e.stopPropagation(); onCycleSize(); }}
          className="p-1 rounded hover:bg-muted"
          title={`Tamaño: ${SIZE_LABELS[size]}`}
        >
          <Maximize2 className="h-3 w-3 text-muted-foreground" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onEdit(); }}
          className="p-1 rounded hover:bg-muted"
          title="Editar"
        >
          <Pencil className="h-3 w-3 text-muted-foreground" />
        </button>
        {!widget.__virtual && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="p-1 rounded hover:bg-destructive/10"
            title="Eliminar"
          >
            <Trash2 className="h-3 w-3 text-destructive" />
          </button>
        )}
      </div>

      <div onClick={onEdit} className="cursor-pointer pt-3">
        <div className="flex items-center gap-1.5 mb-1">
          <Icon className="h-3 w-3 text-primary shrink-0" />
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground truncate">
            {WIDGET_TYPE_LABELS[widget.widgetType]}
          </span>
        </div>
        <p className="text-xs font-semibold truncate">{widget.title || sourceLabel || 'Sin título'}</p>
        <p className="text-[10px] text-muted-foreground truncate mt-0.5">
          {sourceCount > 1 ? `${sourceCount} variables` : (sourceLabel || '—')}
        </p>
        <div className="flex items-center gap-1 mt-2">
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{size}</span>
          {widget.__virtual && <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground italic">auto</span>}
          {widget.hideIfEmpty && <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">oculta vacío</span>}
        </div>
      </div>
    </div>
  );
}

// =============== Editor ===============
function WidgetEditor({ widget, onChange, fields, onSave, onCancel }: {
  widget: VirtualWidget; onChange: (w: Partial<VirtualWidget>) => void; fields: any[]; onSave: () => void; onCancel: () => void;
}) {
  const sources = widget.sources && widget.sources.length > 0
    ? widget.sources
    : (widget.sourceKey ? [{ sourceType: widget.sourceType, sourceKey: widget.sourceKey } as WidgetSource] : []);

  const updateSources = (newSources: WidgetSource[]) => {
    onChange({ ...widget, sources: newSources, sourceType: newSources[0]?.sourceType || widget.sourceType, sourceKey: newSources[0]?.sourceKey || '' });
  };

  const addSource = () => {
    if (sources.length >= 5) return;
    updateSources([...sources, { sourceType: 'custom_field', sourceKey: '' }]);
  };

  const updateSource = (idx: number, patch: Partial<WidgetSource>) => {
    const next = [...sources];
    next[idx] = { ...next[idx], ...patch };
    updateSources(next);
  };

  const removeSource = (idx: number) => {
    updateSources(sources.filter((_, i) => i !== idx));
  };

  const isMultiCapable = widget.widgetType !== 'kpi' || sources.length > 1;

  return (
    <div className="space-y-4 mt-4">
      <div>
        <Label className="text-xs">Título (opcional)</Label>
        <Input className="mt-1" value={widget.title || ''} onChange={e => onChange({ ...widget, title: e.target.value })} placeholder="Auto: nombre de la variable" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Tipo de visualización</Label>
          <Select value={widget.widgetType} onValueChange={(v: WidgetType) => onChange({ ...widget, widgetType: v })}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(WIDGET_TYPE_LABELS).map(([k, lbl]) => <SelectItem key={k} value={k}>{lbl}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Tamaño</Label>
          <Select value={widget.config?.size || 'md'} onValueChange={(v: WidgetSize) => onChange({ ...widget, config: { ...widget.config, size: v } })}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(SIZE_LABELS).map(([k, lbl]) => <SelectItem key={k} value={k}>{lbl}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <div className="flex justify-between items-center mb-2">
          <Label className="text-xs">Variables ({sources.length})</Label>
          <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={addSource} disabled={sources.length >= 5}>
            <Plus className="h-3 w-3" /> Añadir
          </Button>
        </div>
        <div className="space-y-2">
          {sources.length === 0 && (
            <p className="text-[11px] text-muted-foreground italic px-2">Añade al menos una variable.</p>
          )}
          {sources.map((src, idx) => (
            <div key={idx} className="rounded-md border border-border/60 p-2 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Variable {idx + 1}</span>
                {sources.length > 1 && (
                  <button onClick={() => removeSource(idx)} className="p-0.5 rounded hover:bg-destructive/10">
                    <X className="h-3 w-3 text-destructive" />
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Select value={src.sourceType} onValueChange={(v: 'native' | 'custom_field') => updateSource(idx, { sourceType: v, sourceKey: '' })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="custom_field">Personalizado</SelectItem>
                    <SelectItem value="native">Nativo</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={src.sourceKey} onValueChange={(v) => updateSource(idx, { sourceKey: v })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Variable" /></SelectTrigger>
                  <SelectContent>
                    {src.sourceType === 'native'
                      ? NATIVE_FIELDS.map(n => <SelectItem key={n.key} value={n.key}>{n.label}</SelectItem>)
                      : fields.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {sources.length > 1 && (
                <Input
                  className="h-7 text-xs"
                  value={src.label || ''}
                  onChange={e => updateSource(idx, { label: e.target.value })}
                  placeholder="Etiqueta (opcional)"
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {(widget.widgetType === 'kpi' || isMultiCapable) && (
        <div>
          <Label className="text-xs">Cálculo</Label>
          <Select value={widget.calculation} onValueChange={(v: WidgetCalculation) => onChange({ ...widget, calculation: v })}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(CALCULATION_LABELS).map(([k, lbl]) => <SelectItem key={k} value={k}>{lbl}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}

      {widget.widgetType === 'kpi' && sources.length > 1 && (
        <div>
          <Label className="text-xs">Combinar variables (KPI)</Label>
          <Select value={widget.config.combine || 'sum'} onValueChange={(v: 'sum' | 'avg') => onChange({ ...widget, config: { ...widget.config, combine: v } })}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="sum">Suma</SelectItem>
              <SelectItem value="avg">Promedio</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      <div>
        <Label className="text-xs">Color principal</Label>
        <div className="flex gap-2 mt-1 flex-wrap">
          {WIDGET_PALETTE.map(c => (
            <button
              key={c}
              onClick={() => onChange({ ...widget, config: { ...widget.config, color: c } })}
              className={cn('h-7 w-7 rounded-md border-2', widget.config?.color === c ? 'border-foreground' : 'border-transparent')}
              style={{ background: c }}
            />
          ))}
        </div>
      </div>

      {widget.widgetType === 'kpi' && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Prefijo</Label>
            <Input className="mt-1" value={widget.config?.prefix || ''} onChange={e => onChange({ ...widget, config: { ...widget.config, prefix: e.target.value } })} placeholder="$" />
          </div>
          <div>
            <Label className="text-xs">Sufijo</Label>
            <Input className="mt-1" value={widget.config?.suffix || ''} onChange={e => onChange({ ...widget, config: { ...widget.config, suffix: e.target.value } })} placeholder="/año" />
          </div>
        </div>
      )}

      <div className="flex items-center justify-between rounded-md border border-border/60 p-3">
        <div>
          <Label className="text-xs">Ocultar si no hay datos</Label>
          <p className="text-[10px] text-muted-foreground">El widget no se mostrará en el perfil cuando no haya valores.</p>
        </div>
        <Switch checked={widget.hideIfEmpty !== false} onCheckedChange={(v) => onChange({ ...widget, hideIfEmpty: v })} />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onCancel}>Cancelar</Button>
        <Button onClick={onSave} disabled={sources.length === 0 || !sources[0].sourceKey}>Guardar</Button>
      </div>
    </div>
  );
}
