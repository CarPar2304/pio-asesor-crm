import { useState, useMemo, useEffect } from 'react';
import { Company, GENDER_LABELS } from '@/types/crm';
import { calculateGrowth, formatSales, formatPercentage, formatUSD, formatFullSales, getLastYearSales } from '@/lib/calculations';
import { getUSDtoCOP, convertWithTRM } from '@/lib/exchangeRate';
import { useCRM } from '@/contexts/CRMContext';
import { useProfile } from '@/contexts/ProfileContext';
import { showSuccess } from '@/lib/toast';
import { useCustomFields } from '@/contexts/CustomFieldsContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, Phone, CheckSquare, Flag, Pencil, Mail, User, Star, Globe, Trash2, GitBranch, FileDown, MousePointerClick } from 'lucide-react';
import ProfileExportDialog from './ProfileExportDialog';
import ActivityTimeline from './ActivityTimeline';
import CompanyTimeline from './CompanyTimeline';
import QuickActionDialog from './QuickActionDialog';
import CompanyForm from './CompanyForm';
import SalesChart from './SalesChart';
import AddToPipelineDialog from '@/components/portfolio/AddToPipelineDialog';
import CompanyPipelineNotes from './CompanyPipelineNotes';
import SectionWidgetRenderer from './SectionWidgetRenderer';
import { useWidgets } from '@/contexts/WidgetsContext';
import { useWidgetGridConfig } from '@/hooks/useWidgetGridConfig';
import { cn } from '@/lib/utils';

interface Props {
  company: Company;
  onBack: () => void;
}

