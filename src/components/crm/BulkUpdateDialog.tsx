import { useState, useRef, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { useCRM } from '@/contexts/CRMContext';
import { useCustomFields } from '@/contexts/CustomFieldsContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Download, Upload, AlertTriangle, CheckCircle2, XCircle, Loader2, Search, ArrowLeft, FileSpreadsheet, Settings2, Key } from 'lucide-react';
import { showError, showSuccess } from '@/lib/toast';
import { FieldOption, useAvailableFields } from './FieldSelectorDialog';
import { Company } from '@/types/crm';

interface Props {
  open: boolean;
  onClose: () => void;
}

interface UpdateRow {
  matchKey: string;
  matchedCompany: Company | null;
  updates: Record<string, any>;
  errors: string[];
}

type MatchKeyType = 'nit' | 'tradeName' | 'legalName';

export default function BulkUpdateDialog({ open, onClose }: Props) {
  const { companies, updateCompany, saveFieldValues, refresh } = useCRM();
  const { fields } = useCustomFields();
  const allFields = useAvailableFields();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<'select-fields' | 'upload' | 'preview' | 'loading' | 'done'>('select-fields');
  const [selectedFieldIds, setSelectedFieldIds] = useState<Set<string>>(new Set());
  const [matchKey, setMatchKey] = useState<MatchKeyType>('nit');
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<UpdateRow[]>([]);
  const [results, setResults] = useState({ success: 0, failed: 0, skipped: 0 });

  const matchKeyLabels: Record<MatchKeyType, string> = {
    nit: 'NIT',
    tradeName: 'Nombre comercial',
    legalName: 'Razón social',
  };

  const groups = useMemo(() => {
    const map = new Map<string, FieldOption[]>();
    const s = search.toLowerCase();
    allFields.forEach(f => {
      // Only exclude the field used as match key
      if (f.id === matchKey) return;
      if (s && !f.label.toLowerCase().includes(s) && !f.group.toLowerCase().includes(s)) return;
      const list = map.get(f.group) || [];
      list.push(f);
      map.set(f.group, list);
    });
    return map;
  }, [allFields, search, matchKey]);

  const selectedFields = useMemo(() =>
    allFields.filter(f => selectedFieldIds.has(f.id)),
    [allFields, selectedFieldIds]
  );

  const toggle = (id: string) => {
    setSelectedFieldIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleGroup = (group: string) => {
    const groupFields = groups.get(group) || [];
    const allSelected = groupFields.every(f => selectedFieldIds.has(f.id));
    setSelectedFieldIds(prev => {
      const next = new Set(prev);
      groupFields.forEach(f => { if (allSelected) next.delete(f.id); else next.add(f.id); });
      return next;
    });
  };

  const downloadTemplate = () => {
    const wb = XLSX.utils.book_new();
    const headers = [matchKeyLabels[matchKey] + ' (identificador)', ...selectedFields.map(f => f.label)];

    // Empty template - only headers, no pre-filled data
    const ws = XLSX.utils.aoa_to_sheet([headers]);
    ws['!cols'] = headers.map(() => ({ wch: 22 }));

    XLSX.utils.book_append_sheet(wb, ws, 'Actualización');

    const instrWs = XLSX.utils.aoa_to_sheet([
      ['Instrucciones de actualización masiva'],
      [''],
      [`1. La primera columna (${matchKeyLabels[matchKey]}) se usará para identificar la empresa.`],
      ['2. Llena los datos que deseas actualizar en las columnas correspondientes.'],
      ['3. Deja vacías las celdas que no quieras modificar.'],
      ['4. Los campos de email se validarán automáticamente.'],
      ['5. Los campos numéricos deben contener solo números.'],
      ['6. No elimines ni renombres la columna de identificación.'],
    ]);
    instrWs['!cols'] = [{ wch: 80 }];
    XLSX.utils.book_append_sheet(wb, instrWs, 'Instrucciones');

    XLSX.writeFile(wb, 'plantilla_actualizacion.xlsx');
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

        const parsed: UpdateRow[] = [];

        for (let i = 1; i < data.length; i++) {
          const r = data[i] as any[];
          if (!r || r.length === 0) continue;

          const keyVal = String(r[0] || '').trim();
          if (!keyVal) continue;

          const errors: string[] = [];

          // Match company by selected key
          let matched: Company | null = null;
          if (matchKey === 'nit') {
            matched = companies.find(c => c.nit.trim() === keyVal) || null;
          } else if (matchKey === 'tradeName') {
            matched = companies.find(c => c.tradeName.toLowerCase() === keyVal.toLowerCase()) || null;
          } else {
            matched = companies.find(c => c.legalName.toLowerCase() === keyVal.toLowerCase()) || null;
          }

          if (!matched) {
            errors.push('Empresa no encontrada');
          }

          const updates: Record<string, any> = {};
          selectedFields.forEach((field, idx) => {
            const colIdx = idx + 1; // offset for match key column
            const rawVal = r[colIdx];
            if (rawVal === undefined || rawVal === null || rawVal === '') return;
            const val = String(rawVal).trim();

            if (field.id === 'contactEmail' && val) {
              const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
              if (!emailRegex.test(val)) {
                errors.push(`Email inválido: ${val}`);
              }
            }

            updates[field.id] = val;
          });

          parsed.push({ matchKey: keyVal, matchedCompany: matched, updates, errors });
        }

        setRows(parsed);
        setStep('preview');
      } catch {
        showError('Error al leer el archivo');
      }
    };
    reader.readAsBinaryString(file);
  };

  const validRows = rows.filter(r => r.errors.length === 0 && r.matchedCompany);
  const invalidRows = rows.filter(r => r.errors.length > 0 || !r.matchedCompany);

  const handleUpdate = async () => {
    setStep('loading');
    let success = 0, failed = 0, skipped = 0;

    for (const row of validRows) {
      if (!row.matchedCompany || Object.keys(row.updates).length === 0) { skipped++; continue; }
      try {
        const c = row.matchedCompany;
        const u = row.updates;

        const updatedCompany = { ...c };
        if (u.legalName !== undefined) updatedCompany.legalName = u.legalName;
        if (u.tradeName !== undefined) updatedCompany.tradeName = u.tradeName;
        if (u.category !== undefined) updatedCompany.category = u.category;
        if (u.vertical !== undefined) updatedCompany.vertical = u.vertical;
        if (u.economicActivity !== undefined) updatedCompany.economicActivity = u.economicActivity;
        if (u.description !== undefined) updatedCompany.description = u.description;
        if (u.city !== undefined) updatedCompany.city = u.city;
        if (u.website !== undefined) updatedCompany.website = u.website;
        if (u.exportsUSD !== undefined) updatedCompany.exportsUSD = Number(u.exportsUSD) || 0;
        if (u.nit !== undefined) updatedCompany.nit = u.nit;

        const salesUpdates: Record<number, number> = {};
        let hasSalesUpdate = false;
        selectedFields.forEach(f => {
          if (f.type === 'sales_year' && f.year && u[f.id] !== undefined) {
            salesUpdates[f.year] = Number(u[f.id]) || 0;
            hasSalesUpdate = true;
          }
        });
        if (hasSalesUpdate) {
          updatedCompany.salesByYear = { ...c.salesByYear, ...salesUpdates };
        }

        const contactKeys = ['contactName', 'contactPosition', 'contactEmail', 'contactPhone', 'contactGender'];
        const hasContactUpdate = contactKeys.some(k => u[k] !== undefined);
        if (hasContactUpdate) {
          const primaryIdx = updatedCompany.contacts.findIndex(ct => ct.isPrimary);
          const targetIdx = primaryIdx >= 0 ? primaryIdx : 0;
          if (updatedCompany.contacts.length > 0) {
            const ct = { ...updatedCompany.contacts[targetIdx] };
            if (u.contactName !== undefined) ct.name = u.contactName;
            if (u.contactPosition !== undefined) ct.position = u.contactPosition;
            if (u.contactEmail !== undefined) ct.email = u.contactEmail;
            if (u.contactPhone !== undefined) ct.phone = u.contactPhone;
            if (u.contactGender !== undefined) ct.gender = u.contactGender;
            updatedCompany.contacts = [...updatedCompany.contacts];
            updatedCompany.contacts[targetIdx] = ct;
          } else {
            updatedCompany.contacts = [{
              id: crypto.randomUUID(),
              name: u.contactName || '', position: u.contactPosition || '',
              email: u.contactEmail || '', phone: u.contactPhone || '',
              notes: '', isPrimary: true, gender: u.contactGender || '',
            }];
          }
        }

        await updateCompany(updatedCompany);

        const customUpdates = selectedFields.filter(f => f.type === 'custom' && u[f.id] !== undefined);
        if (customUpdates.length > 0) {
          const existingVals = [...(c.fieldValues || [])];
          customUpdates.forEach(field => {
            if (!field.fieldId) return;
            const fieldDef = fields.find(fd => fd.id === field.fieldId);
            const existingIdx = existingVals.findIndex(v => v.fieldId === field.fieldId);
            if (field.year) {
              if (existingIdx >= 0) {
                existingVals[existingIdx] = { ...existingVals[existingIdx], yearValues: { ...existingVals[existingIdx].yearValues, [field.year]: Number(u[field.id]) || 0 } };
              } else {
                existingVals.push({ id: '', companyId: c.id, fieldId: field.fieldId!, textValue: '', numberValue: null, yearValues: { [field.year]: Number(u[field.id]) || 0 } });
              }
            } else {
              const val = u[field.id];
              if (existingIdx >= 0) {
                existingVals[existingIdx] = { ...existingVals[existingIdx], textValue: fieldDef?.fieldType === 'number' ? '' : val, numberValue: fieldDef?.fieldType === 'number' ? Number(val) || null : null };
              } else {
                existingVals.push({ id: '', companyId: c.id, fieldId: field.fieldId!, textValue: fieldDef?.fieldType === 'number' ? '' : val, numberValue: fieldDef?.fieldType === 'number' ? Number(val) || null : null, yearValues: {} });
              }
            }
          });
          await saveFieldValues(c.id, existingVals);
        }

        success++;
      } catch {
        failed++;
      }
    }

    await refresh();
    setResults({ success, failed, skipped });
    setStep('done');
  };

  const reset = () => {
    setRows([]); setStep('select-fields'); setSelectedFieldIds(new Set());
    setSearch(''); setMatchKey('nit'); setResults({ success: 0, failed: 0, skipped: 0 });
  };

  const handleClose = () => { reset(); onClose(); };
  const totalRows = rows.length;
  const matchedCount = rows.filter(r => r.matchedCompany).length;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl h-[min(90vh,48rem)] overflow-hidden p-0 gap-0 flex flex-col">
        <DialogHeader className="border-b border-border px-6 py-4 shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-primary" />
            Actualización masiva
          </DialogTitle>
        </DialogHeader>

        {step === 'select-fields' && (
          <>
            <div className="px-6 pt-4 pb-2 space-y-3 shrink-0">
              <div className="text-center space-y-2">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                  <FileSpreadsheet className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold">¿Qué campos deseas actualizar?</h3>
                  <p className="text-xs text-muted-foreground mt-1">Selecciona la variable de cruce y los campos que incluirá la plantilla.</p>
                </div>
              </div>

              {/* Match key selector */}
              <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/30">
                <Key className="h-4 w-4 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium">Variable de cruce</p>
                  <p className="text-[10px] text-muted-foreground">Campo para identificar cada empresa</p>
                </div>
                <Select value={matchKey} onValueChange={(v) => setMatchKey(v as MatchKeyType)}>
                  <SelectTrigger className="w-44 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nit">NIT</SelectItem>
                    <SelectItem value="tradeName">Nombre comercial</SelectItem>
                    <SelectItem value="legalName">Razón social</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input placeholder="Buscar campos..." value={search} onChange={e => setSearch(e.target.value)} className="h-9 pl-8 text-sm" />
              </div>
              <div className="flex items-center justify-between">
                <Badge variant="secondary" className="text-xs">{selectedFieldIds.size} campos seleccionados</Badge>
              </div>
            </div>

            <ScrollArea className="flex-1 min-h-0">
              <div className="px-6 pb-4 space-y-3">
                {Array.from(groups.entries()).map(([group, fieldsList]) => {
                  const allSel = fieldsList.every(f => selectedFieldIds.has(f.id));
                  const someSel = fieldsList.some(f => selectedFieldIds.has(f.id));
                  return (
                    <div key={group}>
                      <button className="flex items-center gap-2 mb-1.5" onClick={() => toggleGroup(group)}>
                        <Checkbox checked={allSel ? true : someSel ? 'indeterminate' : false} className="pointer-events-none" />
                        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{group}</span>
                        <Badge variant="outline" className="text-[10px] h-4 px-1.5">{fieldsList.filter(f => selectedFieldIds.has(f.id)).length}/{fieldsList.length}</Badge>
                      </button>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 pl-6">
                        {fieldsList.map(f => (
                          <label key={f.id} className="flex items-center gap-2 py-1 cursor-pointer hover:bg-accent/50 rounded px-1.5 -mx-1.5 transition-colors">
                            <Checkbox checked={selectedFieldIds.has(f.id)} onCheckedChange={() => toggle(f.id)} />
                            <span className="text-sm truncate">{f.label}</span>
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
                <h3 className="text-sm font-semibold">Sube la plantilla con los datos a actualizar</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Variable de cruce: <strong>{matchKeyLabels[matchKey]}</strong> · {selectedFieldIds.size} campos seleccionados
                </p>
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
            <div className="px-6 pt-4 pb-2 space-y-2 shrink-0">
              <div className="flex items-center gap-3 flex-wrap">
                <Badge variant="secondary" className="gap-1 text-xs">
                  <Key className="h-3 w-3" /> Cruce por: {matchKeyLabels[matchKey]}
                </Badge>
                <Badge variant="outline" className="gap-1 text-xs">
                  {totalRows} registros subidos
                </Badge>
                <Badge variant="outline" className="gap-1 text-xs text-primary border-primary/30">
                  <CheckCircle2 className="h-3 w-3" /> {matchedCount} cruzaron
                </Badge>
                {invalidRows.length > 0 && (
                  <Badge variant="destructive" className="gap-1 text-xs">
                    <XCircle className="h-3 w-3" /> {invalidRows.length} sin cruce
                  </Badge>
                )}
              </div>
            </div>
            <ScrollArea className="flex-1 min-h-0 px-6">
              <div className="space-y-1.5 pb-4">
                {rows.map((r, i) => (
                  <div key={i} className={`flex items-center gap-3 rounded-md border px-3 py-2 text-xs ${r.errors.length > 0 || !r.matchedCompany ? 'border-destructive/30 bg-destructive/5' : 'border-border/50'}`}>
                    <span className="w-5 shrink-0 text-muted-foreground font-mono">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <span className="font-medium">{r.matchedCompany?.tradeName || r.matchKey}</span>
                      <span className="text-muted-foreground ml-2">{Object.keys(r.updates).length} cambios</span>
                    </div>
                    {r.errors.length > 0 || !r.matchedCompany ? (
                      <div className="flex items-center gap-1 text-destructive shrink-0">
                        <AlertTriangle className="h-3 w-3" />
                        <span>{r.errors.length > 0 ? r.errors.join(', ') : 'No encontrada'}</span>
                      </div>
                    ) : (
                      <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
            <div className="flex justify-between gap-2 border-t border-border px-6 py-3 shrink-0">
              <Button variant="outline" size="sm" onClick={() => { setRows([]); setStep('upload'); }}>
                <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Volver
              </Button>
              <Button size="sm" onClick={handleUpdate} disabled={validRows.length === 0} className="gap-1.5">
                Actualizar {validRows.length} empresas
              </Button>
            </div>
          </>
        )}

        {step === 'loading' && (
          <div className="flex-1 min-h-0 overflow-y-auto flex flex-col items-center justify-center p-12 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Actualizando empresas...</p>
          </div>
        )}

        {step === 'done' && (
          <div className="flex-1 min-h-0 overflow-y-auto p-6 text-center space-y-4">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
              <CheckCircle2 className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-semibold">{results.success} empresas actualizadas</h3>
              {results.failed > 0 && <p className="text-xs text-destructive mt-1">{results.failed} fallaron</p>}
              {results.skipped > 0 && <p className="text-xs text-muted-foreground mt-1">{results.skipped} sin cambios</p>}
            </div>
            <Button size="sm" onClick={handleClose}>Cerrar</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
