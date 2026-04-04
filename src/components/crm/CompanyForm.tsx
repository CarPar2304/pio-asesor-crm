import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Company, Contact, ContactGender, CustomFieldValue, CustomSection, CustomField, VERTICALS, CITIES, CATEGORIES, GENDER_LABELS, FIELD_TYPE_LABELS, CustomFieldType } from '@/types/crm';
import { useTaxonomy } from '@/contexts/TaxonomyContext';
import { useCRM } from '@/contexts/CRMContext';
import { showSuccess, showError, showInfo } from '@/lib/toast';
import { useCustomFields } from '@/contexts/CustomFieldsContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Plus, Trash2, Upload, X, ChevronsUpDown, Check, Settings2, Pencil, Sparkles } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';

interface Props {
  open: boolean;
  onClose: () => void;
  company?: Company | null;
}

const DEFAULT_YEARS = [2020, 2021, 2022, 2023, 2024, 2025];

const emptyContact = (): Contact => ({
  id: crypto.randomUUID(), name: '', position: '', email: '', phone: '', notes: '', isPrimary: false, gender: '',
});

const Section = ({ title, children, onAddField, onDelete }: { title: string; children: React.ReactNode; onAddField?: () => void; onDelete?: () => void }) => (
  <div>
    <div className="mb-3 flex items-center justify-between">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
      <div className="flex gap-1">
        {onAddField && (
          <Button variant="ghost" size="icon" className="h-5 w-5" onClick={onAddField} title="Agregar campo">
            <Plus className="h-3 w-3" />
          </Button>
        )}
        {onDelete && (
          <Button variant="ghost" size="icon" className="h-5 w-5 text-destructive" onClick={onDelete} title="Eliminar sección">
            <Trash2 className="h-3 w-3" />
          </Button>
        )}
      </div>
    </div>
    <div className="space-y-3">{children}</div>
  </div>
);

const Field = ({ label, children, onDelete, onEdit, aiModified, isLoading }: { label: string; children: React.ReactNode; onDelete?: () => void; onEdit?: () => void; aiModified?: boolean; isLoading?: boolean }) => (
  <div className="relative">
    <div className="mb-1 flex items-center justify-between">
      <div className="flex items-center gap-1.5">
        <label className="block text-xs font-medium text-muted-foreground">{label}</label>
        {aiModified && <Badge variant="outline" className="h-4 px-1 text-[9px] font-medium border-primary/40 text-primary">IA</Badge>}
      </div>
      <div className="flex gap-0.5">
        {onEdit && (
          <Button variant="ghost" size="icon" className="h-4 w-4 text-muted-foreground hover:text-foreground" onClick={onEdit}>
            <Pencil className="h-2.5 w-2.5" />
          </Button>
        )}
        {onDelete && (
          <Button variant="ghost" size="icon" className="h-4 w-4 text-destructive" onClick={onDelete}>
            <Trash2 className="h-2.5 w-2.5" />
          </Button>
        )}
      </div>
    </div>
    {isLoading ? <Skeleton className="h-9 w-full" /> : children}
  </div>
);

