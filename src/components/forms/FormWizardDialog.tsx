import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/lib/toast';
import { useAuth } from '@/hooks/useAuth';
import {
  ExternalForm, FormType, FormStatus, VerificationMode,
  FormFieldType, FORM_TYPE_LABELS, FIELD_TYPE_OPTIONS, CRM_FIELD_MAPPINGS
} from '@/types/externalForms';
import { useCustomFields } from '@/contexts/CustomFieldsContext';
import { ChevronLeft, ChevronRight, Plus, Trash2, GripVertical, Copy, ExternalLink, FolderPlus, Layers, Link2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  open: boolean;
  onClose: () => void;
  editingForm: ExternalForm | null;
  onSaved: () => void;
}

const STEPS = [
  'Información general',
  'Identificación y acceso',
  'Constructor de campos',
  'Precarga',
  'Diseño y textos',
  'Publicación',
];

interface FieldDraft {
  id?: string;
  label: string;
  field_key: string;
  field_type: FormFieldType;
  placeholder: string;
  help_text: string;
  section_name: string;
  is_required: boolean;
  is_visible: boolean;
  is_editable: boolean;
  is_readonly: boolean;
  preload_from_crm: boolean;
  crm_table: string | null;
  crm_column: string | null;
  crm_field_id: string | null;
  options: string[];
  display_order: number;
  condition_field_key?: string | null;
  condition_value?: string | null;
  only_for_new?: boolean;
  page_id?: string | null;
}

interface PageDraft {
  id: string;          // local uuid (kept across save when persisted)
  persisted: boolean;  // whether it's already in DB
  title: string;
  description: string;
  display_order: number;
}

