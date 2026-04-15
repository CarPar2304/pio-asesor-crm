import { useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { Company } from '@/types/crm';
import { useCRM } from '@/contexts/CRMContext';
import { useCustomFields } from '@/contexts/CustomFieldsContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Download, Upload, AlertTriangle, CheckCircle2, XCircle, Loader2, Search, ArrowLeft, FileSpreadsheet } from 'lucide-react';
import { showError } from '@/lib/toast';
import { FieldOption, useAvailableFields } from './FieldSelectorDialog';

interface Props {
  open: boolean;
  onClose: () => void;
}

const METRIC_YEARS = [2020, 2021, 2022, 2023, 2024, 2025, 2026];

interface ParsedRow {
  tradeName: string;
  legalName: string;
  nit: string;
  category: string;
  vertical: string;
  economicActivity: string;
  description: string;
  city: string;
  exportsUSD: number;
  website: string;
  salesByYear: Record<number, number>;
  // contact
  contactName: string;
  contactPosition: string;
  contactEmail: string;
  contactPhone: string;
  customFieldValues: Record<string, string>;
  metricFieldValues: Record<string, Record<number, number>>; // fieldId -> {year -> value}
  errors: string[];
  isDuplicate: boolean;
}

const BASE_COLUMNS = [
  'Nombre Comercial', 'Razón Social', 'NIT', 'Categoría (EBT/Startup)',
  'Vertical', 'Sub-vertical', 'Descripción', 'Ciudad',
  'Página Web', 'Exportaciones USD',
  ...METRIC_YEARS.map(y => `Ventas ${y}`),
  'Contacto Nombre', 'Contacto Cargo', 'Contacto Email', 'Contacto Teléfono',
];

export default function BulkUploadDialog({ open, onClose }: Props) {
  const { companies, addCompany, addContact, saveFieldValues } = useCRM();
  const { fields } = useCustomFields();
  const allFields = useAvailableFields();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [step, setStep] = useState<'select-fields' | 'upload' | 'preview' | 'loading' | 'done'>('select-fields');
  const [uploadResults, setUploadResults] = useState({ success: 0, failed: 0 });
  const [selectedFieldIds, setSelectedFieldIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');

  const existingNits = new Set(companies.map(c => c.nit.trim()).filter(n => n && n !== '0'));

  const groups = useMemo(() => {
    const map = new Map<string, FieldOption[]>();
    const normalizedSearch = search.toLowerCase();

    allFields.forEach((field) => {
      if (field.id === 'tradeName' || field.id === 'nit') return;
      if (normalizedSearch && !field.label.toLowerCase().includes(normalizedSearch) && !field.group.toLowerCase().includes(normalizedSearch)) {
        return;
      }

      const list = map.get(field.group) || [];
      list.push(field);
      map.set(field.group, list);
    });

    return map;
  }, [allFields, search]);

  const selectedFields = useMemo(
    () => allFields.filter((field) => selectedFieldIds.has(field.id)),
    [allFields, selectedFieldIds],
  );

  const toggle = (id: string) => {
    setSelectedFieldIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleGroup = (group: string) => {
    const groupFields = groups.get(group) || [];
    const allSelected = groupFields.every((field) => selectedFieldIds.has(field.id));

    setSelectedFieldIds((prev) => {
      const next = new Set(prev);
      groupFields.forEach((field) => {
        if (allSelected) next.delete(field.id);
        else next.add(field.id);
      });
      return next;
    });
  };

  const getTemplateExampleValue = (field: FieldOption) => {
    switch (field.id) {
      case 'legalName':
        return 'Ejemplo Sociedad SAS';
      case 'category':
        return 'Startup';
      case 'vertical':
        return 'FinTech';
      case 'economicActivity':
        return 'Desarrollo de software';
      case 'description':
        return 'Empresa ejemplo';
      case 'city':
        return 'Cali';
      case 'website':
        return 'https://www.ejemplo.com';
      case 'exportsUSD':
        return 0;
      case 'contactName':
        return 'Juan Pérez';
      case 'contactPosition':
        return 'Gerente';
      case 'contactEmail':
        return 'juan@ejemplo.com';
      case 'contactPhone':
        return '3001234567';
      case 'contactGender':
        return '';
      default: {
        if (field.type === 'sales_year') return 0;
        if (field.type === 'custom' && field.fieldId) {
          const fieldDef = fields.find((item) => item.id === field.fieldId);
          if (!fieldDef) return '';
          if (field.year || fieldDef.fieldType === 'number') return 0;
          if (fieldDef.fieldType === 'select' && Array.isArray(fieldDef.options)) {
            return fieldDef.options[0] || '';
          }
        }
        return '';
      }
    }
  };

  const downloadTemplate = () => {
    const wb = XLSX.utils.book_new();
    const headers = ['Nombre comercial *', 'NIT', ...selectedFields.map((field) => field.label)];
    const exampleRow = ['Ejemplo SAS', '900123456', ...selectedFields.map((field) => getTemplateExampleValue(field))];
    const ws = XLSX.utils.aoa_to_sheet([headers, exampleRow]);
    ws['!cols'] = headers.map(() => ({ wch: 22 }));
    XLSX.utils.book_append_sheet(wb, ws, 'Empresas');
    XLSX.writeFile(wb, 'plantilla_empresas.xlsx');
    setStep('upload');
  };

  const parseFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target?.result, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json<any>(ws, { header: 1 });

        if (data.length < 2) { showError('El archivo no tiene datos'); return; }

        const headers = (data[0] as any[]).map((value) => String(value || '').trim());
        const getColumnIndex = (header: string) => headers.findIndex((value) => value === header);
        const tradeNameIndex = getColumnIndex('Nombre comercial *');
        const nitIndex = getColumnIndex('NIT');

        if (tradeNameIndex === -1) {
          showError('La plantilla debe incluir la columna "Nombre comercial *"');
          return;
        }

        const parsed: ParsedRow[] = [];
        const seenNits = new Set<string>();

        for (let i = 1; i < data.length; i++) {
          const r = data[i] as any[];
          if (!r || r.length === 0) continue;

          const errors: string[] = [];
          const tradeName = String(r[tradeNameIndex] || '').trim();
          const nit = nitIndex >= 0 ? String(r[nitIndex] || '').trim() : '';

          if (!tradeName && !nit) continue;

          if (!tradeName) errors.push('Nombre comercial requerido');

          const hasValidNit = nit && nit !== '0';
          const isDuplicate = hasValidNit && (existingNits.has(nit) || seenNits.has(nit));
          if (isDuplicate) errors.push('NIT duplicado');
          if (hasValidNit) seenNits.add(nit);

          const salesByYear: Record<number, number> = {};
          const customFieldValues: Record<string, string> = {};
          const metricFieldValues: Record<string, Record<number, number>> = {};

          selectedFields.forEach((field) => {
            const colIdx = getColumnIndex(field.label);
            if (colIdx === -1) return;

            const rawValue = r[colIdx];
            if (rawValue === undefined || rawValue === null || rawValue === '') return;

            const value = typeof rawValue === 'string' ? rawValue.trim() : rawValue;

            switch (field.id) {
              case 'legalName':
              case 'category':
              case 'vertical':
              case 'economicActivity':
              case 'description':
              case 'city':
              case 'website':
              case 'contactName':
              case 'contactPosition':
              case 'contactPhone':
              case 'contactGender':
                break;
              case 'contactEmail': {
                const email = String(value).trim();
                if (email) {
                  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                  if (!emailRegex.test(email)) errors.push(`Email inválido: ${email}`);
                }
                break;
              }
            }

            if (field.type === 'sales_year' && field.year) {
              salesByYear[field.year] = Number(value) || 0;
              return;
            }

            if (field.type === 'custom' && field.fieldId) {
              if (field.year) {
                if (!metricFieldValues[field.fieldId]) metricFieldValues[field.fieldId] = {};
                metricFieldValues[field.fieldId][field.year] = Number(value) || 0;
              } else {
                customFieldValues[field.fieldId] = String(value).trim();
              }
              return;
            }

            if (field.id === 'contactEmail') return;

            if (field.id === 'exportsUSD') {
              return;
            }
          });

          parsed.push({
            tradeName,
            legalName: String(r[getColumnIndex('Razón social')] || '').trim(),
            nit,
            category: String(r[getColumnIndex('Categoría')] || '').trim(),
            vertical: String(r[getColumnIndex('Vertical')] || '').trim(),
            economicActivity: String(r[getColumnIndex('Sub-vertical')] || '').trim(),
            description: String(r[getColumnIndex('Descripción')] || '').trim(),
            city: String(r[getColumnIndex('Ciudad')] || '').trim(),
            website: String(r[getColumnIndex('Sitio web')] || '').trim(),
            exportsUSD: Number(r[getColumnIndex('Exportaciones USD')]) || 0,
            salesByYear,
            contactName: String(r[getColumnIndex('Nombre contacto')] || '').trim(),
            contactPosition: String(r[getColumnIndex('Cargo contacto')] || '').trim(),
            contactEmail: String(r[getColumnIndex('Email contacto')] || '').trim(),
            contactPhone: String(r[getColumnIndex('Teléfono contacto')] || '').trim(),
            customFieldValues,
            metricFieldValues,
            errors,
            isDuplicate,
          });
        }

        setRows(parsed);
        setStep('preview');
      } catch {
        showError('Error al leer el archivo');
      }
    };
    reader.readAsBinaryString(file);
  };

  const validRows = rows.filter(r => r.errors.length === 0);
  const invalidRows = rows.filter(r => r.errors.length > 0);

  const handleUpload = async () => {
    setStep('loading');
    let success = 0;
    let failed = 0;

    for (const r of validRows) {
      try {
        const company: Company = {
          id: crypto.randomUUID(),
          tradeName: r.tradeName,
          legalName: r.legalName,
          nit: r.nit,
          category: r.category,
          vertical: r.vertical,
          economicActivity: r.economicActivity,
          description: r.description,
          city: r.city,
          website: r.website,
          salesByYear: r.salesByYear,
          exportsUSD: r.exportsUSD,
          contacts: [],
          actions: [],
          milestones: [],
          tasks: [],
          customProperties: [],
          fieldValues: [],
          salesCurrency: 'COP',
          createdAt: new Date().toISOString().split('T')[0],
        };
        const newId = await addCompany(company);
        if (!newId) { failed++; continue; }

        // Save contact if any contact data provided
        if (r.contactName || r.contactEmail || r.contactPhone) {
          await addContact(newId, {
            id: crypto.randomUUID(),
            name: r.contactName || r.contactEmail || 'Sin nombre',
            position: r.contactPosition,
            email: r.contactEmail,
            phone: r.contactPhone,
            notes: '',
            isPrimary: true,
            gender: '',
          });
        }

        // Save custom field values (simple + metric)
        const hasSimple = Object.keys(r.customFieldValues).length > 0;
        const hasMetric = Object.keys(r.metricFieldValues).length > 0;
        if (hasSimple || hasMetric) {
          const values = [
            ...Object.entries(r.customFieldValues).map(([fieldId, val]) => {
              const field = fields.find(f => f.id === fieldId);
              return {
                id: '', companyId: newId, fieldId,
                textValue: field?.fieldType === 'number' ? '' : val,
                numberValue: field?.fieldType === 'number' ? Number(val) || null : null,
                yearValues: {},
              };
            }),
            ...Object.entries(r.metricFieldValues).map(([fieldId, yearVals]) => ({
              id: '', companyId: newId, fieldId,
              textValue: '',
              numberValue: null,
              yearValues: yearVals,
            })),
          ];
          await saveFieldValues(newId, values);
        }

        success++;
      } catch {
        failed++;
      }
    }

    setUploadResults({ success, failed });
    setStep('done');
  };

  const reset = () => {
    setRows([]);
    setStep('select-fields');
    setUploadResults({ success: 0, failed: 0 });
    setSelectedFieldIds(new Set());
    setSearch('');
  };
  const handleClose = () => { reset(); onClose(); };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl h-[min(90vh,52rem)] overflow-hidden p-0 gap-0 flex flex-col">
        <DialogHeader className="border-b border-border px-6 py-4 shrink-0">
          <DialogTitle>Carga masiva de empresas</DialogTitle>
        </DialogHeader>

        {step === 'select-fields' && (
          <>
            <div className="px-6 pt-4 pb-2 space-y-3 shrink-0">
              <div className="text-center space-y-2">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                  <FileSpreadsheet className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold">Elige qué campos incluir en la plantilla</h3>
                  <p className="text-xs text-muted-foreground mt-1">Nombre comercial y NIT siempre vienen incluidos. Selecciona el resto de datos que quieres completar en la carga masiva.</p>
                </div>
              </div>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input placeholder="Buscar campos..." value={search} onChange={e => setSearch(e.target.value)} className="h-9 pl-8 text-sm" />
              </div>
              <Badge variant="secondary" className="text-xs">{selectedFieldIds.size} campos seleccionados</Badge>
            </div>

            <ScrollArea className="flex-1 min-h-0">
              <div className="px-6 pb-4 space-y-3">
                {Array.from(groups.entries()).map(([group, fieldsList]) => {
                  const allSelected = fieldsList.every(f => selectedFieldIds.has(f.id));
                  const someSelected = fieldsList.some(f => selectedFieldIds.has(f.id));

                  return (
                    <div key={group}>
                      <button type="button" className="flex items-center gap-2 mb-1.5" onClick={() => toggleGroup(group)}>
                        <Checkbox checked={allSelected ? true : someSelected ? 'indeterminate' : false} className="pointer-events-none" />
                        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{group}</span>
                        <Badge variant="outline" className="text-[10px] h-4 px-1.5">{fieldsList.filter(f => selectedFieldIds.has(f.id)).length}/{fieldsList.length}</Badge>
                      </button>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 pl-6">
                        {fieldsList.map(field => (
                          <label key={field.id} className="flex items-center gap-2 py-1 cursor-pointer hover:bg-accent/50 rounded px-1.5 -mx-1.5 transition-colors">
                            <Checkbox checked={selectedFieldIds.has(field.id)} onCheckedChange={() => toggle(field.id)} />
                            <span className="text-sm truncate">{field.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>

            <div className="border-t border-border px-6 py-3 flex justify-between shrink-0">
              <Button variant="outline" size="sm" onClick={handleClose}>Cancelar</Button>
              <Button size="sm" onClick={downloadTemplate} disabled={selectedFieldIds.size === 0} className="gap-1.5">
                <Download className="h-3.5 w-3.5" /> Descargar plantilla ({selectedFieldIds.size})
              </Button>
            </div>
          </>
        )}

        {step === 'upload' && (
          <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-6">
            <div className="text-center space-y-4">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                <Upload className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h3 className="text-sm font-semibold">Sube un archivo Excel con las empresas</h3>
                <p className="mt-1 text-xs text-muted-foreground">Descarga la plantilla con tus campos seleccionados, complétala y luego súbela aquí.</p>
              </div>
            </div>
            <div className="flex justify-center gap-3">
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setStep('select-fields')}>
                <ArrowLeft className="h-3.5 w-3.5" /> Volver
              </Button>
              <Button size="sm" className="gap-1.5" onClick={() => fileInputRef.current?.click()}>
                <Upload className="h-3.5 w-3.5" /> Subir archivo
              </Button>
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e => { if (e.target.files?.[0]) parseFile(e.target.files[0]); }} />
            </div>
          </div>
        )}

        {step === 'preview' && (
          <>
            <div className="px-6 pt-4 pb-2 flex items-center gap-3 shrink-0">
              <Badge variant="outline" className="gap-1"><CheckCircle2 className="h-3 w-3 text-success" /> {validRows.length} válidas</Badge>
              {invalidRows.length > 0 && <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" /> {invalidRows.length} con errores</Badge>}
              <span className="text-xs text-muted-foreground">de {rows.length} filas</span>
            </div>
            <ScrollArea className="flex-1 min-h-0 px-6">
              <div className="space-y-1.5 pb-4">
                {rows.map((r, i) => (
                  <div key={i} className={`flex items-center gap-3 rounded-md border px-3 py-2 text-xs ${r.errors.length > 0 ? 'border-destructive/30 bg-destructive/5' : 'border-border/50'}`}>
                    <span className="w-6 shrink-0 text-muted-foreground font-mono">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <span className="font-medium">{r.tradeName || '—'}</span>
                      <span className="text-muted-foreground ml-2">{r.nit}</span>
                      <span className="text-muted-foreground ml-2">{r.category}</span>
                      <span className="text-muted-foreground ml-2">{r.vertical}</span>
                      {r.contactName && <span className="text-muted-foreground ml-2">👤 {r.contactName}</span>}
                    </div>
                    {r.errors.length > 0 ? (
                      <div className="flex items-center gap-1 text-destructive shrink-0">
                        <AlertTriangle className="h-3 w-3" /><span>{r.errors.join(', ')}</span>
                      </div>
                    ) : (
                      <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
            <div className="flex justify-between gap-2 border-t border-border px-6 py-3 shrink-0">
              <Button variant="outline" size="sm" onClick={reset}>Volver</Button>
              <Button size="sm" onClick={handleUpload} disabled={validRows.length === 0} className="gap-1.5">Cargar {validRows.length} empresas</Button>
            </div>
          </>
        )}

        {step === 'loading' && (
          <div className="flex-1 min-h-0 overflow-y-auto flex flex-col items-center justify-center p-12 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Cargando empresas...</p>
          </div>
        )}

        {step === 'done' && (
          <div className="flex-1 min-h-0 overflow-y-auto p-6 text-center space-y-4">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success/10">
              <CheckCircle2 className="h-6 w-6 text-success" />
            </div>
            <div>
              <h3 className="text-sm font-semibold">{uploadResults.success} empresas cargadas exitosamente</h3>
              {uploadResults.failed > 0 && <p className="text-xs text-destructive mt-1">{uploadResults.failed} fallaron</p>}
            </div>
            <Button size="sm" onClick={handleClose}>Cerrar</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