function CreatableCombobox({ value, onChange, options: baseOptions, placeholder, onCreate, allowEmpty }: { value: string; onChange: (v: string) => void; options: string[]; placeholder?: string; onCreate?: (val: string) => void; allowEmpty?: boolean }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [customOptions, setCustomOptions] = useState<string[]>([]);
  const [editingOption, setEditingOption] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const allOptions = [...baseOptions, ...customOptions.filter(v => !baseOptions.includes(v))];
  const filtered = search ? allOptions.filter(v => v.toLowerCase().includes(search.toLowerCase())) : allOptions;
  const canCreate = search.trim() && !allOptions.some(v => v.toLowerCase() === search.toLowerCase());

  const handleCreate = () => {
    const newVal = search.trim();
    if (newVal) {
      setCustomOptions(prev => [...prev, newVal]);
      onChange(newVal);
      onCreate?.(newVal);
      setSearch('');
      setOpen(false);
    }
  };

  const handleEdit = (oldVal: string) => {
    if (!editValue.trim() || editValue.trim() === oldVal) { setEditingOption(null); return; }
    const newVal = editValue.trim();
    setCustomOptions(prev => prev.map(v => v === oldVal ? newVal : v));
    if (value === oldVal) onChange(newVal);
    setEditingOption(null);
  };

  const handleDelete = (val: string) => {
    setCustomOptions(prev => prev.filter(v => v !== val));
    if (value === val) onChange('');
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} className="h-9 w-full justify-between text-sm font-normal">
          {value || placeholder || 'Seleccionar...'}
          <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <div className="p-2">
          <Input placeholder="Buscar o crear..." value={search} onChange={e => setSearch(e.target.value)} className="h-8 text-sm"
            onKeyDown={e => { if (e.key === 'Enter' && canCreate) { e.preventDefault(); handleCreate(); } }} />
        </div>
        <ScrollArea className="max-h-48">
          <div className="p-1">
            {allowEmpty && (
              <button className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent"
                onClick={() => { onChange(''); setSearch(''); setOpen(false); }}>
                <X className="h-3.5 w-3.5" /> Sin selección
              </button>
            )}
            {filtered.map(v => (
              <div key={v} className="group flex items-center gap-1">
                {editingOption === v ? (
                  <div className="flex w-full items-center gap-1 px-2 py-1">
                    <Input value={editValue} onChange={e => setEditValue(e.target.value)} className="h-7 text-sm flex-1"
                      onKeyDown={e => { if (e.key === 'Enter') handleEdit(v); if (e.key === 'Escape') setEditingOption(null); }}
                      autoFocus />
                    <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => handleEdit(v)}><Check className="h-3 w-3" /></Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => setEditingOption(null)}><X className="h-3 w-3" /></Button>
                  </div>
                ) : (
                  <>
                    <button className={cn('flex flex-1 items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground', value === v && 'bg-accent text-accent-foreground')}
                      onClick={() => { onChange(v); setSearch(''); setOpen(false); }}>
                      <Check className={cn('h-3.5 w-3.5', value === v ? 'opacity-100' : 'opacity-0')} />{v}
                    </button>
                    <div className="hidden group-hover:flex items-center shrink-0">
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); setEditingOption(v); setEditValue(v); }}>
                        <Pencil className="h-3 w-3 text-muted-foreground" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); handleDelete(v); }}>
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>
                  </>
                )}
              </div>
            ))}
            {canCreate && (
              <button className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-primary hover:bg-accent" onClick={handleCreate}>
                <Plus className="h-3.5 w-3.5" /> Crear "{search.trim()}"
              </button>
            )}
            {filtered.length === 0 && !canCreate && <p className="px-2 py-1.5 text-xs text-muted-foreground">Sin resultados</p>}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

// Sub-vertical default options per vertical (kept for backward compat reference only)
const DEFAULT_SUB_VERTICALS: Record<string, string[]> = {};