export default function FormWizardDialog({ open, onClose, editingForm, onSaved }: Props) {
  const { session } = useAuth();
  const { fields: customFields, sections: customSections, addSection, addField: addCustomField } = useCustomFields();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  // Step 1
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [formType, setFormType] = useState<FormType>('update');
  const [allowCreation, setAllowCreation] = useState(false);
  const [status, setStatus] = useState<FormStatus>('draft');

  // Step 2
  const [verificationMode, setVerificationMode] = useState<VerificationMode>('key_and_code');
  const [verificationKeyField, setVerificationKeyField] = useState('nit');
  const [allowNameFallback, setAllowNameFallback] = useState(false);
  const [codeExpiration, setCodeExpiration] = useState(10);
  const [maxAttempts, setMaxAttempts] = useState(5);

  // Step 3
  const [formFields, setFormFields] = useState<FieldDraft[]>([]);
  const [showNewSectionDialog, setShowNewSectionDialog] = useState(false);
  const [newSectionName, setNewSectionName] = useState('');
  const [showNewFieldDialog, setShowNewFieldDialog] = useState(false);
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldType, setNewFieldType] = useState<string>('text');
  const [newFieldSection, setNewFieldSection] = useState<string>('');
  const [newFieldOptions, setNewFieldOptions] = useState('');

  // Drag and drop state
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const fieldListRef = useRef<HTMLDivElement>(null);
  const dragScrollInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  // Step 5
  const [publicTitle, setPublicTitle] = useState('');
  const [publicSubtitle, setPublicSubtitle] = useState('');
  const [submitButtonText, setSubmitButtonText] = useState('Enviar');
  const [successMessage, setSuccessMessage] = useState('Tu información ha sido enviada exitosamente.');
  const [primaryColor, setPrimaryColor] = useState('#4f46e5');

  // Pages (sections of questions for multi-page rendering)
  const [pages, setPages] = useState<PageDraft[]>([]);

  // Step 6
  const [savedSlug, setSavedSlug] = useState('');
  const [savedFormId, setSavedFormId] = useState<string | null>(null);

  // Offer/Pipeline linking
  const [linkedOfferId, setLinkedOfferId] = useState<string | null>(null);
  const [linkedStageId, setLinkedStageId] = useState<string | null>(null);
  const [offers, setOffers] = useState<{ id: string; name: string }[]>([]);
  const [stages, setStages] = useState<{ id: string; name: string; offer_id: string }[]>([]);

  // Load offers and stages
  useEffect(() => {
    if (!open) return;
    supabase.from('portfolio_offers').select('id, name').order('name').then(({ data }) => setOffers(data || []));
    supabase.from('pipeline_stages').select('id, name, offer_id').order('display_order').then(({ data }) => setStages((data || []) as any));
  }, [open]);

  const filteredStages = useMemo(() => {
    if (!linkedOfferId) return [];
    return stages.filter(s => s.offer_id === linkedOfferId);
  }, [linkedOfferId, stages]);

  useEffect(() => {
    if (!open) return;
    if (editingForm) {
      setName(editingForm.name);
      setDescription(editingForm.description);
      setFormType(editingForm.form_type);
      setStatus(editingForm.status);
      setVerificationMode(editingForm.verification_mode);
      setVerificationKeyField(editingForm.verification_key_field);
      setAllowNameFallback((editingForm as any).allow_name_fallback || false);
      setCodeExpiration(editingForm.code_expiration_minutes);
      setMaxAttempts(editingForm.max_code_attempts);
      setPublicTitle(editingForm.public_title);
      setPublicSubtitle(editingForm.public_subtitle);
      setSubmitButtonText(editingForm.submit_button_text);
      setSuccessMessage(editingForm.success_message);
      setPrimaryColor(editingForm.primary_color);
      setSavedSlug(editingForm.slug);
      setSavedFormId(editingForm.id);
      setLinkedOfferId(editingForm.linked_offer_id || null);
      setLinkedStageId(editingForm.linked_stage_id || null);
      setAllowCreation(editingForm.allow_creation || false);
      Promise.all([
        supabase.from('external_form_fields').select('*').eq('form_id', editingForm.id).order('display_order'),
        (supabase.from as any)('external_form_pages').select('*').eq('form_id', editingForm.id).order('display_order'),
      ]).then(([fieldsRes, pagesRes]: any[]) => {
        if (fieldsRes.data) setFormFields(fieldsRes.data.map((f: any) => ({
          ...f, options: Array.isArray(f.options) ? f.options : [], only_for_new: f.only_for_new || false, page_id: f.page_id || null,
        })));
        if (pagesRes?.data) setPages(pagesRes.data.map((p: any) => ({
          id: p.id, persisted: true, title: p.title, description: p.description, display_order: p.display_order,
        })));
        else setPages([]);
      });
    } else {
      setName(''); setDescription(''); setFormType('update'); setStatus('draft');
      setAllowCreation(false); setAllowNameFallback(false);
      setVerificationMode('key_and_code'); setVerificationKeyField('nit');
      setCodeExpiration(10); setMaxAttempts(5); setFormFields([]); setPages([]);
      setPublicTitle(''); setPublicSubtitle(''); setSubmitButtonText('Enviar');
      setSuccessMessage('Tu información ha sido enviada exitosamente.');
      setPrimaryColor('#4f46e5'); setSavedSlug(''); setSavedFormId(null);
      setLinkedOfferId(null); setLinkedStageId(null);
    }
    setStep(0);
  }, [open, editingForm]);

  // Auto-scroll during drag
  const handleDragOverContainer = useCallback((e: React.DragEvent) => {
    if (dragIdx === null || !fieldListRef.current) return;
    const rect = fieldListRef.current.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const scrollZone = 60;

    if (dragScrollInterval.current) {
      clearInterval(dragScrollInterval.current);
      dragScrollInterval.current = null;
    }

    if (y < scrollZone) {
      dragScrollInterval.current = setInterval(() => {
        fieldListRef.current?.scrollBy(0, -8);
      }, 16);
    } else if (y > rect.height - scrollZone) {
      dragScrollInterval.current = setInterval(() => {
        fieldListRef.current?.scrollBy(0, 8);
      }, 16);
    }
  }, [dragIdx]);

  const handleDragStart = (idx: number) => {
    setDragIdx(idx);
  };
  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    setDragOverIdx(idx);
  };
  const handleDragEnd = () => {
    if (dragIdx !== null && dragOverIdx !== null && dragIdx !== dragOverIdx) {
      setFormFields(prev => {
        const items = [...prev];
        const [moved] = items.splice(dragIdx, 1);
        items.splice(dragOverIdx, 0, moved);
        return items.map((f, i) => ({ ...f, display_order: i }));
      });
    }
    setDragIdx(null);
    setDragOverIdx(null);
    if (dragScrollInterval.current) {
      clearInterval(dragScrollInterval.current);
      dragScrollInterval.current = null;
    }
  };

  const addField = () => {
    setFormFields(prev => [...prev, {
      label: '', field_key: '', field_type: 'short_text', placeholder: '', help_text: '',
      section_name: '', is_required: false, is_visible: true, is_editable: true, is_readonly: false,
      preload_from_crm: false, crm_table: null, crm_column: null, crm_field_id: null,
      options: [], display_order: prev.length,
      condition_field_key: null, condition_value: null, only_for_new: false
    }]);
  };

  const addCrmField = (mapping: typeof CRM_FIELD_MAPPINGS[0]) => {
    const key = `${mapping.table}_${mapping.column}`;
    if (formFields.find(f => f.field_key === key)) return;
    // Auto-detect field type based on column
    let fieldType: FormFieldType = 'short_text';
    if (mapping.column === 'logo') fieldType = 'file';
    else if (mapping.column === 'sales_by_year') fieldType = 'sales_by_year';
    else if (mapping.column === 'exports_usd') fieldType = 'number';
    else if (mapping.column === 'description') fieldType = 'long_text';
    else if (mapping.column === 'website') fieldType = 'url';
    else if (mapping.column === 'email') fieldType = 'email';
    else if (mapping.column === 'phone') fieldType = 'phone';

    setFormFields(prev => [...prev, {
      label: mapping.label, field_key: key, field_type: fieldType, placeholder: '', help_text: '',
      section_name: '', is_required: false, is_visible: true, is_editable: true, is_readonly: false,
      preload_from_crm: true, crm_table: mapping.table, crm_column: mapping.column, crm_field_id: null,
      options: [], display_order: prev.length,
      condition_field_key: null, condition_value: null, only_for_new: false
    }]);
  };

  const addCustomCrmField = (cf: any) => {
    const key = `custom_${cf.id}`;
    if (formFields.find(f => f.field_key === key)) return;
    const sectionName = customSections.find(s => s.id === cf.sectionId)?.name || '';
    setFormFields(prev => [...prev, {
      label: cf.name, field_key: key, field_type: cf.fieldType === 'number' ? 'number' : cf.fieldType === 'select' ? 'select' : 'short_text',
      placeholder: '', help_text: '', section_name: sectionName,
      is_required: false, is_visible: true, is_editable: true, is_readonly: false,
      preload_from_crm: true, crm_table: 'custom_field_values', crm_column: null, crm_field_id: cf.id,
      options: cf.options || [], display_order: prev.length,
      condition_field_key: null, condition_value: null, only_for_new: false
    }]);
  };

  const updateField = (idx: number, updates: Partial<FieldDraft>) => {
    setFormFields(prev => prev.map((f, i) => i === idx ? { ...f, ...updates } : f));
  };

  const removeField = (idx: number) => {
    setFormFields(prev => prev.filter((_, i) => i !== idx));
  };

  const handleCreateSection = async () => {
    if (!newSectionName.trim()) return;
    const section = await addSection(newSectionName.trim());
    if (section) {
      showSuccess('Sección creada', `"${section.name}" se creó en el CRM y estará disponible en el perfil de todas las empresas`);
      setNewSectionName('');
      setShowNewSectionDialog(false);
    } else {
      showError('Error', 'No se pudo crear la sección');
    }
  };

  const handleCreateNewCrmField = async () => {
    if (!newFieldName.trim()) { showError('Error', 'El nombre del campo es obligatorio'); return; }
    if (!newFieldSection) { showError('Error', 'Selecciona una sección'); return; }

    const sectionObj = customSections.find(s => s.id === newFieldSection);
    if (!sectionObj) { showError('Error', 'Sección no encontrada'); return; }

    const crmFieldType = newFieldType === 'number' ? 'number' : newFieldType === 'select' ? 'select' : 'text';
    const opts = newFieldType === 'select' ? newFieldOptions.split(',').map(s => s.trim()).filter(Boolean) : [];

    const created = await addCustomField({
      sectionId: newFieldSection,
      name: newFieldName.trim(),
      fieldType: crmFieldType as any,
      options: opts,
      displayOrder: 0,
    });

    if (created) {
      const key = `custom_${created.id}`;
      setFormFields(prev => [...prev, {
        label: created.name, field_key: key,
        field_type: newFieldType === 'number' ? 'number' : newFieldType === 'select' ? 'select' : 'short_text' as FormFieldType,
        placeholder: '', help_text: '', section_name: sectionObj.name,
        is_required: false, is_visible: true, is_editable: true, is_readonly: false,
        preload_from_crm: true, crm_table: 'custom_field_values', crm_column: null, crm_field_id: created.id,
        options: opts, display_order: prev.length,
        condition_field_key: null, condition_value: null, only_for_new: false
      }]);

      showSuccess('Campo creado', `"${created.name}" se añadió al CRM (sección "${sectionObj.name}") y al formulario`);
      setNewFieldName('');
      setNewFieldType('text');
      setNewFieldSection('');
      setNewFieldOptions('');
      setShowNewFieldDialog(false);
    } else {
      showError('Error', 'No se pudo crear el campo');
    }
  };

  const customFieldsBySection = useMemo(() => {
    const map: Record<string, { section: typeof customSections[0]; fields: typeof customFields }> = {};
    for (const s of customSections) {
      const sFields = customFields.filter(f => f.sectionId === s.id);
      if (sFields.length > 0) {
        map[s.id] = { section: s, fields: sFields };
      }
    }
    const unsectioned = customFields.filter(f => !f.sectionId);
    if (unsectioned.length > 0) {
      map['__none'] = { section: { id: '__none', name: 'Sin sección', displayOrder: 999 } as any, fields: unsectioned };
    }
    return map;
  }, [customSections, customFields]);

  const conditionalSourceFields = useMemo(() => {
    return formFields.filter(f =>
      f.field_type === 'select' || f.field_type === 'checkbox' || f.field_type === 'multiselect'
    );
  }, [formFields]);

  // Show "only for new" option when form allows both existing + new companies
  const showOnlyForNew = (formType === 'update' || formType === 'collection') && allowCreation;

  // Extended field type options (add 'file' if not present)
  const extendedFieldTypeOptions = useMemo(() => {
    const has = FIELD_TYPE_OPTIONS.some(o => o.value === 'file');
    return has ? FIELD_TYPE_OPTIONS : [...FIELD_TYPE_OPTIONS, { value: 'file' as FormFieldType, label: 'Archivo / Logo' }];
  }, []);

  const handleSave = async () => {
    if (!name.trim()) { showError('Error', 'El nombre es obligatorio'); return; }
    setSaving(true);

    try {
      const slug = savedSlug || crypto.randomUUID().slice(0, 12);
      const formData: any = {
        slug, name, description, form_type: formType, status,
        verification_mode: verificationMode, verification_key_field: verificationKeyField,
        code_expiration_minutes: codeExpiration, max_code_attempts: maxAttempts,
        public_title: publicTitle, public_subtitle: publicSubtitle,
        submit_button_text: submitButtonText, success_message: successMessage,
        primary_color: primaryColor, created_by: session?.user?.id,
        linked_offer_id: linkedOfferId || null,
        linked_stage_id: linkedStageId || null,
        allow_creation: allowCreation,
        allow_name_fallback: allowNameFallback,
      };

      let formId: string;
      if (savedFormId) {
        const { error } = await supabase.from('external_forms').update(formData).eq('id', savedFormId);
        if (error) throw error;
        formId = savedFormId;
        await supabase.from('external_form_fields').delete().eq('form_id', formId);
      } else {
        const { data, error } = await supabase.from('external_forms').insert(formData).select('id, slug').single();
        if (error) throw error;
        formId = data!.id;
        setSavedSlug(data!.slug);
        setSavedFormId(formId);
      }

      if (formFields.length > 0) {
        const fieldsToInsert = formFields.map((f, i) => ({
          form_id: formId, label: f.label, field_key: f.field_key || f.label.toLowerCase().replace(/\s+/g, '_'),
          field_type: f.field_type, placeholder: f.placeholder, help_text: f.help_text, section_name: f.section_name,
          is_required: f.is_required, is_visible: f.is_visible, is_editable: f.is_editable, is_readonly: f.is_readonly,
          preload_from_crm: f.preload_from_crm, crm_table: f.crm_table, crm_column: f.crm_column,
          crm_field_id: f.crm_field_id, options: f.options, display_order: i,
          condition_field_key: f.condition_field_key || null,
          condition_value: f.condition_value || null,
          only_for_new: f.only_for_new || false,
        }));
        const { error } = await supabase.from('external_form_fields').insert(fieldsToInsert as any);
        if (error) throw error;
      }

      showSuccess('Guardado', savedFormId ? 'Formulario actualizado' : 'Formulario creado');
      onSaved();
      if (step < 5) setStep(5);
    } catch (e: any) {
      showError('Error', e.message);
    } finally {
      setSaving(false);
    }
  };

  const formUrl = savedSlug ? `${window.location.origin}/form/${savedSlug}` : '';

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingForm ? 'Editar formulario' : 'Crear formulario'}</DialogTitle>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-1 mb-4">
          {STEPS.map((s, i) => (
            <button key={i} onClick={() => setStep(i)}
              className={cn('text-[11px] px-2 py-1 rounded-full transition-colors', i === step ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80')}>
              {i + 1}. {s}
            </button>
          ))}
        </div>

        <Separator className="mb-4" />

        {/* Step 1: General Info */}
        {step === 0 && (
          <div className="space-y-4">
            <div>
              <Label>Nombre interno *</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ej: Actualización datos Q1 2026" />
            </div>
            <div>
              <Label>Descripción interna</Label>
              <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Descripción para uso interno..." rows={2} />
            </div>
            <div>
              <Label>Tipo de formulario</Label>
              <Select value={formType} onValueChange={v => { setFormType(v as FormType); if (v === 'creation') setAllowCreation(false); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="update">Actualización — la empresa actualiza info existente</SelectItem>
                  <SelectItem value="collection">Recopilación — solicitar nueva info a empresa existente</SelectItem>
                  <SelectItem value="creation">Creación — registrar empresa nueva</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {(formType === 'update' || formType === 'collection') && (
              <div className="flex items-center gap-2 rounded-md border p-3 bg-muted/30">
                <Checkbox checked={allowCreation} onCheckedChange={v => setAllowCreation(!!v)} id="allow-creation" />
                <div>
                  <label htmlFor="allow-creation" className="text-sm font-medium cursor-pointer">Permitir también crear empresas nuevas</label>
                  <p className="text-[11px] text-muted-foreground">Si el NIT no existe en el CRM, permite crear la empresa desde el formulario. Los campos marcados como "Editable solo nuevas" serán visibles para todos pero solo editables para empresas nuevas.</p>
                </div>
              </div>
            )}
            <div>
              <Label>Estado inicial</Label>
              <Select value={status} onValueChange={v => setStatus(v as FormStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Borrador</SelectItem>
                  <SelectItem value="active">Activo</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Offer/Pipeline linking */}
            <Separator />
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Link2 className="h-4 w-4 text-primary" />
                <Label className="text-sm font-medium">Vincular a oferta y pipeline</Label>
              </div>
              <p className="text-[11px] text-muted-foreground">Al enviar el formulario, la empresa se agregará o moverá automáticamente a la etapa seleccionada del pipeline.</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-[11px]">Oferta</Label>
                  <Select value={linkedOfferId || '__none'} onValueChange={v => { setLinkedOfferId(v === '__none' ? null : v); setLinkedStageId(null); }}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Sin vincular" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">Sin vincular</SelectItem>
                      {offers.map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[11px]">Etapa del pipeline</Label>
                  <Select value={linkedStageId || '__none'} onValueChange={v => setLinkedStageId(v === '__none' ? null : v)} disabled={!linkedOfferId}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Seleccionar etapa..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">Sin etapa</SelectItem>
                      {filteredStages.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Verification */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <Label>Modo de verificación</Label>
              <Select value={verificationMode} onValueChange={v => setVerificationMode(v as VerificationMode)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin verificación</SelectItem>
                  <SelectItem value="key_only">Solo llave (NIT)</SelectItem>
                  <SelectItem value="key_and_code">Llave + código por email (recomendado)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {verificationMode !== 'none' && (
              <>
                <div>
                  <Label>Campo llave</Label>
                  <Select value={verificationKeyField} onValueChange={setVerificationKeyField}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="nit">NIT</SelectItem>
                      <SelectItem value="legal_name">Razón social</SelectItem>
                      <SelectItem value="email">Email</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground mt-1">La empresa usará este campo para identificarse</p>
                </div>
                {verificationKeyField === 'nit' && (
                  <div className="flex items-center gap-2 rounded-md border p-3 bg-muted/30">
                    <Checkbox checked={allowNameFallback} onCheckedChange={v => setAllowNameFallback(!!v)} id="allow-name-fallback" />
                    <div>
                      <label htmlFor="allow-name-fallback" className="text-sm font-medium cursor-pointer">Permitir identificarse sin NIT</label>
                      <p className="text-[11px] text-muted-foreground">Muestra un checkbox "No tengo NIT" en el formulario público. La empresa podrá identificarse por razón social o nombre comercial.</p>
                    </div>
                  </div>
                )}
                {verificationMode === 'key_and_code' && (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Expiración del código (minutos)</Label>
                        <Input type="number" value={codeExpiration} onChange={e => setCodeExpiration(Number(e.target.value))} min={1} max={60} />
                      </div>
                      <div>
                        <Label>Máximo de intentos</Label>
                        <Input type="number" value={maxAttempts} onChange={e => setMaxAttempts(Number(e.target.value))} min={1} max={10} />
                      </div>
                    </div>
                    <div className="rounded-md bg-blue-50 dark:bg-blue-950/30 p-3 text-xs text-blue-700 dark:text-blue-300">
                      El código se enviará al email del contacto principal registrado en el CRM. Se mostrará el email enmascarado (ej: ca***@empresa.com).
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        )}

        {/* Step 3: Field Builder */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Campos del formulario ({formFields.length})</Label>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" onClick={() => setShowNewSectionDialog(true)}>
                  <FolderPlus className="h-3 w-3 mr-1" /> Nueva sección CRM
                </Button>
                <Button variant="outline" size="sm" onClick={() => setShowNewFieldDialog(true)}>
                  <Layers className="h-3 w-3 mr-1" /> Nuevo campo CRM
                </Button>
                <Button variant="outline" size="sm" onClick={addField}>
                  <Plus className="h-3 w-3 mr-1" /> Campo libre
                </Button>
              </div>
            </div>

            {/* Quick add from CRM - at top for visibility */}
            <div className="rounded-md border p-3">
              <p className="text-[11px] font-medium text-muted-foreground mb-2">Agregar campos del CRM</p>
              <div className="flex flex-wrap gap-1">
                {CRM_FIELD_MAPPINGS.map(m => (
                  <Button key={`${m.table}_${m.column}`} variant="outline" size="sm" className="h-6 text-[10px] px-2"
                    onClick={() => addCrmField(m)} disabled={formFields.some(f => f.field_key === `${m.table}_${m.column}`)}>
                    {m.label}
                  </Button>
                ))}
              </div>
              {Object.keys(customFieldsBySection).length > 0 && (
                <>
                  {Object.entries(customFieldsBySection).map(([sId, { section, fields: sFields }]) => (
                    <div key={sId}>
                      <p className="text-[11px] font-medium text-muted-foreground mt-3 mb-2">{section.name}</p>
                      <div className="flex flex-wrap gap-1">
                        {sFields.map(cf => (
                          <Button key={cf.id} variant="outline" size="sm" className="h-6 text-[10px] px-2"
                            onClick={() => addCustomCrmField(cf)} disabled={formFields.some(f => f.field_key === `custom_${cf.id}`)}>
                            {cf.name}
                          </Button>
                        ))}
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>

            {/* New Section Dialog (inline) */}
            {showNewSectionDialog && (
              <div className="rounded-md border-2 border-primary/30 bg-primary/5 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <FolderPlus className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">Crear nueva sección en el CRM</span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Esta sección se creará en el CRM y aparecerá como una pestaña en el perfil de todas las empresas.
                </p>
                <div className="flex gap-2">
                  <Input value={newSectionName} onChange={e => setNewSectionName(e.target.value)} placeholder="Ej: Inversión, Mercado, Tecnología..."
                    className="h-8 text-xs" onKeyDown={e => e.key === 'Enter' && handleCreateSection()} />
                  <Button size="sm" className="h-8" onClick={handleCreateSection}>Crear</Button>
                  <Button size="sm" variant="ghost" className="h-8" onClick={() => { setShowNewSectionDialog(false); setNewSectionName(''); }}>Cancelar</Button>
                </div>
              </div>
            )}

            {/* New CRM Field Dialog (inline) */}
            {showNewFieldDialog && (
              <div className="rounded-md border-2 border-primary/30 bg-primary/5 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Layers className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">Crear nuevo campo en el CRM y agregarlo al formulario</span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Este campo se creará en el CRM (visible en el perfil de todas las empresas) y se agregará automáticamente a este formulario.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[11px]">Nombre del campo *</Label>
                    <Input value={newFieldName} onChange={e => setNewFieldName(e.target.value)} placeholder="Ej: Monto inversión, Mercado objetivo..." className="h-8 text-xs" />
                  </div>
                  <div>
                    <Label className="text-[11px]">Sección *</Label>
                    <Select value={newFieldSection} onValueChange={setNewFieldSection}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Seleccionar sección..." /></SelectTrigger>
                      <SelectContent>
                        {customSections.map(s => (
                          <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[11px]">Tipo de campo</Label>
                    <Select value={newFieldType} onValueChange={setNewFieldType}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="text">Texto</SelectItem>
                        <SelectItem value="number">Número</SelectItem>
                        <SelectItem value="select">Selección</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {newFieldType === 'select' && (
                    <div>
                      <Label className="text-[11px]">Opciones (separadas por coma)</Label>
                      <Input value={newFieldOptions} onChange={e => setNewFieldOptions(e.target.value)} placeholder="Opción 1, Opción 2..." className="h-8 text-xs" />
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" className="h-8" onClick={handleCreateNewCrmField}>Crear campo y agregar</Button>
                  <Button size="sm" variant="ghost" className="h-8" onClick={() => { setShowNewFieldDialog(false); setNewFieldName(''); setNewFieldType('text'); setNewFieldSection(''); setNewFieldOptions(''); }}>Cancelar</Button>
                </div>
              </div>
            )}

            {/* Field list with drag and drop + auto-scroll */}
            <div
              ref={fieldListRef}
              className="space-y-3 max-h-[350px] overflow-y-auto"
              onDragOver={handleDragOverContainer}
              onDragLeave={() => {
                if (dragScrollInterval.current) { clearInterval(dragScrollInterval.current); dragScrollInterval.current = null; }
              }}
            >
              {formFields.map((field, idx) => (
                <div key={idx}
                  draggable
                  onDragStart={() => handleDragStart(idx)}
                  onDragOver={(e) => handleDragOver(e, idx)}
                  onDragEnd={handleDragEnd}
                  className={cn(
                    "rounded-md border p-3 space-y-2 transition-all",
                    dragIdx === idx && "opacity-50",
                    dragOverIdx === idx && dragIdx !== idx && "border-primary border-2"
                  )}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <GripVertical className="h-3.5 w-3.5 text-muted-foreground cursor-grab active:cursor-grabbing" />
                      <span className="text-xs font-medium">Campo {idx + 1}</span>
                      {field.preload_from_crm && <Badge variant="outline" className="text-[9px]">CRM</Badge>}
                      {field.section_name && <Badge variant="secondary" className="text-[9px]">{field.section_name}</Badge>}
                      {field.condition_field_key && <Badge variant="outline" className="text-[9px] bg-amber-50 text-amber-700 border-amber-200">Condicional</Badge>}
                      {field.only_for_new && <Badge variant="outline" className="text-[9px] bg-emerald-50 text-emerald-700 border-emerald-200">Editable solo nuevas</Badge>}
                    </div>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeField(idx)}>
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-[11px]">Label</Label>
                      <Input className="h-8 text-xs" value={field.label} onChange={e => updateField(idx, { label: e.target.value })} />
                    </div>
                    <div>
                      <Label className="text-[11px]">Tipo</Label>
                      <Select value={field.field_type} onValueChange={v => updateField(idx, { field_type: v as FormFieldType })}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {extendedFieldTypeOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-[11px]">Placeholder</Label>
                      <Input className="h-8 text-xs" value={field.placeholder} onChange={e => updateField(idx, { placeholder: e.target.value })} />
                    </div>
                    <div>
                      <Label className="text-[11px]">Sección</Label>
                      <Select value={field.section_name || '__none'} onValueChange={v => updateField(idx, { section_name: v === '__none' ? '' : v })}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none">Sin sección</SelectItem>
                          {customSections.map(s => (
                            <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {(field.field_type === 'select' || field.field_type === 'multiselect') && (
                    <div>
                      <Label className="text-[11px]">Opciones (separadas por coma)</Label>
                      <Input className="h-8 text-xs" value={field.options.join(', ')}
                        onChange={e => updateField(idx, { options: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} />
                    </div>
                  )}
                  {field.field_type === 'file' && (
                    <div className="rounded-md bg-blue-50 dark:bg-blue-950/30 p-2 text-[10px] text-blue-700 dark:text-blue-300">
                      El campo de archivo permite al usuario subir un archivo o pegar una imagen con Ctrl+V (ideal para logos).
                    </div>
                  )}
                  {/* Conditional logic */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-[11px]">Mostrar solo si campo...</Label>
                      <Select value={field.condition_field_key || '__none'} onValueChange={v => updateField(idx, { condition_field_key: v === '__none' ? null : v, condition_value: v === '__none' ? null : field.condition_value })}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Sin condición" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none">Sin condición</SelectItem>
                          {conditionalSourceFields.filter(f => f.field_key !== field.field_key && f.field_key).map(f => (
                            <SelectItem key={f.field_key} value={f.field_key}>{f.label || f.field_key}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {field.condition_field_key && (
                      <div>
                        <Label className="text-[11px]">...tiene valor</Label>
                        {(() => {
                          const sourceField = formFields.find(f => f.field_key === field.condition_field_key);
                          if (sourceField?.field_type === 'checkbox') {
                            return (
                              <Select value={field.condition_value || 'true'} onValueChange={v => updateField(idx, { condition_value: v })}>
                                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="true">Sí (marcado)</SelectItem>
                                  <SelectItem value="false">No (desmarcado)</SelectItem>
                                </SelectContent>
                              </Select>
                            );
                          }
                          if (sourceField && (sourceField.field_type === 'select' || sourceField.field_type === 'multiselect') && sourceField.options.length > 0) {
                            return (
                              <Select value={field.condition_value || ''} onValueChange={v => updateField(idx, { condition_value: v })}>
                                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Seleccionar valor..." /></SelectTrigger>
                                <SelectContent>
                                  {sourceField.options.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            );
                          }
                          return <Input className="h-8 text-xs" value={field.condition_value || ''} onChange={e => updateField(idx, { condition_value: e.target.value })} placeholder="Valor esperado" />;
                        })()}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-[11px]">
                    <label className="flex items-center gap-1.5">
                      <Checkbox checked={field.is_required} onCheckedChange={v => updateField(idx, { is_required: !!v })} className="h-3.5 w-3.5" />
                      Obligatorio
                    </label>
                    <label className="flex items-center gap-1.5">
                      <Checkbox checked={field.is_visible} onCheckedChange={v => updateField(idx, { is_visible: !!v })} className="h-3.5 w-3.5" />
                      Visible
                    </label>
                    {showOnlyForNew && (
                      <label className="flex items-center gap-1.5" title="El campo será visible para todos pero solo editable para empresas nuevas (NIT no encontrado)">
                        <Checkbox checked={!!field.only_for_new} onCheckedChange={v => updateField(idx, { only_for_new: !!v })} className="h-3.5 w-3.5" />
                        Editable solo nuevas
                      </label>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step 4: Preload config */}
        {step === 3 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Configura cómo se precarga la información desde el CRM para cada campo.</p>
            {formFields.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">Agrega campos en el paso anterior primero.</p>
            ) : (
              <div className="rounded-md border overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted/50">
                      <th className="text-left p-2 font-medium">Campo</th>
                      <th className="text-center p-2 font-medium">Precargar</th>
                      <th className="text-center p-2 font-medium">Editable</th>
                      <th className="text-center p-2 font-medium">Solo lectura</th>
                      <th className="text-center p-2 font-medium">Obligatorio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {formFields.map((field, idx) => (
                      <tr key={idx} className="border-t">
                        <td className="p-2">
                          <span className="font-medium">{field.label || `Campo ${idx + 1}`}</span>
                          {field.crm_table && <Badge variant="outline" className="ml-1 text-[9px]">CRM</Badge>}
                        </td>
                        <td className="text-center p-2">
                          <Checkbox checked={field.preload_from_crm} className="h-3.5 w-3.5"
                            onCheckedChange={v => updateField(idx, { preload_from_crm: !!v })}
                            disabled={!field.crm_table} />
                        </td>
                        <td className="text-center p-2">
                          <Checkbox checked={field.is_editable && !field.is_readonly} className="h-3.5 w-3.5"
                            onCheckedChange={v => updateField(idx, { is_editable: !!v, is_readonly: !v })} />
                        </td>
                        <td className="text-center p-2">
                          <Checkbox checked={field.is_readonly} className="h-3.5 w-3.5"
                            onCheckedChange={v => updateField(idx, { is_readonly: !!v, is_editable: !v })} />
                        </td>
                        <td className="text-center p-2">
                          <Checkbox checked={field.is_required} className="h-3.5 w-3.5"
                            onCheckedChange={v => updateField(idx, { is_required: !!v })} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Step 5: Design */}
        {step === 4 && (
          <div className="space-y-4">
            <div>
              <Label>Título público del formulario</Label>
              <Input value={publicTitle} onChange={e => setPublicTitle(e.target.value)} placeholder="Ej: Actualización de datos empresariales" />
            </div>
            <div>
              <Label>Subtítulo / introducción</Label>
              <Textarea value={publicSubtitle} onChange={e => setPublicSubtitle(e.target.value)} placeholder="Texto introductorio..." rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Texto del botón de envío</Label>
                <Input value={submitButtonText} onChange={e => setSubmitButtonText(e.target.value)} />
              </div>
              <div>
                <Label>Color primario</Label>
                <div className="flex items-center gap-2">
                  <input type="color" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)} className="h-9 w-12 rounded border cursor-pointer" />
                  <Input value={primaryColor} onChange={e => setPrimaryColor(e.target.value)} className="flex-1" />
                </div>
              </div>
            </div>
            <div>
              <Label>Mensaje de confirmación</Label>
              <Textarea value={successMessage} onChange={e => setSuccessMessage(e.target.value)} rows={2} />
            </div>
          </div>
        )}

        {/* Step 6: Publish */}
        {step === 5 && (
          <div className="space-y-4">
            {savedSlug ? (
              <>
                <div className="rounded-md bg-emerald-50 dark:bg-emerald-950/30 p-4 text-center">
                  <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300 mb-2">
                    {editingForm ? 'Formulario actualizado' : '¡Formulario creado!'}
                  </p>
                  <div className="flex items-center gap-2 justify-center">
                    <code className="text-xs bg-background px-2 py-1 rounded border">{formUrl}</code>
                    <Button size="sm" variant="outline" className="h-7" onClick={() => { navigator.clipboard.writeText(formUrl); showSuccess('Copiado', 'Enlace copiado'); }}>
                      <Copy className="h-3 w-3 mr-1" /> Copiar
                    </Button>
                    <Button size="sm" variant="outline" className="h-7" onClick={() => window.open(formUrl, '_blank')}>
                      <ExternalLink className="h-3 w-3 mr-1" /> Abrir
                    </Button>
                  </div>
                </div>
                {linkedOfferId && linkedStageId && (
                  <div className="rounded-md bg-blue-50 dark:bg-blue-950/30 p-3 text-xs text-blue-700 dark:text-blue-300 text-center">
                    <Link2 className="h-3.5 w-3.5 inline mr-1" />
                    Las empresas que envíen este formulario serán agregadas/movidas automáticamente al pipeline vinculado.
                  </div>
                )}
                <p className="text-xs text-muted-foreground text-center">
                  Recuerda activar el formulario para que sea accesible públicamente.
                </p>
              </>
            ) : (
              <div className="text-center py-8">
                <p className="text-sm text-muted-foreground">Guarda el formulario para generar el enlace público.</p>
              </div>
            )}
          </div>
        )}

        <Separator className="my-4" />

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}>
            <ChevronLeft className="h-3.5 w-3.5 mr-1" /> Anterior
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
            {step < 5 ? (
              <Button size="sm" onClick={() => setStep(step + 1)}>
                Siguiente <ChevronRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            ) : null}
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? 'Guardando...' : 'Guardar formulario'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
