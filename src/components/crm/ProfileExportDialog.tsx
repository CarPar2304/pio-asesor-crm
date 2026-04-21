import { useEffect, useMemo, useState, useRef } from 'react';
import { Company } from '@/types/crm';
import { useCustomFields } from '@/contexts/CustomFieldsContext';
import { useWidgets } from '@/contexts/WidgetsContext';
import { useWidgetGridConfig } from '@/hooks/useWidgetGridConfig';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { FileDown, Loader2, X } from 'lucide-react';
import SectionWidgetRenderer from './SectionWidgetRenderer';
import {
  exportProfileToPdf,
  ExportOptions,
  ExportSectionConfig,
  DEFAULT_EXPORT_BLOCKS,
} from '@/lib/exportProfilePdf';

interface Props {
  open: boolean;
  onClose: () => void;
  company: Company;
  defaultCurrency: string;
}

interface SectionRenderInfo {
  sectionId: string;
  sectionName: string;
  widgets: any[];
  cols: number;
  rowH: number;
}

export default function ProfileExportDialog({ open, onClose, company, defaultCurrency }: Props) {
  const { sections, fields } = useCustomFields();
  const { widgets } = useWidgets();
  const [exporting, setExporting] = useState(false);

  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [currency, setCurrency] = useState<string>(defaultCurrency || 'COP');
  const [blocks, setBlocks] = useState({ ...DEFAULT_EXPORT_BLOCKS });

  // Build section list (unsectioned + each custom section)
  const sectionRows = useMemo(() => {
    const list: { id: string; name: string; hasFields: boolean; hasWidgets: boolean }[] = [];
    const unsectionedFields = fields.filter(f => !f.sectionId);
    if (unsectionedFields.length > 0) {
      list.push({ id: 'unsectioned', name: 'Campos personalizados', hasFields: true, hasWidgets: false });
    }
    sections.forEach(s => {
      const sectionFields = fields.filter(f => f.sectionId === s.id);
      const hasW = widgets.some(w => w.sectionId === s.id);
      list.push({
        id: s.id,
        name: s.name,
        hasFields: sectionFields.length > 0,
        hasWidgets: hasW || sectionFields.length > 0, // virtual widgets cover fields too
      });
    });
    return list;
  }, [sections, fields, widgets]);

  // Per-section toggles: includeFields & includeWidgets
  const [sectionState, setSectionState] = useState<Record<string, { fields: boolean; widgets: boolean }>>(() => {
    const init: Record<string, { fields: boolean; widgets: boolean }> = {};
    sectionRows.forEach(r => { init[r.id] = { fields: r.hasFields, widgets: r.hasWidgets }; });
    return init;
  });

  // Re-sync if the section list changes
  useEffect(() => {
    setSectionState(prev => {
      const next = { ...prev };
      let changed = false;
      sectionRows.forEach(r => {
        if (!next[r.id]) {
          next[r.id] = { fields: r.hasFields, widgets: r.hasWidgets };
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [sectionRows]);

  // Build the off-screen widget grids — one per section that includes widgets
  const renderInfos: SectionRenderInfo[] = sections
    .filter(s => sectionState[s.id]?.widgets)
    .map(s => {
      const sectionFields = fields.filter(f => f.sectionId === s.id);
      const sectionWidgets = widgets.filter(w => w.sectionId === s.id).sort((a, b) => a.displayOrder - b.displayOrder);
      const covered = new Set<string>();
      sectionWidgets.forEach((w: any) => {
        const srcs = (w.sources && w.sources.length > 0) ? w.sources : [{ sourceType: w.sourceType, sourceKey: w.sourceKey }];
        srcs.forEach((s: any) => covered.add(`${s.sourceType}:${s.sourceKey}`));
      });
      const virtualWidgets = sectionFields
        .filter(f => !covered.has(`custom_field:${f.id}`))
        .map((f, idx) => ({
          id: `__v_${f.id}`,
          sectionId: f.sectionId,
          title: f.name,
          widgetType: 'kpi' as const,
          sourceType: 'custom_field' as const,
          sourceKey: f.id,
          sources: [{ sourceType: 'custom_field' as const, sourceKey: f.id }],
          calculation: 'last' as const,
          config: { size: 'sm' as const, color: 'hsl(var(--primary))' },
          displayOrder: 1000 + idx,
          hideIfEmpty: true,
        }));
      return {
        sectionId: s.id,
        sectionName: s.name,
        widgets: [...sectionWidgets, ...virtualWidgets],
      } as any;
    });

  const refsMap = useRef<Record<string, HTMLDivElement | null>>({});

  const handleExport = async () => {
    setExporting(true);
    try {
      const sectionsCfg: ExportSectionConfig[] = sectionRows.map(r => ({
        sectionId: r.id,
        includeFields: !!sectionState[r.id]?.fields,
        includeWidgets: !!sectionState[r.id]?.widgets,
        widgetsElement: refsMap.current[r.id] || null,
      }));

      const opts: ExportOptions = {
        orientation,
        currencyCode: currency,
        blocks,
        sections: sectionsCfg,
      };

      // Allow next paint so off-screen grids render before capture
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(null))));

      await exportProfileToPdf(company, sections, fields, opts);
      onClose();
    } finally {
      setExporting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="profile-export-title">
      <button
        type="button"
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        aria-label="Cerrar exportación"
        onClick={() => { if (!exporting) onClose(); }}
      />

      <div className="relative z-[101] grid w-full max-w-2xl gap-4 rounded-lg border border-border bg-background p-6 shadow-lg">
        <button
          type="button"
          className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none"
          onClick={onClose}
          disabled={exporting}
          aria-label="Cerrar"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex flex-col space-y-1.5 text-center sm:text-left">
          <h2 id="profile-export-title" className="flex items-center gap-2 text-base font-semibold leading-none tracking-tight">
            <FileDown className="h-4 w-4" /> Exportar perfil a PDF
          </h2>
        </div>

        <ScrollArea className="max-h-[60vh] pr-3">
          <div className="space-y-5">
            {/* Orientation + currency */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Orientación</Label>
                <RadioGroup value={orientation} onValueChange={(v: any) => setOrientation(v)} className="mt-2 flex gap-3">
                  <div className="flex items-center gap-2">
                    <RadioGroupItem id="ori-p" value="portrait" />
                    <Label htmlFor="ori-p" className="text-sm font-normal cursor-pointer">Vertical</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem id="ori-l" value="landscape" />
                    <Label htmlFor="ori-l" className="text-sm font-normal cursor-pointer">Horizontal</Label>
                  </div>
                </RadioGroup>
              </div>
              <div>
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Moneda</Label>
                <RadioGroup value={currency} onValueChange={setCurrency} className="mt-2 flex gap-3">
                  <div className="flex items-center gap-2">
                    <RadioGroupItem id="cur-cop" value="COP" />
                    <Label htmlFor="cur-cop" className="text-sm font-normal cursor-pointer">COP</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem id="cur-usd" value="USD" />
                    <Label htmlFor="cur-usd" className="text-sm font-normal cursor-pointer">USD</Label>
                  </div>
                </RadioGroup>
              </div>
            </div>

            <Separator />

            {/* Fixed blocks */}
            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Bloques fijos</Label>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {([
                  ['header', 'Encabezado'],
                  ['metrics', 'Métricas clave'],
                  ['salesTable', 'Tabla de ventas'],
                  ['contacts', 'Contactos'],
                  ['actions', 'Acciones recientes'],
                  ['milestones', 'Hitos'],
                  ['tasks', 'Tareas pendientes'],
                ] as const).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2 text-sm cursor-pointer rounded-md border border-border/50 px-3 py-2 hover:bg-muted/40">
                    <Checkbox
                      checked={blocks[key]}
                      onCheckedChange={(v) => setBlocks(b => ({ ...b, [key]: !!v }))}
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </div>

            <Separator />

            {/* Sections */}
            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Secciones personalizadas</Label>
              {sectionRows.length === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">No hay secciones personalizadas.</p>
              ) : (
                <div className="mt-2 space-y-2">
                  {sectionRows.map(r => {
                    const isUnsectioned = r.id === 'unsectioned';
                    const st = sectionState[r.id] || { fields: false, widgets: false };
                    const included = st.fields || st.widgets;
                    return (
                      <div key={r.id} className="rounded-md border border-border/50 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <label className="flex items-center gap-2 text-sm font-medium cursor-pointer flex-1 min-w-0">
                            <Checkbox
                              checked={included}
                              onCheckedChange={(v) => {
                                const on = !!v;
                                setSectionState(prev => ({
                                  ...prev,
                                  [r.id]: on
                                    ? { fields: r.hasFields, widgets: !isUnsectioned && r.hasWidgets }
                                    : { fields: false, widgets: false },
                                }));
                              }}
                            />
                            <span className="truncate">{r.name}</span>
                          </label>
                          {included && !isUnsectioned && (
                            <div className="flex items-center gap-3 shrink-0">
                              <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                                <Checkbox
                                  checked={st.fields}
                                  onCheckedChange={(v) => setSectionState(prev => ({ ...prev, [r.id]: { ...prev[r.id], fields: !!v } }))}
                                />
                                Campos
                              </label>
                              <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                                <Checkbox
                                  checked={st.widgets}
                                  disabled={!r.hasWidgets}
                                  onCheckedChange={(v) => setSectionState(prev => ({ ...prev, [r.id]: { ...prev[r.id], widgets: !!v } }))}
                                />
                                Widgets
                              </label>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </ScrollArea>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2">
          <Button variant="outline" onClick={onClose} disabled={exporting}>Cancelar</Button>
          <Button onClick={handleExport} disabled={exporting} className="gap-1.5">
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
            Exportar PDF
          </Button>
        </div>

        {/* Off-screen widget renderers used by html2canvas */}
        <div
          aria-hidden
          style={{
            position: 'fixed',
            left: '-10000px',
            top: 0,
            width: '900px',
            background: 'hsl(var(--background))',
            pointerEvents: 'none',
          }}
        >
          {renderInfos.map(info => (
            <OffscreenWidgetGrid
              key={info.sectionId}
              sectionId={info.sectionId}
              widgets={info.widgets}
              company={company}
              fields={fields}
              currency={currency}
              setRef={(el) => { refsMap.current[info.sectionId] = el; }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function OffscreenWidgetGrid({
  sectionId, widgets, company, fields, currency, setRef,
}: {
  sectionId: string;
  widgets: any[];
  company: Company;
  fields: any[];
  currency: string;
  setRef: (el: HTMLDivElement | null) => void;
}) {
  const { config } = useWidgetGridConfig(sectionId);
  const gridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: `repeat(${config.cols}, 1fr)`,
    gridAutoRows: `${config.rowH}px`,
    gridAutoFlow: 'dense',
    gap: '12px',
    padding: '16px',
    background: 'white',
  };
  return (
    <div ref={setRef} style={gridStyle}>
      {widgets.map((w: any) => (
        <SectionWidgetRenderer
          key={w.id}
          widget={w}
          company={company}
          fields={fields}
          viewCurrency={currency}
          gridCols={config.cols}
        />
      ))}
    </div>
  );
}