function AddFieldDialog({ open, onClose, onAdd, existingSections }: { open: boolean; onClose: () => void; onAdd: (name: string, type: CustomFieldType, options: string[], sectionId: string | null) => void; existingSections: CustomSection[] }) {
  const [name, setName] = useState('');
  const [type, setType] = useState<CustomFieldType>('text');
  const [optionsText, setOptionsText] = useState('');
  const [sectionId, setSectionId] = useState<string>('__none');

  const handleAdd = () => {
    if (!name.trim()) return;
    const options = type === 'select' ? optionsText.split(',').map(o => o.trim()).filter(Boolean) : [];
    onAdd(name.trim(), type, options, sectionId === '__none' ? null : sectionId);
    setName(''); setType('text'); setOptionsText(''); setSectionId('__none');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Nuevo campo</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Nombre</label>
            <Input className="mt-1 h-9 text-sm" value={name} onChange={e => setName(e.target.value)} placeholder="Ej: Tipo de cliente" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Tipo</label>
            <Select value={type} onValueChange={v => setType(v as CustomFieldType)}>
              <SelectTrigger className="mt-1 h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(FIELD_TYPE_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {type === 'select' && (
            <div>
              <label className="text-xs font-medium text-muted-foreground">Opciones (separadas por coma)</label>
              <Input className="mt-1 h-9 text-sm" value={optionsText} onChange={e => setOptionsText(e.target.value)} placeholder="B2B, B2C, B2G" />
            </div>
          )}
          <div>
            <label className="text-xs font-medium text-muted-foreground">Sección</label>
            <Select value={sectionId} onValueChange={setSectionId}>
              <SelectTrigger className="mt-1 h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">Sin sección</SelectItem>
                {existingSections.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button size="sm" className="w-full" onClick={handleAdd} disabled={!name.trim()}>Crear campo</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EditFieldDialog({ open, onClose, field, onSave, existingSections }: { open: boolean; onClose: () => void; field: CustomField | null; onSave: (updated: CustomField) => void; existingSections: CustomSection[] }) {
  const [name, setName] = useState('');
  const [type, setType] = useState<CustomFieldType>('text');
  const [optionsText, setOptionsText] = useState('');
  const [sectionId, setSectionId] = useState<string>('__none');

  useEffect(() => {
    if (field) {
      setName(field.name);
      setType(field.fieldType);
      setOptionsText(field.options.join(', '));
      setSectionId(field.sectionId || '__none');
    }
  }, [field]);

  const handleSave = () => {
    if (!field || !name.trim()) return;
    const options = type === 'select' ? optionsText.split(',').map(o => o.trim()).filter(Boolean) : [];
    onSave({ ...field, name: name.trim(), fieldType: type, options, sectionId: sectionId === '__none' ? null : sectionId });
    onClose();
  };

  if (!field) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Editar campo</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Nombre</label>
            <Input className="mt-1 h-9 text-sm" value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Tipo</label>
            <Select value={type} onValueChange={v => setType(v as CustomFieldType)}>
              <SelectTrigger className="mt-1 h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(FIELD_TYPE_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {type === 'select' && (
            <div>
              <label className="text-xs font-medium text-muted-foreground">Opciones (separadas por coma)</label>
              <Input className="mt-1 h-9 text-sm" value={optionsText} onChange={e => setOptionsText(e.target.value)} placeholder="B2B, B2C, B2G" />
            </div>
          )}
          <div>
            <label className="text-xs font-medium text-muted-foreground">Sección</label>
            <Select value={sectionId} onValueChange={setSectionId}>
              <SelectTrigger className="mt-1 h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">Sin sección</SelectItem>
                {existingSections.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button size="sm" className="w-full" onClick={handleSave} disabled={!name.trim()}>Guardar cambios</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EditSectionDialog({ open, onClose, section, onSave }: { open: boolean; onClose: () => void; section: CustomSection | null; onSave: (id: string, name: string) => void }) {
  const [name, setName] = useState('');

  useEffect(() => {
    if (section) setName(section.name);
  }, [section]);

  if (!section) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Editar sección</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Nombre de la sección</label>
            <Input className="mt-1 h-9 text-sm" value={name} onChange={e => setName(e.target.value)} />
          </div>
          <Button size="sm" className="w-full" onClick={() => { if (name.trim()) { onSave(section.id, name.trim()); onClose(); } }} disabled={!name.trim()}>Guardar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AddSectionDialog({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: (name: string) => void }) {
  const [name, setName] = useState('');
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Nueva sección</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Nombre de la sección</label>
            <Input className="mt-1 h-9 text-sm" value={name} onChange={e => setName(e.target.value)} placeholder="Ej: Financiamiento" />
          </div>
          <Button size="sm" className="w-full" onClick={() => { if (name.trim()) { onAdd(name.trim()); setName(''); onClose(); } }} disabled={!name.trim()}>Crear sección</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function CompanyForm({ open, onClose, company }: Props) {
  const { addCompany, updateCompany, saveFieldValues } = useCRM();
  const taxonomy = useTaxonomy();
  const { allCategories } = taxonomy;
  const { sections, fields, addSection, addField, deleteSection, deleteField, updateField, updateSection } = useCustomFields();
  const isEdit = !!company;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    tradeName: '', legalName: '', nit: '', category: 'Startup',
    vertical: '', subVertical: '', description: '', city: '', customCity: '', exportsUSD: 0, website: '',
  });
  const [salesByYear, setSalesByYear] = useState<Record<number, string>>({});
  const [extraYears, setExtraYears] = useState<number[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([emptyContact()]);
  const [notes, setNotes] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [fieldValues, setFieldValues] = useState<Record<string, CustomFieldValue>>({});

  // Company Fit AI state
  const [companyFitLoading, setCompanyFitLoading] = useState(false);
  const [companyFitProgress, setCompanyFitProgress] = useState(0);
  const [companyFitStage, setCompanyFitStage] = useState('');
  const [aiModifiedFields, setAiModifiedFields] = useState<Set<string>>(new Set());

  const handleCompanyFit = async () => {
    setCompanyFitLoading(true);
    setAiModifiedFields(new Set());
    setCompanyFitProgress(10);
    setCompanyFitStage('Analizando sitio web...');

    try {
      // Build taxonomy data to send
      const taxonomyData = {
        categories: taxonomy.allCategories,
        verticals: taxonomy.verticals.map(v => {
          const catLinks = taxonomy.categoryVerticalLinks.filter(l => l.vertical_id === v.id);
          return { name: v.name, category: catLinks.map(l => l.category).join(', ') };
        }),
        subVerticals: taxonomy.subVerticals.map(sv => {
          const vertLinks = taxonomy.verticalSubVerticalLinks.filter(l => l.sub_vertical_id === sv.id);
          const vertNames = vertLinks.map(l => taxonomy.verticals.find(v => v.id === l.vertical_id)?.name || '').filter(Boolean);
          return { name: sv.name, vertical: vertNames.join(', ') };
        }),
      };

      setCompanyFitProgress(30);
      setCompanyFitStage('Consultando RUES...');

      const progressInterval = setInterval(() => {
        setCompanyFitProgress(prev => Math.min(prev + 5, 85));
      }, 2000);

      setTimeout(() => setCompanyFitStage('Clasificando empresa...'), 4000);
      setTimeout(() => setCompanyFitStage('Generando resultados...'), 8000);

      const { data: result, error } = await supabase.functions.invoke('company-fit', {
        body: {
          tradeName: form.tradeName,
          legalName: form.legalName,
          nit: form.nit,
          category: form.category,
          vertical: form.vertical,
          subVertical: form.subVertical,
          description: form.description,
          website: form.website,
          city: form.city === 'Otra' ? form.customCity : form.city,
          contacts: contacts.map(c => ({ id: c.id, name: c.name, gender: c.gender })),
          taxonomy: taxonomyData,
        },
      });

      clearInterval(progressInterval);

      if (error) throw new Error(error.message || 'Error al analizar');
      if (result?.error) throw new Error(result.error);

      setCompanyFitProgress(100);
      setCompanyFitStage('¡Listo!');

      // Apply results to form
      const modified = new Set<string>();

      if (result.category && result.category !== form.category) {
        setForm(f => ({ ...f, category: result.category }));
        modified.add('category');
      }
      if (result.vertical && result.vertical !== form.vertical) {
        setForm(f => ({ ...f, vertical: result.vertical }));
        modified.add('vertical');
      }
      if (result.subVertical && result.subVertical !== form.subVertical) {
        setForm(f => ({ ...f, subVertical: result.subVertical }));
        modified.add('subVertical');
      }
      if (result.description && result.description !== form.description) {
        setForm(f => ({ ...f, description: result.description }));
        modified.add('description');
      }
      if (result.legalName && result.legalName !== form.legalName) {
        setForm(f => ({ ...f, legalName: result.legalName }));
        modified.add('legalName');
      }
      if (result.nit && result.nit !== form.nit) {
        setForm(f => ({ ...f, nit: result.nit }));
        modified.add('nit');
      }
      if (result.tradeName && result.tradeName !== form.tradeName) {
        setForm(f => ({ ...f, tradeName: result.tradeName }));
        modified.add('tradeName');
      }

      // Update contact genders
      if (result.contacts?.length > 0) {
        setContacts(prev => prev.map(c => {
          const aiContact = result.contacts.find((ac: any) => ac.id === c.id);
          if (aiContact && aiContact.gender !== c.gender) {
            modified.add(`contact-${c.id}`);
            return { ...c, gender: aiContact.gender as ContactGender };
          }
          return c;
        }));
      }

      // Handle logo URL
      if (result.logoUrl && !logoUrl) {
        try {
          const logoRes = await fetch(result.logoUrl);
          if (logoRes.ok) {
            const blob = await logoRes.blob();
            const ext = blob.type.split('/')[1]?.replace('jpeg', 'jpg') || 'png';
            const fileName = `${crypto.randomUUID()}.${ext}`;
            const { error: uploadErr } = await supabase.storage.from('company-logos').upload(fileName, blob, { upsert: true });
            if (!uploadErr) {
              const { data: urlData } = supabase.storage.from('company-logos').getPublicUrl(fileName);
              setLogoUrl(urlData.publicUrl);
              setLogoPreview(urlData.publicUrl);
              modified.add('logo');
            }
          }
        } catch { /* logo fetch failed, skip */ }
      }

      setAiModifiedFields(modified);

      const confidenceLabel = result.confidence === 'high' ? 'alta' : result.confidence === 'medium' ? 'media' : 'baja';
      showSuccess('Company Fit completado', `Confianza ${confidenceLabel}. ${result.reasoning?.slice(0, 100) || ''}`);
    } catch (err: any) {
      console.error('Company Fit error:', err);
      showError('Error en Company Fit', err.message || 'No se pudo analizar la empresa');
    } finally {
      setTimeout(() => {
        setCompanyFitLoading(false);
        setCompanyFitProgress(0);
        setCompanyFitStage('');
      }, 1000);
    }
  };

  // Dialogs
  const [addFieldOpen, setAddFieldOpen] = useState(false);
  const [addSectionOpen, setAddSectionOpen] = useState(false);
  const [editFieldTarget, setEditFieldTarget] = useState<CustomField | null>(null);
  const [editSectionTarget, setEditSectionTarget] = useState<CustomSection | null>(null);
  const [newYearValue, setNewYearValue] = useState('');

  // Compute all years to show
  const allYears = [...new Set([...DEFAULT_YEARS, ...extraYears, ...Object.keys(salesByYear).map(Number)])].sort();

  // City logic: if stored city is not in CITIES, it's a custom city
  const isCustomCity = (city: string) => city && !CITIES.includes(city);

  // Track which company we've initialized to avoid resetting on reference changes
  const initializedRef = useRef<string | null>(null);

  useEffect(() => {
    const companyId = company?.id ?? null;
    // Only reset form when dialog opens fresh or company actually changes
    if (!open) {
      initializedRef.current = null;
      return;
    }
    if (initializedRef.current === (companyId ?? '__new__')) return;
    initializedRef.current = companyId ?? '__new__';

    if (company) {
      const cityIsCustom = isCustomCity(company.city);
      setForm({
        tradeName: company.tradeName, legalName: company.legalName, nit: company.nit,
        category: company.category, vertical: company.vertical,
        subVertical: company.economicActivity, description: company.description,
        city: cityIsCustom ? 'Otra' : company.city,
        customCity: cityIsCustom ? company.city : '',
        exportsUSD: company.exportsUSD, website: company.website || '',
      });
      const sales: Record<number, string> = {};
      Object.entries(company.salesByYear).forEach(([y, v]) => { sales[Number(y)] = String(v); });
      setSalesByYear(sales);
      setContacts(company.contacts.length > 0 ? company.contacts : [emptyContact()]);
      setLogoUrl(company.logo || null);
      setLogoPreview(company.logo || null);

      const fv: Record<string, CustomFieldValue> = {};
      (company.fieldValues || []).forEach(v => { fv[v.fieldId] = v; });
      setFieldValues(fv);
    } else {
      setForm({ tradeName: '', legalName: '', nit: '', category: 'Startup', vertical: '', subVertical: '', description: '', city: '', customCity: '', exportsUSD: 0, website: '' });
      setSalesByYear({});
      setContacts([emptyContact()]);
      setNotes('');
      setLogoUrl(null);
      setLogoPreview(null);
      setFieldValues({});
    }
    setExtraYears([]);
  }, [company?.id, open]);

  const uploadFile = async (file: File) => {
    const reader = new FileReader();
    reader.onload = (ev) => setLogoPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
    setUploading(true);
    const ext = file.type.split('/')[1]?.replace('jpeg', 'jpg') || 'png';
    const fileName = `${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from('company-logos').upload(fileName, file, { upsert: true });
    if (!error) {
      const { data } = supabase.storage.from('company-logos').getPublicUrl(fileName);
      setLogoUrl(data.publicUrl);
    }
    setUploading(false);
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
  };

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (!open) return;
      const item = Array.from(e.clipboardData?.items || []).find(i => i.type.startsWith('image/'));
      if (item) { e.preventDefault(); const file = item.getAsFile(); if (file) uploadFile(file); }
    };
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [open]);

  const removeLogo = () => { setLogoUrl(null); setLogoPreview(null); };

  const getFieldValue = (fieldId: string) => fieldValues[fieldId] || { id: '', companyId: '', fieldId, textValue: '', numberValue: null, yearValues: {} };
  const setFieldVal = (fieldId: string, partial: Partial<CustomFieldValue>) => {
    setFieldValues(prev => ({
      ...prev,
      [fieldId]: { ...getFieldValue(fieldId), ...partial, fieldId },
    }));
  };

  const handleSave = async () => {
    const parsedSales: Record<number, number> = {};
    Object.entries(salesByYear).forEach(([y, v]) => { const n = Number(v); if (n > 0) parsedSales[Number(y)] = n; });

    const validContacts = contacts.filter(c => c.name.trim());
    if (validContacts.length > 0 && !validContacts.some(c => c.isPrimary)) validContacts[0].isPrimary = true;

    // Resolve city: if "Otra" is selected, use the custom city value
    const resolvedCity = form.city === 'Otra' ? form.customCity.trim() : form.city;

    const companyData: Company = {
      id: company?.id || crypto.randomUUID(),
      tradeName: form.tradeName,
      legalName: form.legalName,
      nit: form.nit,
      category: form.category,
      vertical: form.vertical,
      economicActivity: form.subVertical, // sub-vertical stored in economicActivity column
      description: form.description,
      city: resolvedCity,
      salesByYear: parsedSales,
      exportsUSD: form.exportsUSD,
      website: form.website,
      logo: logoUrl || undefined,
      contacts: validContacts,
      actions: company?.actions || [],
      milestones: company?.milestones || [],
      tasks: company?.tasks || [],
      customProperties: company?.customProperties || [],
      fieldValues: [],
      createdAt: company?.createdAt || new Date().toISOString().split('T')[0],
    };

    let companyId: string;
    if (isEdit) {
      await updateCompany(companyData);
      companyId = company!.id;
      showSuccess('Empresa actualizada', `"${companyData.tradeName}" guardada exitosamente`);
    } else {
      const newId = await addCompany(companyData);
      if (!newId) return;
      companyId = newId;
      showSuccess('Empresa creada', `"${companyData.tradeName}" creada exitosamente`);
    }

    const valuesToSave = Object.values(fieldValues).filter(v => v.textValue || v.numberValue !== null || Object.keys(v.yearValues || {}).length > 0);
    await saveFieldValues(companyId, valuesToSave);
    onClose();
  };

  const updateContact = (id: string, field: keyof Contact, value: string | boolean) => {
    setContacts(prev => prev.map(c => {
      if (c.id !== id) return field === 'isPrimary' && value === true ? { ...c, isPrimary: false } : c;
      return { ...c, [field]: value };
    }));
  };

  const handleAddYear = () => {
    const y = Number(newYearValue);
    if (y >= 2000 && y <= 2100 && !allYears.includes(y)) {
      setExtraYears(prev => [...prev, y]);
      setNewYearValue('');
    }
  };

  const handleAddField = async (name: string, type: CustomFieldType, options: string[], sectionId: string | null) => {
    await addField({ sectionId, name, fieldType: type, options, displayOrder: 0 });
  };

  const handleAddSection = async (name: string) => {
    await addSection(name);
  };

  const handleEditField = async (updated: CustomField) => {
    await updateField(updated);
  };

  const handleEditSection = async (id: string, name: string) => {
    await updateSection(id, name);
  };

  const renderFieldInput = (fieldId: string, fieldType: string, options: string[]) => {
    const val = getFieldValue(fieldId);
    switch (fieldType) {
      case 'text':
        return <Input className="h-8 text-sm" value={val.textValue} onChange={e => setFieldVal(fieldId, { textValue: e.target.value })} />;
      case 'number':
        return <Input className="h-8 text-sm" type="number" value={val.numberValue ?? ''} onChange={e => setFieldVal(fieldId, { numberValue: e.target.value ? Number(e.target.value) : null })} />;
      case 'select':
        return (
          <Select value={val.textValue} onValueChange={v => setFieldVal(fieldId, { textValue: v })}>
            <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Seleccionar" /></SelectTrigger>
            <SelectContent>
              {options.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
            </SelectContent>
          </Select>
        );
      case 'metric_by_year':
        return (
          <div className="grid grid-cols-3 gap-2">
            {allYears.map(y => (
              <div key={y}>
                <label className="text-[10px] text-muted-foreground">{y}</label>
                <Input className="h-7 text-xs" type="number" value={val.yearValues?.[y] ?? ''}
                  onChange={e => setFieldVal(fieldId, { yearValues: { ...val.yearValues, [y]: Number(e.target.value) || 0 } })} />
              </div>
            ))}
          </div>
        );
      default:
        return <Input className="h-8 text-sm" value={val.textValue} onChange={e => setFieldVal(fieldId, { textValue: e.target.value })} />;
    }
  };

  // Group fields by section
  const unsectionedFields = fields.filter(f => !f.sectionId);

  // Sub-vertical options based on current vertical (from taxonomy)
  const allVerticals = useMemo(() => {
    const verts = taxonomy.getVerticalsForCategory(form.category).map(v => v.name).filter(n => n !== 'Otro');
    if (form.vertical && form.vertical !== 'Otro' && !verts.includes(form.vertical)) verts.push(form.vertical);
    return verts;
  }, [taxonomy, form.category, form.vertical]);

  const subVerticalOptions = useMemo(() => {
    const subs = taxonomy.getSubVerticalsForVertical(form.vertical).map(sv => sv.name).filter(n => n !== 'Otro');
    if (form.subVertical && form.subVertical !== 'Otro' && !subs.includes(form.subVertical)) subs.push(form.subVertical);
    return subs;
  }, [taxonomy, form.vertical, form.subVertical]);

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-3xl p-0 gap-0 max-h-[90vh] overflow-hidden">
        <DialogHeader className="border-b border-border px-6 py-4">
          <div className="flex items-center justify-between">
            <DialogTitle>{isEdit ? 'Editar empresa' : 'Nueva empresa'}</DialogTitle>
            {(isEdit || form.website) && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs"
                onClick={handleCompanyFit}
                disabled={companyFitLoading || !form.tradeName.trim()}
              >
                <Sparkles className="h-3.5 w-3.5" />
                Company Fit
              </Button>
            )}
          </div>
          {companyFitLoading && (
            <div className="mt-3 space-y-2">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Progress value={companyFitProgress} className="h-2" />
                  <div className="absolute inset-0 h-2 rounded-full overflow-hidden">
                    <div className="h-full w-full bg-gradient-to-r from-primary/20 via-primary/60 to-primary/20 animate-pulse" />
                  </div>
                </div>
                <span className="text-xs text-muted-foreground whitespace-nowrap">{companyFitProgress}%</span>
              </div>
              <p className="text-xs text-primary font-medium animate-pulse">{companyFitStage}</p>
            </div>
          )}
        </DialogHeader>
        <ScrollArea className="max-h-[calc(90vh-130px)] px-6 py-4">
          <div className="space-y-6 pb-6">
            {/* Logo Upload */}
            <Section title="Logo">
              {companyFitLoading && !logoPreview ? (
                <Skeleton className="h-16 w-16 rounded-lg" />
              ) : (
              <div className="flex items-center gap-4">
                {logoPreview ? (
                  <div className="relative">
                    <img src={logoPreview} alt="Logo" className={cn("h-16 w-16 rounded-lg border border-border object-cover", aiModifiedFields.has('logo') && "ring-2 ring-primary/30")} />
                    {aiModifiedFields.has('logo') && <Badge variant="outline" className="absolute -top-1 -right-1 h-4 px-1 text-[9px] border-primary/40 text-primary">IA</Badge>}
                    <button type="button" onClick={removeLogo} className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={() => fileInputRef.current?.click()} className="flex h-16 w-16 items-center justify-center rounded-lg border-2 border-dashed border-border text-muted-foreground transition-colors hover:border-primary hover:text-primary">
                    <Upload className="h-5 w-5" />
                  </button>
                )}
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                <div className="text-xs text-muted-foreground">
                  {uploading ? 'Subiendo...' : logoPreview ? 'Logo cargado' : 'Clic para subir o pega una imagen (Ctrl+V)'}
                </div>
              </div>
              )}
            </Section>

            <Separator />

            <Section title="Identificación">
              <Field label="Nombre comercial" aiModified={aiModifiedFields.has('tradeName')} isLoading={companyFitLoading}><Input className="h-9 text-sm" value={form.tradeName} onChange={e => setForm(f => ({ ...f, tradeName: e.target.value }))} /></Field>
              <Field label="Razón Social" aiModified={aiModifiedFields.has('legalName')} isLoading={companyFitLoading}><Input className="h-9 text-sm" value={form.legalName} onChange={e => setForm(f => ({ ...f, legalName: e.target.value }))} /></Field>
              <Field label="NIT" aiModified={aiModifiedFields.has('nit')} isLoading={companyFitLoading}><Input className="h-9 text-sm" value={form.nit} onChange={e => setForm(f => ({ ...f, nit: e.target.value }))} /></Field>
            </Section>

            <Separator />

            <Section title="Segmentación">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Categoría" aiModified={aiModifiedFields.has('category')} isLoading={companyFitLoading}>
                  <CreatableCombobox value={form.category} onChange={v => setForm(f => ({ ...f, category: v }))} options={allCategories} placeholder="Seleccionar categoría..." />
                </Field>
                <Field label="Vertical" aiModified={aiModifiedFields.has('vertical')} isLoading={companyFitLoading}>
                  <CreatableCombobox value={form.vertical} onChange={v => setForm(f => ({ ...f, vertical: v, subVertical: '' }))} options={allVerticals}
                    placeholder="Seleccionar vertical..." allowEmpty
                    onCreate={async (name) => { await taxonomy.addVertical(name); }} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Sub-vertical" aiModified={aiModifiedFields.has('subVertical')} isLoading={companyFitLoading}>
                  <CreatableCombobox value={form.subVertical} onChange={v => setForm(f => ({ ...f, subVertical: v }))} options={subVerticalOptions} placeholder="Seleccionar sub-vertical..."
                    allowEmpty
                    onCreate={async (name) => {
                      const sv = await taxonomy.addSubVertical(name);
                      if (sv && form.vertical) {
                        const vert = taxonomy.verticals.find(v => v.name === form.vertical);
                        if (vert) await taxonomy.linkVerticalSubVertical(vert.id, sv.id);
                      }
                    }} />
                </Field>
                <Field label="Ciudad">
                  <Select value={form.city} onValueChange={v => setForm(f => ({ ...f, city: v, customCity: v === 'Otra' ? f.customCity : '' }))}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                    <SelectContent>{CITIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
              </div>
              {form.city === 'Otra' && (
                <Field label="¿Cuál ciudad?">
                  <Input className="h-9 text-sm" placeholder="Escribir nombre de la ciudad..." value={form.customCity} onChange={e => setForm(f => ({ ...f, customCity: e.target.value }))} />
                </Field>
              )}
            </Section>

            <Separator />

            <Section title="Descripción">
              {companyFitLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              ) : (
                <div className="relative">
                  {aiModifiedFields.has('description') && <Badge variant="outline" className="absolute -top-1 right-0 h-4 px-1 text-[9px] border-primary/40 text-primary z-10">IA</Badge>}
                  <Textarea className="text-sm" rows={3} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Describe brevemente la empresa..." />
                </div>
              )}
            </Section>

            <Separator />

            <Section title="Página web">
              <Field label="URL del sitio web">
                <Input className="h-9 text-sm" placeholder="https://www.ejemplo.com" value={form.website} onChange={e => setForm(f => ({ ...f, website: e.target.value }))} />
              </Field>
            </Section>

            <Separator />

            <Section title="Contactos">
              {contacts.map((c, i) => (
                <div key={c.id} className="space-y-2 rounded-lg border border-border/50 p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-muted-foreground">Contacto {i + 1}</p>
                    <div className="flex gap-1">
                      <Button variant={c.isPrimary ? 'default' : 'ghost'} size="sm" className="h-6 text-[10px]" onClick={() => updateContact(c.id, 'isPrimary', true)}>Principal</Button>
                      {contacts.length > 1 && (
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setContacts(prev => prev.filter(x => x.id !== c.id))}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Input className="h-8 text-sm" placeholder="Nombre" value={c.name} onChange={e => updateContact(c.id, 'name', e.target.value)} />
                    <Input className="h-8 text-sm" placeholder="Cargo" value={c.position} onChange={e => updateContact(c.id, 'position', e.target.value)} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Input className="h-8 text-sm" placeholder="Correo" value={c.email} onChange={e => updateContact(c.id, 'email', e.target.value)} />
                    <Input className="h-8 text-sm" placeholder="Celular" value={c.phone} onChange={e => updateContact(c.id, 'phone', e.target.value)} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Select value={c.gender || ''} onValueChange={v => updateContact(c.id, 'gender', v)}>
                      <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Género" /></SelectTrigger>
                      <SelectContent>{Object.entries(GENDER_LABELS).map(([k, label]) => <SelectItem key={k} value={k}>{label}</SelectItem>)}</SelectContent>
                    </Select>
                    <Input className="h-8 text-sm" placeholder="Notas" value={c.notes} onChange={e => updateContact(c.id, 'notes', e.target.value)} />
                  </div>
                </div>
              ))}
              <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => setContacts(prev => [...prev, emptyContact()])}>
                <Plus className="h-3 w-3" /> Agregar contacto
              </Button>
            </Section>

            <Separator />

            <Section title="Métricas — Ventas por año (COP)">
              <div className="grid grid-cols-3 gap-2">
                {allYears.map(y => (
                  <Field key={y} label={String(y)}>
                    <Input className="h-8 text-sm" type="number" placeholder="0" value={salesByYear[y] || ''}
                      onChange={e => setSalesByYear(prev => ({ ...prev, [y]: e.target.value }))} />
                  </Field>
                ))}
              </div>
              <div className="flex items-center gap-2 mt-2">
                <Input className="h-8 w-24 text-sm" type="number" placeholder="Año" value={newYearValue} onChange={e => setNewYearValue(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddYear(); } }} />
                <Button variant="outline" size="sm" className="h-8 gap-1 text-xs" onClick={handleAddYear}><Plus className="h-3 w-3" /> Agregar año</Button>
              </div>
            </Section>

            <Separator />

            <Section title="Internacionalización">
              <Field label="Exportaciones (USD)">
                <Input className="h-9 text-sm" type="number" value={form.exportsUSD || ''} onChange={e => setForm(f => ({ ...f, exportsUSD: Number(e.target.value) }))} />
              </Field>
            </Section>

            {/* Unsectioned custom fields */}
            {unsectionedFields.length > 0 && (
              <>
                <Separator />
                <Section title="Campos personalizados">
                  {unsectionedFields.map(f => (
                    <Field key={f.id} label={f.name} onDelete={() => deleteField(f.id)} onEdit={() => setEditFieldTarget(f)}>
                      {renderFieldInput(f.id, f.fieldType, f.options)}
                    </Field>
                  ))}
                </Section>
              </>
            )}

            {/* Custom sections */}
            {sections.map(section => {
              const sectionFields = fields.filter(f => f.sectionId === section.id);
              return (
                <React.Fragment key={section.id}>
                  <Separator />
                  <Section title={section.name} onAddField={() => { /* handled by global add */ }} onDelete={() => deleteSection(section.id)}>
                    <div className="mb-1 flex justify-end">
                      <Button variant="ghost" size="icon" className="h-5 w-5 text-muted-foreground" onClick={() => setEditSectionTarget(section)} title="Editar sección">
                        <Pencil className="h-3 w-3" />
                      </Button>
                    </div>
                    {sectionFields.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">Sin campos. Agrega uno con el botón + abajo.</p>
                    ) : (
                      sectionFields.map(f => (
                        <Field key={f.id} label={f.name} onDelete={() => deleteField(f.id)} onEdit={() => setEditFieldTarget(f)}>
                          {renderFieldInput(f.id, f.fieldType, f.options)}
                        </Field>
                      ))
                    )}
                  </Section>
                </React.Fragment>
              );
            })}

            <Separator />

            {/* Add section / field buttons */}
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => setAddSectionOpen(true)}>
                <Plus className="h-3 w-3" /> Nueva sección
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => setAddFieldOpen(true)}>
                <Settings2 className="h-3 w-3" /> Nuevo campo
              </Button>
            </div>

            <Separator />

            <Section title="Notas">
              <Textarea className="text-sm" rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notas internas..." />
            </Section>
          </div>
        </ScrollArea>
        <div className="flex justify-end gap-2 border-t border-border px-6 py-3">
          <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
          <Button size="sm" onClick={handleSave} disabled={!form.tradeName.trim() || uploading}>
            {isEdit ? 'Guardar cambios' : 'Crear empresa'}
          </Button>
        </div>
      </DialogContent>

      <AddFieldDialog
        open={addFieldOpen}
        onClose={() => setAddFieldOpen(false)}
        onAdd={handleAddField}
        existingSections={sections}
      />
      <EditFieldDialog
        open={editFieldTarget !== null}
        onClose={() => setEditFieldTarget(null)}
        field={editFieldTarget}
        onSave={handleEditField}
        existingSections={sections}
      />
      <EditSectionDialog
        open={editSectionTarget !== null}
        onClose={() => setEditSectionTarget(null)}
        section={editSectionTarget}
        onSave={handleEditSection}
      />
      <AddSectionDialog open={addSectionOpen} onClose={() => setAddSectionOpen(false)} onAdd={handleAddSection} />
    </Dialog>
  );
}