export default function CompanyProfile({ company, onBack }: Props) {
  const [quickAction, setQuickAction] = useState<'action' | 'task' | 'milestone' | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [pipelineOpen, setPipelineOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [viewCurrency, setViewCurrency] = useState<string>('COP');
  const [trm, setTrm] = useState<number>(4200);
  const { sections, fields } = useCustomFields();
  const { widgets } = useWidgets();
  const { deleteCompany } = useCRM();
  const { salesCurrency } = useProfile();

  const companyCurrency = company.salesCurrency || 'COP';

  useEffect(() => {
    getUSDtoCOP().then(setTrm);
  }, []);

  const convert = (value: number) => convertWithTRM(value, companyCurrency, viewCurrency, trm);

  const handleDelete = async () => {
    if (confirm(`¿Eliminar "${company.tradeName}"? Esta acción no se puede deshacer.`)) {
      await deleteCompany(company.id);
      showSuccess('Empresa eliminada', `"${company.tradeName}" fue eliminada`);
      onBack();
    }
  };

  const { avgYoY, lastYoY } = calculateGrowth(company.salesByYear);
  const lastSales = getLastYearSales(company.salesByYear);
  const salesYears = Object.keys(company.salesByYear).map(Number).sort();

  const getFieldValueDisplay = (fieldId: string) => {
    const val = (company.fieldValues || []).find(v => v.fieldId === fieldId);
    if (!val) return null;
    const field = fields.find(f => f.id === fieldId);
    if (!field) return null;
    if (field.fieldType === 'metric_by_year') {
      const entries = Object.entries(val.yearValues || {}).filter(([_, v]) => v > 0);
      if (entries.length === 0) return null;
      return entries.sort(([a], [b]) => Number(a) - Number(b)).map(([y, v]) => `${y}: ${formatSales(v, viewCurrency)}`).join(' · ');
    }
    if (field.fieldType === 'number') return val.numberValue !== null ? String(val.numberValue) : null;
    return val.textValue || null;
  };

  // Find "Tipo de Cliente" field to show in metrics row
  const tipoClienteField = fields.find(f => f.name.toLowerCase().includes('tipo de cliente'));
  const tipoClienteValue = tipoClienteField ? getFieldValueDisplay(tipoClienteField.id) : null;

  // Build tabs: any section with fields OR widgets is shown (auto-virtual widgets handle empty filtering)
  const tabItems = useMemo(() => {
    const items: { id: string; label: string; type: 'section' | 'activity' }[] = [];

    const unsectionedFields = fields.filter(f => !f.sectionId && f.id !== tipoClienteField?.id);
    const hasUnsectioned = unsectionedFields.some(f => getFieldValueDisplay(f.id));
    if (hasUnsectioned) {
      items.push({ id: '__unsectioned', label: 'Campos personalizados', type: 'section' });
    }

    sections.forEach(s => {
      const sectionFields = fields.filter(f => f.sectionId === s.id);
      const hasWidgets = widgets.some(w => w.sectionId === s.id);
      if (sectionFields.length > 0 || hasWidgets) {
        items.push({ id: s.id, label: s.name, type: 'section' });
      }
    });

    items.push({ id: '__activity', label: 'Actividad', type: 'activity' });
    items.push({ id: '__timeline', label: 'Timeline', type: 'activity' });

    return items;
  }, [company, sections, fields, widgets]);

  const defaultTab = tabItems.length > 0 ? tabItems[0].id : '__activity';

  return (
    <div className="container max-w-4xl py-6 animate-fade-in">
      <Button variant="ghost" size="sm" onClick={onBack} className="mb-4 gap-1.5 text-muted-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Volver al CRM
      </Button>

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          {company.logo ? (
            <img src={company.logo} alt="" className="h-20 w-20 rounded-xl border border-border/40 bg-white object-contain p-1.5" />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-xl bg-secondary text-2xl font-bold text-secondary-foreground">
              {company.tradeName.charAt(0)}
            </div>
          )}
          <div>
            <h1 className="text-2xl font-bold">{company.tradeName}</h1>
            <p className="text-sm text-muted-foreground">{company.legalName}</p>
            <p className="font-mono text-xs text-muted-foreground">{company.nit}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Badge variant="outline" className="text-xs">{company.category}</Badge>
              <Badge variant="secondary" className="text-xs">{company.vertical}</Badge>
              {company.economicActivity && <Badge variant="outline" className="text-xs">{company.economicActivity}</Badge>}
              <Badge variant="secondary" className="text-xs">{company.city}</Badge>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => setQuickAction('action')}>
            <MousePointerClick className="h-3.5 w-3.5" /> Toques
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => setQuickAction('task')}>
            <CheckSquare className="h-3.5 w-3.5" /> Tarea
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => setQuickAction('milestone')}>
            <Flag className="h-3.5 w-3.5" /> Hito
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => setPipelineOpen(true)}>
            <GitBranch className="h-3.5 w-3.5" /> Pipeline
          </Button>
          <Button size="sm" className="gap-1.5 text-xs" onClick={() => setEditOpen(true)}>
            <Pencil className="h-3.5 w-3.5" /> Editar
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => setExportOpen(true)}>
            <FileDown className="h-3.5 w-3.5" /> PDF
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5 text-xs text-destructive hover:text-destructive" onClick={handleDelete}>
            <Trash2 className="h-3.5 w-3.5" /> Eliminar
          </Button>
        </div>
      </div>

      {company.description && <p className="mt-4 text-sm text-muted-foreground">{company.description}</p>}
      {company.website && (
        <div className="mt-2">
          <a href={company.website.startsWith('http') ? company.website : `https://${company.website}`} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs"><Globe className="h-3.5 w-3.5" /> Visitar página web</Button>
          </a>
        </div>
      )}

      <Separator className="my-6" />

      {/* Metrics — fixed section, now includes Tipo de Cliente */}
      <div className={cn('grid gap-3', tipoClienteValue ? 'grid-cols-2 sm:grid-cols-5' : 'grid-cols-2 sm:grid-cols-4')}>
        <MetricCard label={lastSales ? `Ventas ${lastSales.year} (${viewCurrency})` : `Ventas (${viewCurrency})`} value={lastSales ? formatSales(convert(lastSales.value), viewCurrency) : '—'} />
        <MetricCard label="Avg YoY" value={formatPercentage(avgYoY)} positive={avgYoY !== null ? avgYoY > 0 : null} />
        <MetricCard label="Último YoY" value={formatPercentage(lastYoY)} positive={lastYoY !== null ? lastYoY > 0 : null} />
        <MetricCard label="Exportaciones" value={company.exportsUSD > 0 ? formatUSD(company.exportsUSD) : '—'} />
        {tipoClienteValue && <MetricCard label="Tipo de Cliente" value={tipoClienteValue} />}
      </div>

      {/* Currency toggle with TRM info */}
      <div className="flex justify-end mt-1 gap-2 items-center">
        <span className="text-[10px] text-muted-foreground">TRM: ${trm.toLocaleString('es-CO')}</span>
        <button onClick={() => setViewCurrency(prev => prev === 'COP' ? 'USD' : 'COP')} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
          Ver en <Badge variant="outline" className="text-[9px] px-1 py-0 ml-1 cursor-pointer">{viewCurrency === 'COP' ? 'USD' : 'COP'}</Badge>
        </button>
      </div>

      <Separator className="my-6" />

      {/* Contacts — fixed section */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Contactos</h2>
        {company.contacts.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin contactos registrados</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {company.contacts.map(c => (
              <div key={c.id} className="flex items-start gap-3 rounded-lg border border-border/50 p-3">
                <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full', c.isPrimary ? 'bg-gold-light' : 'bg-secondary')}>
                  {c.isPrimary ? <Star className="h-4 w-4 text-gold" /> : <User className="h-4 w-4 text-muted-foreground" />}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium">{c.name || c.email || 'Sin nombre'}</p>
                  <p className="text-xs text-muted-foreground">
                    {c.position}
                    {c.gender && GENDER_LABELS[c.gender] ? ` · ${GENDER_LABELS[c.gender]}` : ''}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
                    {c.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{c.email}</span>}
                    {c.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{c.phone}</span>}
                  </div>
                  {c.notes && <p className="mt-1 text-xs text-muted-foreground italic">{c.notes}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <Separator className="my-6" />

      {/* Sales by year — fixed section */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Métricas por año</h2>
        <SalesChart salesByYear={company.salesByYear} currency={viewCurrency} sourceCurrency={companyCurrency} trm={trm} />
        {salesYears.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin datos de ventas</p>
        ) : (
          <div className="rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Año</TableHead>
                  <TableHead className="text-xs">Ventas ({viewCurrency})</TableHead>
                  <TableHead className="text-xs">Crecimiento YoY</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {salesYears.map((year, i) => {
                  let yoy: number | null = null;
                  if (i > 0) {
                    const prev = company.salesByYear[salesYears[i - 1]];
                    if (prev > 0) yoy = ((company.salesByYear[year] - prev) / prev) * 100;
                  }
                  return (
                    <TableRow key={year}>
                      <TableCell className="text-sm font-medium">{year}</TableCell>
                      <TableCell className="text-sm">{formatSales(convert(company.salesByYear[year]), viewCurrency)}</TableCell>
                      <TableCell className={cn('text-sm font-medium', yoy !== null ? (yoy > 0 ? 'text-success' : 'text-destructive') : 'text-muted-foreground')}>
                        {yoy !== null ? formatPercentage(yoy) : '—'}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <Separator className="my-6" />

      {/* Tabbed sections */}
      {tabItems.length > 0 && (
        <Tabs defaultValue={defaultTab} className="w-full">
          <TabsList className="mb-4 flex flex-wrap h-auto gap-1">
            {tabItems.map(tab => (
              <TabsTrigger key={tab.id} value={tab.id} className="text-xs">
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {tabItems.map(tab => (
            <TabsContent key={tab.id} value={tab.id}>
              {tab.type === 'section' && tab.id === '__unsectioned' && (
                <UnsectionedFieldsTab
                  company={company}
                  fields={fields.filter(f => !f.sectionId && f.id !== tipoClienteField?.id)}
                  getFieldValueDisplay={getFieldValueDisplay}
                />
              )}
              {tab.type === 'section' && tab.id !== '__unsectioned' && (
                <SectionFieldsTab
                  company={company}
                  sectionFields={fields.filter(f => f.sectionId === tab.id)}
                  sectionWidgets={widgets.filter(w => w.sectionId === tab.id).sort((a, b) => a.displayOrder - b.displayOrder)}
                  allFields={fields}
                  viewCurrency={viewCurrency}
                  getFieldValueDisplay={getFieldValueDisplay}
                />
              )}
              {tab.type === 'activity' && tab.id === '__activity' && (
                <ActivityTimeline company={company} />
              )}
              {tab.type === 'activity' && tab.id === '__timeline' && (
                <CompanyTimeline companyId={company.id} />
              )}
            </TabsContent>
          ))}
        </Tabs>
      )}

      <QuickActionDialog type={quickAction} companyId={company.id} onClose={() => setQuickAction(null)} />
      <CompanyForm open={editOpen} onClose={() => setEditOpen(false)} company={company} />
      <AddToPipelineDialog open={pipelineOpen} onClose={() => setPipelineOpen(false)} companyId={company.id} companyName={company.tradeName} />
      <ProfileExportDialog open={exportOpen} onClose={() => setExportOpen(false)} company={company} defaultCurrency={viewCurrency} />
    </div>
  );
}

function MetricCard({ label, value, positive }: { label: string; value: string; positive?: boolean | null }) {
  return (
    <div className="rounded-lg border border-border/50 bg-card p-3">
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn('mt-1 text-lg font-bold', positive === true && 'text-success', positive === false && 'text-destructive')}>
        {value}
      </p>
    </div>
  );
}

function UnsectionedFieldsTab({ fields, getFieldValueDisplay }: { company: Company; fields: any[]; getFieldValueDisplay: (id: string) => string | null }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {fields.map(f => {
        const display = getFieldValueDisplay(f.id);
        if (!display) return null;
        return (
          <div key={f.id} className="rounded-lg border border-border/50 p-3">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{f.name}</p>
            <p className="mt-1 text-sm font-medium">{display}</p>
          </div>
        );
      })}
    </div>
  );
}

function SectionFieldsTab({ company, sectionFields, sectionWidgets, allFields, viewCurrency }: { company: Company; sectionFields: any[]; sectionWidgets: any[]; allFields: any[]; viewCurrency: string; getFieldValueDisplay: (id: string) => string | null }) {
  const sectionId = sectionFields[0]?.sectionId || sectionWidgets[0]?.sectionId || null;
  const { config: gridConfig } = useWidgetGridConfig(sectionId);

  // Auto-generate virtual widgets for fields not already covered by configured widgets
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

  const allWidgets = [...sectionWidgets, ...virtualWidgets];

  if (allWidgets.length === 0) {
    return <p className="text-xs text-muted-foreground">Sin widgets ni campos en esta sección.</p>;
  }

  const gridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: `repeat(${gridConfig.cols}, 1fr)`,
    gridAutoRows: `${gridConfig.rowH}px`,
    gridAutoFlow: 'dense',
    gap: '0.75rem',
  };

  return (
    <div style={gridStyle}>
      {allWidgets.map(w => (
        <SectionWidgetRenderer key={w.id} widget={w as any} company={company} fields={allFields} viewCurrency={viewCurrency} gridCols={gridConfig.cols} />
      ))}
    </div>
  );
}
