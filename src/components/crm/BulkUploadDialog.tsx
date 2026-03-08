import { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { Company, VERTICALS, CITIES } from '@/types/crm';
import { useCRM } from '@/contexts/CRMContext';
import { useCustomFields } from '@/contexts/CustomFieldsContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Download, Upload, AlertTriangle, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { showError } from '@/lib/toast';

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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [step, setStep] = useState<'upload' | 'preview' | 'loading' | 'done'>('upload');
  const [uploadResults, setUploadResults] = useState({ success: 0, failed: 0 });

  const existingNits = new Set(companies.map(c => c.nit.trim()).filter(n => n && n !== '0'));

  const simpleFields = fields.filter(f => f.fieldType !== 'metric_by_year');
  const metricFields = fields.filter(f => f.fieldType === 'metric_by_year');

  // Build dynamic columns: simple fields + metric fields expanded by year
  const dynamicColumns: { label: string; fieldId: string; year?: number }[] = [];
  simpleFields.forEach(f => dynamicColumns.push({ label: f.name, fieldId: f.id }));
  metricFields.forEach(f => {
    METRIC_YEARS.forEach(y => dynamicColumns.push({ label: `${f.name} ${y}`, fieldId: f.id, year: y }));
  });

  const TEMPLATE_COLUMNS = [...BASE_COLUMNS, ...dynamicColumns.map(c => c.label)];

  const downloadTemplate = () => {
    const wb = XLSX.utils.book_new();
    const exampleRow = [
      'Ejemplo SAS', 'Ejemplo Sociedad SAS', '900123456', 'Startup',
      'FinTech', 'Desarrollo de software', 'Empresa ejemplo', 'Cali',
      'https://www.ejemplo.com', 0,
      ...METRIC_YEARS.map(() => 0),
      'Juan Pérez', 'Gerente', 'juan@ejemplo.com', '3001234567',
      ...dynamicColumns.map(c => {
        const field = fields.find(f => f.id === c.fieldId);
        if (!field) return '';
        if (field.fieldType === 'select') return field.options[0] || '';
        if (field.fieldType === 'number' || field.fieldType === 'metric_by_year') return 0;
        return '';
      }),
    ];
    const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_COLUMNS, exampleRow]);
    ws['!cols'] = TEMPLATE_COLUMNS.map(() => ({ wch: 20 }));
    XLSX.utils.book_append_sheet(wb, ws, 'Empresas');
    XLSX.writeFile(wb, 'plantilla_empresas.xlsx');
  };

  const parseFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target?.result, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json<any>(ws, { header: 1 });

        if (data.length < 2) { showError('El archivo no tiene datos'); return; }

        const parsed: ParsedRow[] = [];
        const seenNits = new Set<string>();

        // Index where sales years start (after first 10 base cols)
        const salesStartIdx = 10;
        const contactStartIdx = salesStartIdx + METRIC_YEARS.length;
        const dynamicStartIdx = contactStartIdx + 4; // 4 contact columns

        for (let i = 1; i < data.length; i++) {
          const r = data[i] as any[];
          if (!r || r.length === 0 || !r[0]) continue;

          const errors: string[] = [];
          const tradeName = String(r[0] || '').trim();
          const nit = String(r[2] || '').trim();
          const category = String(r[3] || '').trim();

          if (!tradeName) errors.push('Nombre comercial requerido');
          if (category && !['EBT', 'Startup'].includes(category)) errors.push('Categoría inválida');

          const hasValidNit = nit && nit !== '0';
          const isDuplicate = hasValidNit && (existingNits.has(nit) || seenNits.has(nit));
          if (isDuplicate) errors.push('NIT duplicado');
          if (hasValidNit) seenNits.add(nit);

          // Parse sales by year
          const salesByYear: Record<number, number> = {};
          METRIC_YEARS.forEach((y, idx) => {
            const val = Number(r[salesStartIdx + idx]) || 0;
            if (val) salesByYear[y] = val;
          });

          // Parse custom field values
          const customFieldValues: Record<string, string> = {};
          const metricFieldValues: Record<string, Record<number, number>> = {};

          dynamicColumns.forEach((col, idx) => {
            const colIdx = dynamicStartIdx + idx;
            const rawVal = String(r[colIdx] || '').trim();
            if (!rawVal) return;

            if (col.year !== undefined) {
              // metric_by_year
              if (!metricFieldValues[col.fieldId]) metricFieldValues[col.fieldId] = {};
              const num = Number(rawVal) || 0;
              if (num) metricFieldValues[col.fieldId][col.year] = num;
            } else {
              customFieldValues[col.fieldId] = rawVal;
            }
          });

          parsed.push({
            tradeName,
            legalName: String(r[1] || '').trim(),
            nit,
            category: ['EBT', 'Startup'].includes(category) ? category : 'Startup',
            vertical: String(r[4] || '').trim(),
            economicActivity: String(r[5] || '').trim(),
            description: String(r[6] || '').trim(),
            city: String(r[7] || '').trim(),
            website: String(r[8] || '').trim(),
            exportsUSD: Number(r[9]) || 0,
            salesByYear,
            contactName: String(r[contactStartIdx] || '').trim(),
            contactPosition: String(r[contactStartIdx + 1] || '').trim(),
            contactEmail: String(r[contactStartIdx + 2] || '').trim(),
            contactPhone: String(r[contactStartIdx + 3] || '').trim(),
            customFieldValues,
            metricFieldValues,
            errors,
            isDuplicate,
          });
        }

        setRows(parsed);
        setStep('preview');
      } catch {
        toast.error('Error al leer el archivo');
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
          category: r.category as 'EBT' | 'Startup',
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
          createdAt: new Date().toISOString().split('T')[0],
        };
        const newId = await addCompany(company);
        if (!newId) { failed++; continue; }

        // Save contact if provided
        if (r.contactName) {
          await addContact(newId, {
            id: crypto.randomUUID(),
            name: r.contactName,
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

  const reset = () => { setRows([]); setStep('upload'); setUploadResults({ success: 0, failed: 0 }); };
  const handleClose = () => { reset(); onClose(); };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl p-0 gap-0 max-h-[90vh] overflow-hidden">
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle>Carga masiva de empresas</DialogTitle>
        </DialogHeader>

        {step === 'upload' && (
          <div className="p-6 space-y-6">
            <div className="text-center space-y-4">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                <Upload className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h3 className="text-sm font-semibold">Sube un archivo Excel con las empresas</h3>
                <p className="mt-1 text-xs text-muted-foreground">Primero descarga la plantilla, llénala con los datos y luego súbela aquí.</p>
                {(simpleFields.length > 0 || metricFields.length > 0) && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    La plantilla incluye {simpleFields.length + metricFields.length} campo(s) personalizado(s)
                    {metricFields.length > 0 && ` (${metricFields.length} métrica(s) por año)`}.
                  </p>
                )}
              </div>
            </div>
            <div className="flex justify-center gap-3">
              <Button variant="outline" size="sm" className="gap-1.5" onClick={downloadTemplate}>
                <Download className="h-3.5 w-3.5" /> Descargar plantilla
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
            <div className="px-6 pt-4 pb-2 flex items-center gap-3">
              <Badge variant="outline" className="gap-1"><CheckCircle2 className="h-3 w-3 text-success" /> {validRows.length} válidas</Badge>
              {invalidRows.length > 0 && <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" /> {invalidRows.length} con errores</Badge>}
              <span className="text-xs text-muted-foreground">de {rows.length} filas</span>
            </div>
            <ScrollArea className="max-h-[calc(90vh-220px)] px-6">
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
            <div className="flex justify-between gap-2 border-t border-border px-6 py-3">
              <Button variant="outline" size="sm" onClick={reset}>Volver</Button>
              <Button size="sm" onClick={handleUpload} disabled={validRows.length === 0} className="gap-1.5">Cargar {validRows.length} empresas</Button>
            </div>
          </>
        )}

        {step === 'loading' && (
          <div className="flex flex-col items-center justify-center p-12 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Cargando empresas...</p>
          </div>
        )}

        {step === 'done' && (
          <div className="p-6 text-center space-y-4">
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
