import { useState } from 'react';
import { Company, GENDER_LABELS, FIELD_TYPE_LABELS } from '@/types/crm';
import { calculateGrowth, formatCOP, formatPercentage, formatUSD, getLastYearSales } from '@/lib/calculations';
import { useCRM } from '@/contexts/CRMContext';
import { showSuccess } from '@/lib/toast';
import { useCustomFields } from '@/contexts/CustomFieldsContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, Phone, CheckSquare, Flag, Pencil, Mail, User, Star, Globe, Trash2 } from 'lucide-react';
import ActivityTimeline from './ActivityTimeline';
import QuickActionDialog from './QuickActionDialog';
import CompanyForm from './CompanyForm';
import { cn } from '@/lib/utils';

interface Props {
  company: Company;
  onBack: () => void;
}

export default function CompanyProfile({ company, onBack }: Props) {
  const [quickAction, setQuickAction] = useState<'action' | 'task' | 'milestone' | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const { sections, fields } = useCustomFields();
  const { deleteCompany } = useCRM();

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
  const primaryContact = company.contacts.find(c => c.isPrimary);

  const getFieldValueDisplay = (fieldId: string) => {
    const val = (company.fieldValues || []).find(v => v.fieldId === fieldId);
    if (!val) return null;
    const field = fields.find(f => f.id === fieldId);
    if (!field) return null;
    if (field.fieldType === 'metric_by_year') {
      const entries = Object.entries(val.yearValues || {}).filter(([_, v]) => v > 0);
      if (entries.length === 0) return null;
      return entries.sort(([a], [b]) => Number(a) - Number(b)).map(([y, v]) => `${y}: ${formatCOP(v)}`).join(' · ');
    }
    if (field.fieldType === 'number') return val.numberValue !== null ? String(val.numberValue) : null;
    return val.textValue || null;
  };

  return (
    <div className="container max-w-4xl py-6 animate-fade-in">
      <Button variant="ghost" size="sm" onClick={onBack} className="mb-4 gap-1.5 text-muted-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Volver al CRM
      </Button>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          {company.logo ? (
            <img src={company.logo} alt="" className="h-20 w-20 rounded-xl border border-border/40 bg-white object-contain p-1.5" />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-xl bg-secondary text-2xl font-bold text-muted-foreground">
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
            <Phone className="h-3.5 w-3.5" /> Acción
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => setQuickAction('task')}>
            <CheckSquare className="h-3.5 w-3.5" /> Tarea
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => setQuickAction('milestone')}>
            <Flag className="h-3.5 w-3.5" /> Hito
          </Button>
          <Button size="sm" className="gap-1.5 text-xs" onClick={() => setEditOpen(true)}>
            <Pencil className="h-3.5 w-3.5" /> Editar
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

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label={lastSales ? `Ventas ${lastSales.year} (COP)` : 'Ventas (COP)'} value={lastSales ? formatCOP(lastSales.value) : '—'} />
        <MetricCard label="Avg YoY" value={formatPercentage(avgYoY)} positive={avgYoY !== null ? avgYoY > 0 : null} />
        <MetricCard label="Último YoY" value={formatPercentage(lastYoY)} positive={lastYoY !== null ? lastYoY > 0 : null} />
        <MetricCard label="Exportaciones" value={company.exportsUSD > 0 ? formatUSD(company.exportsUSD) : '—'} />
      </div>

      <Separator className="my-6" />

      {/* Contacts */}
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
                  <p className="text-sm font-medium">{c.name}</p>
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

      {/* Metrics by year */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Métricas por año</h2>
        {salesYears.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin datos de ventas</p>
        ) : (
          <div className="rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Año</TableHead>
                  <TableHead className="text-xs">Ventas (COP)</TableHead>
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
                      <TableCell className="text-sm">{formatCOP(company.salesByYear[year])}</TableCell>
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

      {/* Custom sections & fields */}
      {(() => {
        const unsectionedFields = fields.filter(f => !f.sectionId);
        const hasUnsectioned = unsectionedFields.some(f => getFieldValueDisplay(f.id));
        const sectionsWithData = sections.filter(s => fields.filter(f => f.sectionId === s.id).some(f => getFieldValueDisplay(f.id)));

        if (!hasUnsectioned && sectionsWithData.length === 0) return null;

        return (
          <>
            {hasUnsectioned && (
              <>
                <Separator className="my-6" />
                <section>
                  <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Campos personalizados</h2>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {unsectionedFields.map(f => {
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
                </section>
              </>
            )}

            {sectionsWithData.map(section => (
              <div key={section.id}>
                <Separator className="my-6" />
                <section>
                  <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">{section.name}</h2>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {fields.filter(f => f.sectionId === section.id).map(f => {
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
                </section>
              </div>
            ))}
          </>
        );
      })()}

      <Separator className="my-6" />

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Actividad</h2>
        <ActivityTimeline company={company} />
      </section>

      <QuickActionDialog type={quickAction} companyId={company.id} onClose={() => setQuickAction(null)} />
      <CompanyForm open={editOpen} onClose={() => setEditOpen(false)} company={company} />
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
