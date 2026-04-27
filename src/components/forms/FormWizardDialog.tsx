import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ArrowLeft, Check, Sparkles, X as XIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Toggle } from '@/components/ui/toggle';
import { Database, EyeOff, Eye, Lock, AlertCircle, UserPlus, Download, ChevronDown, Settings2, Wand2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/lib/toast';
import { useAuth } from '@/hooks/useAuth';
import {
  ExternalForm, FormType, FormStatus, VerificationMode,
  FormFieldType, FORM_TYPE_LABELS, FIELD_TYPE_OPTIONS, CRM_FIELD_MAPPINGS,
  DynamicKind, DynamicConfig, DynamicOperationType
} from '@/types/externalForms';
import { useCustomFields } from '@/contexts/CustomFieldsContext';
import { useCrmLayoutSettings } from '@/hooks/useCrmLayoutSettings';
import { useTaxonomy } from '@/contexts/TaxonomyContext';
import { CATEGORIES, CITIES } from '@/types/crm';
import { ChevronLeft, ChevronRight, Plus, Trash2, GripVertical, Copy, ExternalLink, FolderPlus, Layers, Link2, BookOpen, ArrowUp, ArrowDown, FileText, Calculator, Bot, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import FormAIBuilderChat, { AutoChange, PendingProposal } from './FormAIBuilderChat';
import { buildCrmCatalog } from '@/lib/formAICatalog';
import { evaluateOperation, formatDynamicResult, getOperationInputKeys } from '@/lib/dynamicFields';

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
  default_value?: string;
  default_value_editable?: boolean;
  is_dynamic?: boolean;
  dynamic_kind?: DynamicKind | null;
  dynamic_config?: DynamicConfig;
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
  const { fields: customFields, sections: customSections, addSection, addField: addCustomField, updateField: updateCustomField, updateSection: updateCustomSection } = useCustomFields();
  const { unsectionedLabel, setUnsectionedLabel } = useCrmLayoutSettings();
  const taxonomy = useTaxonomy();
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

  // Dynamic field dialog
  const [showDynamicDialog, setShowDynamicDialog] = useState(false);
  const [dynKind, setDynKind] = useState<DynamicKind>('operation');
  const [dynLabel, setDynLabel] = useState('');
  const [dynSection, setDynSection] = useState('');
  const [dynVisibleToUser, setDynVisibleToUser] = useState(false);
  // operation config
  const [dynMode, setDynMode] = useState<'simple' | 'formula'>('simple');
  const [dynOp, setDynOp] = useState<DynamicOperationType>('multiply');
  const [dynInputA, setDynInputA] = useState('');
  const [dynInputB, setDynInputB] = useState('');
  const [dynFormula, setDynFormula] = useState('');
  const [dynDecimals, setDynDecimals] = useState(2);
  const [dynSuffix, setDynSuffix] = useState('');
  // generation config
  const [dynGenInputs, setDynGenInputs] = useState<string[]>([]);
  const [dynPrompt, setDynPrompt] = useState('');

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
        if (fieldsRes.data) setFormFields(fieldsRes.data.map((f: any) => {
          const liveOpts = getLiveCrmOptions(f.crm_table, f.crm_column);
          const isTax = isTaxonomyDriven(f.crm_table, f.crm_column);
          return {
            ...f,
            options: liveOpts ?? (Array.isArray(f.options) ? f.options : []),
            field_type: isTax ? 'select' : f.field_type,
            only_for_new: f.only_for_new || false,
            page_id: f.page_id || null,
            default_value: f.default_value ?? '',
            default_value_editable: f.default_value_editable ?? true,
            is_dynamic: f.is_dynamic || false,
            dynamic_kind: f.dynamic_kind || null,
            dynamic_config: f.dynamic_config || {},
          };
        }));
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
      condition_field_key: null, condition_value: null, only_for_new: false,
      default_value: '', default_value_editable: true,
    }]);
  };

  // Live options for taxonomy/CRM-driven fields. Always recomputed so the wizard
  // reflects the current CRM taxonomy regardless of when the field was added.
  const getLiveCrmOptions = (table: string | null, column: string | null): string[] | null => {
    if (table !== 'companies') return null;
    if (column === 'category') {
      const opts = taxonomy.allCategories || [];
      return opts.length > 0 ? opts : [...CATEGORIES];
    }
    if (column === 'vertical') return taxonomy.getAllVerticalNames();
    if (column === 'economic_activity') return taxonomy.getAllSubVerticalNames();
    if (column === 'city') return [...CITIES];
    return null;
  };

  const isTaxonomyDriven = (table: string | null, column: string | null) =>
    table === 'companies' && (column === 'category' || column === 'vertical' || column === 'economic_activity' || column === 'city');

  const addCrmField = (mapping: typeof CRM_FIELD_MAPPINGS[0]) => {
    const key = `${mapping.table}_${mapping.column}`;
    if (formFields.find(f => f.field_key === key)) return;
    // Auto-detect field type based on column
    let fieldType: FormFieldType = 'short_text';
    let options: string[] = [];
    if (mapping.column === 'logo') fieldType = 'file';
    else if (mapping.column === 'sales_by_year') fieldType = 'sales_by_year';
    else if (mapping.column === 'exports_usd') fieldType = 'number';
    else if (mapping.column === 'description') fieldType = 'long_text';
    else if (mapping.column === 'website') fieldType = 'url';
    else if (mapping.column === 'email') fieldType = 'email';
    else if (mapping.column === 'phone') fieldType = 'phone';
    // Taxonomy-driven selects (mirror CRM CompanyForm behavior)
    const liveOpts = getLiveCrmOptions(mapping.table, mapping.column);
    if (liveOpts) {
      fieldType = 'select';
      options = liveOpts;
    }

    setFormFields(prev => [...prev, {
      label: mapping.label, field_key: key, field_type: fieldType, placeholder: '', help_text: '',
      section_name: '', is_required: false, is_visible: true, is_editable: true, is_readonly: false,
      preload_from_crm: true, crm_table: mapping.table, crm_column: mapping.column, crm_field_id: null,
      options, display_order: prev.length,
      condition_field_key: null, condition_value: null, only_for_new: false,
      default_value: '', default_value_editable: true,
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
      condition_field_key: null, condition_value: null, only_for_new: false,
      default_value: '', default_value_editable: true,
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
        condition_field_key: null, condition_value: null, only_for_new: false,
        default_value: '', default_value_editable: true,
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

  const resetDynamicForm = () => {
    setDynKind('operation'); setDynLabel(''); setDynSection('');
    setDynVisibleToUser(false); setDynMode('simple'); setDynOp('multiply');
    setDynInputA(''); setDynInputB(''); setDynFormula('');
    setDynDecimals(2); setDynSuffix('');
    setDynGenInputs([]); setDynPrompt('');
  };

  const handleCreateDynamicField = async () => {
    if (!dynLabel.trim()) { showError('Error', 'El nombre del campo es obligatorio'); return; }
    if (!dynSection) { showError('Error', 'Selecciona una sección del CRM'); return; }
    const sectionObj = customSections.find(s => s.id === dynSection);
    if (!sectionObj) { showError('Error', 'Sección no encontrada'); return; }

    let dynamic_config: DynamicConfig;
    if (dynKind === 'operation') {
      if (dynMode === 'simple') {
        if (!dynInputA || !dynInputB) { showError('Error', 'Selecciona los dos campos de entrada'); return; }
        dynamic_config = { mode: 'simple', op: dynOp, input_a: dynInputA, input_b: dynInputB, decimals: dynDecimals, suffix: dynSuffix };
      } else {
        if (!dynFormula.trim()) { showError('Error', 'Escribe la fórmula'); return; }
        const inputs = Array.from(new Set(Array.from(dynFormula.matchAll(/\{([a-zA-Z0-9_]+)\}/g)).map(m => m[1])));
        if (inputs.length === 0) { showError('Error', 'La fórmula debe usar al menos un {campo}'); return; }
        dynamic_config = { mode: 'formula', formula: dynFormula.trim(), inputs, decimals: dynDecimals, suffix: dynSuffix };
      }
    } else {
      if (dynGenInputs.length === 0) { showError('Error', 'Selecciona al menos un campo de entrada'); return; }
      if (!dynPrompt.trim()) { showError('Error', 'Escribe el prompt para la IA'); return; }
      dynamic_config = { inputs: dynGenInputs, prompt: dynPrompt.trim(), model: 'gpt-4o-mini' };
    }

    // Create a CRM custom field to permanently store the result
    const crmType = dynKind === 'operation' ? 'number' : 'text';
    const created = await addCustomField({
      sectionId: dynSection, name: dynLabel.trim(),
      fieldType: crmType as any, options: [], displayOrder: 0,
    });
    if (!created) { showError('Error', 'No se pudo crear el campo en el CRM'); return; }

    const formFieldType: FormFieldType = dynKind === 'operation' ? 'number' : 'long_text';
    // Generation fields are ALWAYS hidden from the user; operation respects dynVisibleToUser
    const isVisible = dynKind === 'operation' ? dynVisibleToUser : false;

    setFormFields(prev => [...prev, {
      label: dynLabel.trim(),
      field_key: `custom_${created.id}`,
      field_type: formFieldType,
      placeholder: '', help_text: '', section_name: sectionObj.name,
      is_required: false,
      is_visible: isVisible,
      is_editable: false,         // dynamic fields are never edited by user
      is_readonly: true,
      preload_from_crm: false,
      crm_table: 'custom_field_values', crm_column: null, crm_field_id: created.id,
      options: [], display_order: prev.length,
      condition_field_key: null, condition_value: null, only_for_new: false,
      default_value: '', default_value_editable: false,
      is_dynamic: true,
      dynamic_kind: dynKind,
      dynamic_config,
    }]);

    showSuccess('Campo dinámico creado', `"${dynLabel.trim()}" se calculará ${dynKind === 'operation' ? 'automáticamente' : 'con IA al enviar el formulario'} y se guardará en la sección "${sectionObj.name}"`);
    resetDynamicForm();
    setShowDynamicDialog(false);
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

  // === AI Builder helpers ===
  const crmCatalog = useMemo(
    () => buildCrmCatalog(customSections as any, customFields as any),
    [customSections, customFields]
  );

  const applyAutoChanges = useCallback((changes: AutoChange[]) => {
    for (const ch of changes) {
      const a = ch.args || {};
      try {
        if (ch.type === 'set_form_meta') {
          if (typeof a.name === 'string') setName(a.name);
          if (typeof a.description === 'string') setDescription(a.description);
          if (typeof a.public_title === 'string') setPublicTitle(a.public_title);
          if (typeof a.public_subtitle === 'string') setPublicSubtitle(a.public_subtitle);
          if (typeof a.success_message === 'string') setSuccessMessage(a.success_message);
          if (typeof a.submit_button_text === 'string') setSubmitButtonText(a.submit_button_text);
        } else if (ch.type === 'add_existing_crm_field') {
          const key: string = a.field_key;
          if (!key) continue;
          if (formFields.some(f => f.field_key === key)) {
            // Already in form, just update properties
            setFormFields(prev => prev.map(f => f.field_key === key ? {
              ...f,
              ...(typeof a.is_required === 'boolean' ? { is_required: a.is_required } : {}),
              ...(typeof a.is_visible === 'boolean' ? { is_visible: a.is_visible } : {}),
              ...(typeof a.preload_from_crm === 'boolean' ? { preload_from_crm: a.preload_from_crm } : {}),
              ...(typeof a.only_for_new === 'boolean' ? { only_for_new: a.only_for_new } : {}),
              ...(typeof a.help_text === 'string' ? { help_text: a.help_text } : {}),
              ...(a.page_id !== undefined ? { page_id: a.page_id } : {}),
            } : f));
            continue;
          }
          // Lookup in catalog
          const entry = crmCatalog.find(c => c.field_key === key);
          if (!entry) {
            console.warn('AI: field_key no encontrado en catálogo', key);
            continue;
          }
          if (entry.crm_field_id) {
            // custom field
            const cf = customFields.find(f => f.id === entry.crm_field_id);
            if (cf) addCustomCrmField(cf);
          } else if (entry.crm_table && entry.crm_column) {
            const m = CRM_FIELD_MAPPINGS.find(mm => mm.table === entry.crm_table && mm.column === entry.crm_column);
            if (m) addCrmField(m);
          }
          // Apply overrides after add
          setTimeout(() => {
            setFormFields(prev => prev.map(f => f.field_key === key ? {
              ...f,
              ...(typeof a.is_required === 'boolean' ? { is_required: a.is_required } : {}),
              ...(typeof a.is_visible === 'boolean' ? { is_visible: a.is_visible } : {}),
              ...(typeof a.preload_from_crm === 'boolean' ? { preload_from_crm: a.preload_from_crm } : {}),
              ...(typeof a.only_for_new === 'boolean' ? { only_for_new: a.only_for_new } : {}),
              ...(typeof a.help_text === 'string' ? { help_text: a.help_text } : {}),
              ...(a.page_id !== undefined ? { page_id: a.page_id } : {}),
            } : f));
          }, 0);
        } else if (ch.type === 'update_field') {
          const key: string = a.field_key;
          setFormFields(prev => prev.map(f => f.field_key === key ? {
            ...f,
            ...(typeof a.label === 'string' ? { label: a.label } : {}),
            ...(typeof a.placeholder === 'string' ? { placeholder: a.placeholder } : {}),
            ...(typeof a.help_text === 'string' ? { help_text: a.help_text } : {}),
            ...(typeof a.is_required === 'boolean' ? { is_required: a.is_required } : {}),
            ...(typeof a.is_visible === 'boolean' ? { is_visible: a.is_visible } : {}),
            ...(typeof a.is_editable === 'boolean' ? { is_editable: a.is_editable } : {}),
            ...(typeof a.is_readonly === 'boolean' ? { is_readonly: a.is_readonly } : {}),
            ...(typeof a.preload_from_crm === 'boolean' ? { preload_from_crm: a.preload_from_crm } : {}),
            ...(typeof a.only_for_new === 'boolean' ? { only_for_new: a.only_for_new } : {}),
            ...(typeof a.default_value === 'string' ? { default_value: a.default_value } : {}),
            ...(typeof a.default_value_editable === 'boolean' ? { default_value_editable: a.default_value_editable } : {}),
            ...(a.condition_field_key !== undefined ? { condition_field_key: a.condition_field_key } : {}),
            ...(a.condition_value !== undefined ? { condition_value: a.condition_value } : {}),
            ...(a.page_id !== undefined ? { page_id: a.page_id } : {}),
            ...(typeof a.section_name === 'string' ? { section_name: a.section_name } : {}),
          } : f));
        } else if (ch.type === 'reorder_fields') {
          const order: string[] = a.field_keys || [];
          setFormFields(prev => {
            const byKey = new Map(prev.map(f => [f.field_key, f]));
            const reordered: typeof prev = [];
            order.forEach(k => { const f = byKey.get(k); if (f) { reordered.push(f); byKey.delete(k); } });
            byKey.forEach(f => reordered.push(f));
            return reordered.map((f, i) => ({ ...f, display_order: i }));
          });
        } else if (ch.type === 'move_field') {
          const key: string = a.field_key;
          const refKey: string | null = a.reference_field_key ?? null;
          const position: 'before' | 'after' | 'start' | 'end' = a.position;
          setFormFields(prev => {
            const idx = prev.findIndex(f => f.field_key === key);
            if (idx === -1) return prev;
            const moving = prev[idx];
            const without = prev.filter((_, i) => i !== idx);
            let insertAt = without.length;
            if (position === 'start') insertAt = 0;
            else if (position === 'end') insertAt = without.length;
            else if (refKey) {
              const refIdx = without.findIndex(f => f.field_key === refKey);
              if (refIdx !== -1) insertAt = position === 'before' ? refIdx : refIdx + 1;
            }
            const next = [...without.slice(0, insertAt), moving, ...without.slice(insertAt)];
            return next.map((f, i) => ({ ...f, display_order: i }));
          });
        } else if (ch.type === 'add_page') {
          const newPage: PageDraft = {
            id: crypto.randomUUID(),
            persisted: false,
            title: a.title || 'Nueva página',
            description: a.description || '',
            display_order: pages.length,
          };
          setPages(prev => [...prev, newPage]);
        } else if (ch.type === 'update_page') {
          setPages(prev => prev.map(p => p.id === a.page_id ? {
            ...p,
            ...(typeof a.title === 'string' ? { title: a.title } : {}),
            ...(typeof a.description === 'string' ? { description: a.description } : {}),
          } : p));
        } else if (ch.type === 'add_form_only_field') {
          // Free form-only field (no CRM). Auto-applied.
          setFormFields(prev => [...prev, {
            label: a.label,
            field_key: (a.label || 'campo').toLowerCase().replace(/\s+/g, '_').replace(/[^\w_]/g, '') + '_' + Math.random().toString(36).slice(2, 6),
            field_type: a.field_type || 'short_text',
            placeholder: '', help_text: a.help_text || '', section_name: a.group_name || '',
            is_required: !!a.is_required, is_visible: true, is_editable: true, is_readonly: false,
            preload_from_crm: false, crm_table: null, crm_column: null, crm_field_id: null,
            options: a.options || [], display_order: prev.length,
            condition_field_key: a.condition_field_key || null,
            condition_value: a.condition_value || null,
            only_for_new: false, default_value: '', default_value_editable: true,
          }]);
        } else if (ch.type === 'delete_field') {
          // Auto only when origin is form_only (server already filtered CRM ones into proposals)
          setFormFields(prev => prev.filter(f => f.field_key !== a.field_key));
        }
      } catch (err) {
        console.error('Error applying AI change', ch, err);
      }
    }
  }, [formFields, pages, crmCatalog, customFields, addCrmField, addCustomCrmField]);

  const acceptProposal = useCallback(async (p: PendingProposal) => {
    const a = p.args || {};
    try {
      if (p.type === 'propose_new_section') {
        const section = await addSection(a.name);
        if (section) {
          showSuccess('Sección creada en CRM', `"${section.name}" disponible como pestaña en el perfil de empresas`);
        } else {
          showError('Error', 'No se pudo crear la sección');
        }
      } else if (p.type === 'propose_new_crm_field') {
        // target_section_name puede ser null/undefined → CRM principal sin sección
        const targetName: string | null = a.target_section_name || null;
        let sectionId: string | null = null;
        let sectionName = '';
        if (targetName) {
          let sectionObj = customSections.find(s => s.name.toLowerCase() === String(targetName).toLowerCase());
          if (!sectionObj) {
            const created = await addSection(targetName);
            if (created) sectionObj = created as any;
          }
          if (!sectionObj) {
            showError('Sección no encontrada', `No pude resolver la sección "${targetName}". Acepta primero la propuesta de sección.`);
            return;
          }
          sectionId = sectionObj.id;
          sectionName = sectionObj.name;
        }
        const crmType = a.field_type === 'number' ? 'number' : a.field_type === 'select' ? 'select' : 'text';
        const created = await addCustomField({
          sectionId,
          name: a.label,
          fieldType: crmType as any,
          options: a.options || [],
          displayOrder: 0,
        });
        if (created) {
          setFormFields(prev => [...prev, {
            label: created.name, field_key: `custom_${created.id}`,
            field_type: a.field_type === 'number' ? 'number' : a.field_type === 'select' ? 'select' : a.field_type === 'long_text' ? 'long_text' : 'short_text',
            placeholder: '', help_text: a.help_text || '', section_name: sectionName,
            is_required: !!a.is_required, is_visible: true, is_editable: true, is_readonly: false,
            preload_from_crm: true, crm_table: 'custom_field_values', crm_column: null, crm_field_id: created.id,
            options: a.options || [], display_order: prev.length,
            condition_field_key: a.condition_field_key || null,
            condition_value: a.condition_value || null,
            only_for_new: false, default_value: '', default_value_editable: true,
          }]);
          showSuccess(
            sectionName ? 'Campo creado en sección CRM' : 'Campo creado en CRM principal',
            sectionName
              ? `"${created.name}" → sección "${sectionName}". Visible en el perfil y en este formulario.`
              : `"${created.name}" disponible en el perfil bajo "Campos personalizados" y en este formulario.`
          );
        } else {
          showError('Error', 'No se pudo crear el campo en el CRM');
        }
      } else if (p.type === 'promote_field_to_crm') {
        const key: string = a.field_key;
        const field = formFields.find(f => f.field_key === key);
        if (!field) { showError('Error', `No encontré el campo "${key}"`); return; }
        if (field.crm_table) {
          showError('Ya está en CRM', `"${field.label}" ya está conectado al CRM.`);
          return;
        }
        const targetName: string | null = a.target_section_name || null;
        let sectionId: string | null = null;
        let sectionName = '';
        if (targetName) {
          let sectionObj = customSections.find(s => s.name.toLowerCase() === String(targetName).toLowerCase());
          if (!sectionObj) {
            const createdSec = await addSection(targetName);
            if (createdSec) sectionObj = createdSec as any;
          }
          if (!sectionObj) { showError('Sección no encontrada', `No pude resolver la sección "${targetName}".`); return; }
          sectionId = sectionObj.id;
          sectionName = sectionObj.name;
        }
        const crmType = field.field_type === 'number' ? 'number' : field.field_type === 'select' ? 'select' : 'text';
        const created = await addCustomField({
          sectionId, name: field.label,
          fieldType: crmType as any, options: field.options || [], displayOrder: 0,
        });
        if (created) {
          setFormFields(prev => prev.map(f => f.field_key === key ? {
            ...f, field_key: `custom_${created.id}`, section_name: sectionName,
            preload_from_crm: true, crm_table: 'custom_field_values', crm_field_id: created.id,
          } : f));
          showSuccess(
            'Campo promovido al CRM',
            sectionName
              ? `"${field.label}" ahora vive en la sección "${sectionName}" del CRM`
              : `"${field.label}" ahora vive en CRM principal y aparece en "Campos personalizados" del perfil`
          );
        }
      } else if (p.type === 'delete_field') {
        // CRM-backed field: remove from form only, do not delete in CRM
        const key: string = a.field_key;
        setFormFields(prev => prev.filter(f => f.field_key !== key));
        showSuccess('Campo quitado del formulario', `Sigue existiendo en el CRM. Para borrarlo del CRM hazlo desde Configuración > Campos personalizados.`);
      }
    } catch (err: any) {
      showError('Error', err.message || 'No se pudo aplicar la propuesta');
    }
  }, [addSection, addCustomField, customSections, formFields]);


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
        await (supabase.from as any)('external_form_pages').delete().eq('form_id', formId);
      } else {
        const { data, error } = await supabase.from('external_forms').insert(formData).select('id, slug').single();
        if (error) throw error;
        formId = data!.id;
        setSavedSlug(data!.slug);
        setSavedFormId(formId);
      }

      // Persist pages first so we can map local IDs -> persisted IDs for fields
      const localToPersistedPageId: Record<string, string> = {};
      if (pages.length > 0) {
        const pagesToInsert = pages.map((p, i) => ({
          form_id: formId, title: p.title, description: p.description, display_order: i,
        }));
        const { data: insertedPages, error: pagesErr } = await (supabase.from as any)('external_form_pages')
          .insert(pagesToInsert).select('id');
        if (pagesErr) throw pagesErr;
        pages.forEach((p, i) => { localToPersistedPageId[p.id] = (insertedPages as any[])[i].id; });
      }

      if (formFields.length > 0) {
        const fieldsToInsert = formFields.map((f, i) => {
          // Sync section_name to actual CRM section name when field is a custom CRM field
          let syncedSectionName = f.section_name;
          if (f.crm_field_id) {
            const cf = customFields.find(cf => cf.id === f.crm_field_id);
            const sec = cf ? customSections.find(s => s.id === cf.sectionId) : null;
            if (sec) syncedSectionName = sec.name;
          } else if (f.crm_table === 'companies' || f.crm_table === 'contacts') {
            // Native CRM fields belong to "Datos básicos", no custom section
            syncedSectionName = '';
          }
          return {
            form_id: formId, label: f.label, field_key: f.field_key || f.label.toLowerCase().replace(/\s+/g, '_'),
            field_type: f.field_type, placeholder: f.placeholder, help_text: f.help_text, section_name: syncedSectionName,
            is_required: f.is_required, is_visible: f.is_visible, is_editable: f.is_editable, is_readonly: f.is_readonly,
            preload_from_crm: f.preload_from_crm, crm_table: f.crm_table, crm_column: f.crm_column,
            crm_field_id: f.crm_field_id, options: getLiveCrmOptions(f.crm_table, f.crm_column) ?? f.options, display_order: i,
            condition_field_key: f.condition_field_key || null,
            condition_value: f.condition_value || null,
            only_for_new: f.only_for_new || false,
            page_id: f.page_id ? (localToPersistedPageId[f.page_id] || f.page_id) : null,
            default_value: f.default_value ?? '',
            default_value_editable: f.default_value_editable ?? true,
            is_dynamic: f.is_dynamic || false,
            dynamic_kind: f.is_dynamic ? (f.dynamic_kind || null) : null,
            dynamic_config: f.dynamic_config || {},
          };
        });
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

  if (!open) return null;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Sticky header */}
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex w-full max-w-[1400px] items-center gap-3 px-4 py-3 sm:px-6">
          <Button variant="ghost" size="sm" className="gap-1 -ml-2" onClick={onClose}>
            <ArrowLeft className="h-4 w-4" /> Volver
          </Button>
          <div className="h-6 w-px bg-border" />
          <div className="flex-1 min-w-0">
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={editingForm ? 'Nombre interno del formulario' : 'Nuevo formulario sin título'}
              className="h-9 border-0 bg-transparent px-1 text-base font-semibold shadow-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
          <Badge variant="outline" className="hidden sm:inline-flex text-[10px] uppercase tracking-wide">
            {status === 'active' ? 'Activo' : status === 'draft' ? 'Borrador' : status === 'paused' ? 'Pausado' : 'Archivado'}
          </Badge>
          <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>

        {/* Stepper */}
        <div className="border-t bg-muted/30">
          <div className="mx-auto w-full max-w-[1400px] px-4 sm:px-6">
            <div className="flex items-center gap-1 overflow-x-auto py-2">
              {STEPS.map((s, i) => {
                const active = i === step;
                const completed = i < step;
                return (
                  <button
                    key={i}
                    onClick={() => setStep(i)}
                    className={cn(
                      'flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                      active
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : completed
                          ? 'bg-primary/10 text-primary hover:bg-primary/15'
                          : 'text-muted-foreground hover:bg-muted'
                    )}
                  >
                    <span className={cn(
                      'flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold',
                      active ? 'bg-primary-foreground/20' : completed ? 'bg-primary text-primary-foreground' : 'bg-muted-foreground/15'
                    )}>
                      {completed ? <Check className="h-3 w-3" /> : i + 1}
                    </span>
                    <span>{s}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </header>

      {/* Scrollable content */}
      <main className="flex-1">
        <div className={cn(
          'mx-auto w-full px-4 py-6 sm:px-6',
          // Constructor de campos y precarga necesitan más ancho
          step === 2 || step === 3 ? 'max-w-[1400px]' : 'max-w-3xl'
        )}>

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
            {/* Header row: title + counter + primary actions */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-gradient-to-br from-muted/40 to-background p-3">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <Layers className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold leading-tight">Constructor de campos</p>
                  <p className="text-[11px] text-muted-foreground">{formFields.length} {formFields.length === 1 ? 'campo' : 'campos'} · arrastra para reordenar</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Button variant="outline" size="sm" onClick={() => setShowNewSectionDialog(true)} className="h-8">
                  <FolderPlus className="h-3.5 w-3.5 mr-1.5" /> Nueva sección CRM
                </Button>
                <Button variant="outline" size="sm" onClick={() => setShowNewFieldDialog(true)} className="h-8">
                  <Layers className="h-3.5 w-3.5 mr-1.5" /> Nuevo campo CRM
                </Button>
                <Button variant="outline" size="sm" onClick={() => { resetDynamicForm(); setShowDynamicDialog(true); }} className="h-8 border-purple-300 text-purple-700 hover:bg-purple-50 hover:text-purple-800">
                  <Zap className="h-3.5 w-3.5 mr-1.5" /> Campo dinámico
                </Button>
                <Button size="sm" onClick={addField} className="h-8">
                  <Plus className="h-3.5 w-3.5 mr-1.5" /> Campo libre
                </Button>
              </div>
            </div>

            {/* AI Builder Chat */}
            <FormAIBuilderChat
              formId={savedFormId || editingForm?.id || null}
              currentForm={{
                name, description, public_title: publicTitle, public_subtitle: publicSubtitle,
                success_message: successMessage, submit_button_text: submitButtonText,
              }}
              currentPages={pages}
              currentFields={formFields}
              crmCatalog={crmCatalog}
              existingSections={customSections.map(s => ({ id: s.id, name: s.name }))}
              onAutoChanges={applyAutoChanges}
              onAcceptProposal={acceptProposal}
            />

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

            {/* Dynamic Field Dialog (inline) */}
            {showDynamicDialog && (() => {
              const numericFields = formFields.filter(f =>
                !f.is_dynamic && f.field_key &&
                (f.field_type === 'number' || f.crm_column === 'exports_usd')
              );
              const allInputFields = formFields.filter(f => !f.is_dynamic && f.field_key);
              return (
                <div className="rounded-lg border-2 border-purple-300 bg-gradient-to-br from-purple-50 via-background to-fuchsia-50 dark:from-purple-950/20 dark:to-fuchsia-950/20 p-4 space-y-4 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="flex h-9 w-9 items-center justify-center rounded-md bg-gradient-to-br from-purple-500 to-fuchsia-500 text-white shadow-sm">
                        <Zap className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold">Nuevo campo dinámico</p>
                        <p className="text-[11px] text-muted-foreground">Se calcula automáticamente y se guarda en una sección del CRM</p>
                      </div>
                    </div>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { resetDynamicForm(); setShowDynamicDialog(false); }}>
                      <XIcon className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* Kind selector */}
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setDynKind('operation')}
                      className={cn(
                        'rounded-md border-2 p-3 text-left transition-all',
                        dynKind === 'operation'
                          ? 'border-purple-500 bg-purple-100/60 shadow-sm'
                          : 'border-border bg-background hover:border-purple-300'
                      )}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Calculator className="h-4 w-4 text-purple-600" />
                        <span className="text-xs font-semibold">Operación matemática</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground leading-tight">Calcula con una fórmula a partir de otros campos numéricos del formulario</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDynKind('generation')}
                      className={cn(
                        'rounded-md border-2 p-3 text-left transition-all',
                        dynKind === 'generation'
                          ? 'border-fuchsia-500 bg-fuchsia-100/60 shadow-sm'
                          : 'border-border bg-background hover:border-fuchsia-300'
                      )}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Bot className="h-4 w-4 text-fuchsia-600" />
                        <span className="text-xs font-semibold">Generación con IA</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground leading-tight">La IA (gpt-4o-mini) procesa otros campos del formulario con tu prompt al enviar</p>
                    </button>
                  </div>

                  {/* Common: name + section */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-[11px]">Nombre del campo *</Label>
                      <Input value={dynLabel} onChange={e => setDynLabel(e.target.value)}
                        placeholder={dynKind === 'operation' ? 'Ej: Utilidad en COP' : 'Ej: Resumen ejecutivo'}
                        className="h-8 text-xs" />
                    </div>
                    <div>
                      <Label className="text-[11px]">Sección del CRM *</Label>
                      <Select value={dynSection} onValueChange={setDynSection}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Elige sección..." /></SelectTrigger>
                        <SelectContent>
                          {customSections.map(s => (
                            <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Operation config */}
                  {dynKind === 'operation' && (
                    <div className="space-y-3 rounded-md bg-purple-50/40 dark:bg-purple-950/10 border border-purple-200 p-3">
                      <div className="flex items-center gap-2">
                        <Toggle
                          size="sm"
                          pressed={dynMode === 'simple'}
                          onPressedChange={() => setDynMode('simple')}
                          className="h-7 px-2 text-[11px] data-[state=on]:bg-purple-600 data-[state=on]:text-white"
                        >
                          Operación simple
                        </Toggle>
                        <Toggle
                          size="sm"
                          pressed={dynMode === 'formula'}
                          onPressedChange={() => setDynMode('formula')}
                          className="h-7 px-2 text-[11px] data-[state=on]:bg-purple-600 data-[state=on]:text-white"
                        >
                          Fórmula avanzada
                        </Toggle>
                      </div>

                      {dynMode === 'simple' ? (
                        <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-end">
                          <div>
                            <Label className="text-[11px]">Campo A</Label>
                            <Select value={dynInputA} onValueChange={setDynInputA}>
                              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                              <SelectContent>
                                {numericFields.length === 0 && <div className="px-2 py-1.5 text-[11px] text-muted-foreground">Agrega antes campos numéricos</div>}
                                {numericFields.map(f => (
                                  <SelectItem key={f.field_key} value={f.field_key}>{f.label || f.field_key}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <Select value={dynOp} onValueChange={v => setDynOp(v as DynamicOperationType)}>
                            <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="add">+ Suma</SelectItem>
                              <SelectItem value="subtract">− Resta</SelectItem>
                              <SelectItem value="multiply">× Multiplicación</SelectItem>
                              <SelectItem value="divide">÷ División</SelectItem>
                              <SelectItem value="percentage">% (A × B%)</SelectItem>
                            </SelectContent>
                          </Select>
                          <div>
                            <Label className="text-[11px]">Campo B</Label>
                            <Select value={dynInputB} onValueChange={setDynInputB}>
                              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                              <SelectContent>
                                {numericFields.map(f => (
                                  <SelectItem key={f.field_key} value={f.field_key}>{f.label || f.field_key}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <Label className="text-[11px]">Fórmula</Label>
                          <Input
                            value={dynFormula}
                            onChange={e => setDynFormula(e.target.value)}
                            placeholder="Ej: ({ventas} * {pct_utilidad}) / 100"
                            className="h-8 text-xs font-mono"
                          />
                          <p className="text-[10px] text-muted-foreground mt-1">
                            Usa <code className="bg-muted px-1 rounded">{`{field_key}`}</code> para referenciar otros campos. Operadores permitidos: + − * / ( )
                          </p>
                          <div className="mt-2 flex flex-wrap gap-1">
                            {numericFields.map(f => (
                              <button
                                key={f.field_key}
                                type="button"
                                onClick={() => setDynFormula(prev => prev + `{${f.field_key}}`)}
                                className="text-[10px] bg-purple-100 hover:bg-purple-200 text-purple-800 px-1.5 py-0.5 rounded font-mono"
                              >
                                {`{${f.field_key}}`}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <Label className="text-[11px]">Decimales</Label>
                          <Input type="number" min={0} max={6} value={dynDecimals} onChange={e => setDynDecimals(Number(e.target.value))} className="h-8 text-xs" />
                        </div>
                        <div className="col-span-2">
                          <Label className="text-[11px]">Sufijo (opcional)</Label>
                          <Input value={dynSuffix} onChange={e => setDynSuffix(e.target.value)} placeholder="Ej: COP, %, USD" className="h-8 text-xs" />
                        </div>
                      </div>

                      <div className="flex items-start gap-2 rounded-md border bg-background p-2.5">
                        <Checkbox checked={dynVisibleToUser} onCheckedChange={v => setDynVisibleToUser(!!v)} id="dyn-visible" className="mt-0.5" />
                        <div>
                          <label htmlFor="dyn-visible" className="text-[11px] font-medium cursor-pointer">Mostrar el resultado al usuario</label>
                          <p className="text-[10px] text-muted-foreground">Si está activo, el respondiente verá el valor calculado en tiempo real (sin poder editarlo). Si está apagado, solo se calcula y guarda al final.</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Generation config */}
                  {dynKind === 'generation' && (
                    <div className="space-y-3 rounded-md bg-fuchsia-50/40 dark:bg-fuchsia-950/10 border border-fuchsia-200 p-3">
                      <div>
                        <Label className="text-[11px]">Campos de entrada (contexto para la IA) *</Label>
                        <div className="mt-1 max-h-32 overflow-y-auto rounded-md border bg-background p-2 space-y-1">
                          {allInputFields.length === 0 && <p className="text-[11px] text-muted-foreground italic">Agrega antes algunos campos al formulario</p>}
                          {allInputFields.map(f => (
                            <label key={f.field_key} className="flex items-center gap-2 text-xs hover:bg-muted/50 rounded px-1 py-0.5 cursor-pointer">
                              <Checkbox
                                className="h-3.5 w-3.5"
                                checked={dynGenInputs.includes(f.field_key)}
                                onCheckedChange={v => setDynGenInputs(prev =>
                                  v ? Array.from(new Set([...prev, f.field_key])) : prev.filter(k => k !== f.field_key)
                                )}
                              />
                              <span className="flex-1 truncate">{f.label || f.field_key}</span>
                              <code className="text-[9px] text-muted-foreground">{f.field_key}</code>
                            </label>
                          ))}
                        </div>
                      </div>
                      <div>
                        <Label className="text-[11px]">Prompt para la IA *</Label>
                        <Textarea
                          value={dynPrompt}
                          onChange={e => setDynPrompt(e.target.value)}
                          placeholder="Ej: A partir de la descripción de la empresa, redacta una caracterización ejecutiva de máximo 3 párrafos enfocada en su modelo de negocio y mercado objetivo."
                          rows={4}
                          className="text-xs"
                        />
                        <p className="text-[10px] text-muted-foreground mt-1">
                          La IA recibirá los campos seleccionados como contexto. Modelo: <code className="bg-muted px-1 rounded">gpt-4o-mini</code> · Se ejecuta al enviar el formulario y se guarda en el perfil.
                        </p>
                      </div>
                      <div className="rounded-md bg-fuchsia-100/60 border border-fuchsia-200 p-2 flex items-start gap-2">
                        <EyeOff className="h-3.5 w-3.5 text-fuchsia-700 mt-0.5 shrink-0" />
                        <p className="text-[10px] text-fuchsia-900">El campo generativo siempre permanece oculto al usuario. Se calcula al enviar y queda en el perfil de la empresa.</p>
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Button size="sm" className="h-8 bg-purple-600 hover:bg-purple-700" onClick={handleCreateDynamicField}>
                      <Zap className="h-3.5 w-3.5 mr-1.5" /> Crear campo dinámico
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8" onClick={() => { resetDynamicForm(); setShowDynamicDialog(false); }}>Cancelar</Button>
                  </div>
                </div>
              );
            })()}

            <div
              ref={fieldListRef}
              className="space-y-3 max-h-[350px] overflow-y-auto"
              onDragOver={handleDragOverContainer}
              onDragLeave={() => {
                if (dragScrollInterval.current) { clearInterval(dragScrollInterval.current); dragScrollInterval.current = null; }
              }}
            >
              {formFields.map((field, idx) => {
                // ---- Compute destination metadata for the chip ----
                const destCf = field.crm_field_id ? customFields.find(c => c.id === field.crm_field_id) : null;
                const destSec = destCf ? customSections.find(s => s.id === destCf.sectionId) : null;
                let destKind: 'companies' | 'crm_field' | 'form_only' = 'form_only';
                let destLabel = 'Solo formulario';
                let destSubtitle = 'No se guarda en el CRM';
                let destClasses = 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100';
                let DestIcon: any = AlertCircle;
                if (field.crm_table === 'companies') {
                  destKind = 'companies';
                  const colMap = CRM_FIELD_MAPPINGS.find(m => m.column === field.crm_column);
                  destLabel = `Perfil principal · ${colMap?.label || field.crm_column}`;
                  destSubtitle = 'Tabla companies (no editable aquí)';
                  destClasses = 'bg-blue-50 text-blue-800 border-blue-300 hover:bg-blue-100';
                  DestIcon = Database;
                } else if (destCf) {
                  destKind = 'crm_field';
                  destLabel = `CRM · ${destSec?.name || unsectionedLabel}`;
                  destSubtitle = `Campo personalizado: ${destCf.name}`;
                  destClasses = 'bg-violet-50 text-violet-800 border-violet-300 hover:bg-violet-100';
                  DestIcon = Layers;
                }

                const liveCrmOpts = getLiveCrmOptions(field.crm_table, field.crm_column);
                const effectiveOptions = liveCrmOpts ?? field.options;
                const isTaxonomy = !!liveCrmOpts;
                const hasAdvanced = !!field.condition_field_key || !!field.section_name || !!field.page_id;

                return (
                <div key={idx}
                  draggable
                  onDragStart={() => handleDragStart(idx)}
                  onDragOver={(e) => handleDragOver(e, idx)}
                  onDragEnd={handleDragEnd}
                  className={cn(
                    "rounded-lg border bg-card shadow-sm overflow-hidden transition-all",
                    dragIdx === idx && "opacity-50",
                    dragOverIdx === idx && dragIdx !== idx && "border-primary border-2 ring-2 ring-primary/20"
                  )}>
                  {/* Card header: drag + index + destination chip + delete */}
                  <div className="flex items-center justify-between gap-2 px-3 py-2 border-b bg-muted/30">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab active:cursor-grabbing shrink-0" />
                      <span className="text-[11px] font-mono text-muted-foreground shrink-0">#{idx + 1}</span>
                      <span className="text-xs font-semibold truncate">{field.label || 'Campo sin nombre'}</span>

                      {/* Destination chip with popover */}
                      <Popover>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            className={cn(
                              "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10px] font-medium transition-colors shrink-0",
                              destClasses
                            )}
                            title="Cambiar destino del campo en el CRM"
                          >
                            <DestIcon className="h-3 w-3" />
                            <span className="max-w-[180px] truncate">{destLabel}</span>
                            <ChevronDown className="h-3 w-3 opacity-60" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-80 p-0" align="start">
                          <div className="p-3 border-b bg-muted/30">
                            <p className="text-xs font-semibold">Destino del campo</p>
                            <p className="text-[10px] text-muted-foreground mt-0.5">Define dónde se guarda este dato cuando el formulario se envía.</p>
                          </div>
                          <div className="p-2 space-y-1 text-xs">
                            <div className={cn("rounded-md border p-2", destKind === 'companies' && 'border-blue-300 bg-blue-50/50')}>
                              <div className="flex items-center gap-1.5 font-medium text-blue-800"><Database className="h-3 w-3" /> Perfil principal · Datos básicos</div>
                              <p className="text-[10px] text-muted-foreground mt-0.5">{destKind === 'companies' ? `Mapeado a "${CRM_FIELD_MAPPINGS.find(m => m.column === field.crm_column)?.label}". Para cambiarlo, elimina el campo y agrégalo desde la barra de campos del CRM.` : 'Para usar un campo nativo (NIT, ciudad, vertical…), elimina este campo y agrégalo desde "Agregar campos del CRM".'}</p>
                            </div>

                            {destKind === 'crm_field' && destCf && (
                              <div className="rounded-md border border-violet-300 bg-violet-50/50 p-2 space-y-2">
                                <div className="flex items-center gap-1.5 font-medium text-violet-800"><Layers className="h-3 w-3" /> Sección en el CRM</div>
                                <Select
                                  value={destCf.sectionId || '__none'}
                                  onValueChange={async (v) => {
                                    if (v === '__create') {
                                      const name = prompt('Nombre de la nueva sección del CRM:');
                                      if (!name?.trim()) return;
                                      const created = await addSection(name.trim());
                                      if (created) {
                                        await updateCustomField({ ...destCf, sectionId: created.id });
                                        showSuccess('Sección creada', `"${destCf.name}" ahora vive en «${created.name}»`);
                                      }
                                      return;
                                    }
                                    if (v === '__rename_unsectioned') {
                                      const name = prompt('Nuevo nombre del bloque sin sección:', unsectionedLabel);
                                      if (!name?.trim()) return;
                                      await setUnsectionedLabel(name.trim());
                                      showSuccess('Renombrado', `Ahora se llama «${name.trim()}»`);
                                      return;
                                    }
                                    if (v === '__rename_current' && destCf.sectionId) {
                                      const sec = customSections.find(s => s.id === destCf.sectionId);
                                      if (!sec) return;
                                      const name = prompt('Nuevo nombre de la sección:', sec.name);
                                      if (!name?.trim() || name.trim() === sec.name) return;
                                      await updateCustomSection(sec.id, name.trim());
                                      showSuccess('Sección renombrada', `«${sec.name}» → «${name.trim()}»`);
                                      return;
                                    }
                                    const newSecId = v === '__none' ? null : v;
                                    await updateCustomField({ ...destCf, sectionId: newSecId });
                                    const secName = newSecId ? customSections.find(s => s.id === newSecId)?.name : unsectionedLabel;
                                    showSuccess('Campo movido', `"${destCf.name}" → «${secName}»`);
                                  }}
                                >
                                  <SelectTrigger className="h-8 text-xs bg-background"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="__none">📌 {unsectionedLabel} (perfil principal)</SelectItem>
                                    {customSections.map(s => (
                                      <SelectItem key={s.id} value={s.id}>📁 {s.name}</SelectItem>
                                    ))}
                                    <SelectItem value="__create">➕ Crear nueva sección CRM…</SelectItem>
                                    {destCf.sectionId
                                      ? <SelectItem value="__rename_current">✎ Renombrar sección actual…</SelectItem>
                                      : <SelectItem value="__rename_unsectioned">✎ Renombrar «{unsectionedLabel}»…</SelectItem>}
                                  </SelectContent>
                                </Select>
                                <p className="text-[10px] text-violet-700/80">Cambia dónde aparece este campo en el perfil del CRM (afecta a TODAS las empresas).</p>
                              </div>
                            )}

                            {destKind === 'form_only' && (
                              <div className="rounded-md border border-amber-300 bg-amber-50/50 p-2">
                                <div className="flex items-center gap-1.5 font-medium text-amber-800"><AlertCircle className="h-3 w-3" /> Solo formulario</div>
                                <p className="text-[10px] text-muted-foreground mt-0.5">Este dato solo queda en las respuestas. Para guardarlo en el CRM, usa <span className="font-medium">"Nuevo campo CRM"</span> arriba o pídeselo a la IA.</p>
                              </div>
                            )}
                          </div>
                        </PopoverContent>
                      </Popover>

                      {field.condition_field_key && <Badge variant="outline" className="text-[9px] bg-amber-50 text-amber-700 border-amber-200 shrink-0">Condicional</Badge>}
                      {field.only_for_new && <Badge variant="outline" className="text-[9px] bg-emerald-50 text-emerald-700 border-emerald-200 shrink-0">Solo nuevas</Badge>}
                    </div>
                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => removeField(idx)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>

                  {/* Card body */}
                  <div className="p-3 space-y-3">
                    {/* Row 1: Label + Type */}
                    <div className="grid grid-cols-[1fr_180px] gap-2">
                      <div>
                        <Label className="text-[11px]">Etiqueta visible</Label>
                        <Input className="h-8 text-xs" value={field.label} onChange={e => updateField(idx, { label: e.target.value })} placeholder="Ej: Razón social" />
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

                    {/* Row 2: Placeholder */}
                    <div>
                      <Label className="text-[11px]">Placeholder / ayuda corta</Label>
                      <Input className="h-8 text-xs" value={field.placeholder} onChange={e => updateField(idx, { placeholder: e.target.value })} placeholder="Texto guía dentro del campo" />
                    </div>

                    {/* Options for select / multiselect */}
                    {(field.field_type === 'select' || field.field_type === 'multiselect') && (
                      isTaxonomy ? (
                        <div className="rounded-md bg-blue-50 dark:bg-blue-950/30 p-2 text-[10px] text-blue-700 dark:text-blue-300 flex items-center gap-1.5">
                          <Database className="h-3 w-3" />
                          Opciones sincronizadas desde {field.crm_column === 'city' ? 'la lista de ciudades' : 'la taxonomía'} del CRM ({effectiveOptions.length} valores).
                        </div>
                      ) : (
                        <div>
                          <Label className="text-[11px]">Opciones (separadas por coma)</Label>
                          <Input className="h-8 text-xs" value={field.options.join(', ')}
                            onChange={e => updateField(idx, { options: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} />
                        </div>
                      )
                    )}
                    {field.field_type === 'file' && (
                      <div className="rounded-md bg-blue-50 dark:bg-blue-950/30 p-2 text-[10px] text-blue-700 dark:text-blue-300">
                        El campo de archivo permite al usuario subir un archivo o pegar una imagen con Ctrl+V (ideal para logos).
                      </div>
                    )}

                    {/* Default value */}
                    {field.field_type !== 'file' && field.field_type !== 'sales_by_year' && (
                      <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
                        <div>
                          <Label className="text-[11px]">Respuesta por defecto</Label>
                          {(field.field_type === 'select' || field.field_type === 'multiselect' || field.field_type === 'short_text') && effectiveOptions.length > 0 ? (
                            <Select value={field.default_value || '__none'} onValueChange={v => updateField(idx, { default_value: v === '__none' ? '' : v })}>
                              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Sin valor" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none">Sin valor</SelectItem>
                                {effectiveOptions.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          ) : field.field_type === 'checkbox' ? (
                            <Select value={field.default_value || '__none'} onValueChange={v => updateField(idx, { default_value: v === '__none' ? '' : v })}>
                              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Sin valor" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none">Sin valor</SelectItem>
                                <SelectItem value="true">Marcado</SelectItem>
                                <SelectItem value="false">Desmarcado</SelectItem>
                              </SelectContent>
                            </Select>
                          ) : (
                            <Input
                              className="h-8 text-xs"
                              type={field.field_type === 'number' ? 'number' : field.field_type === 'date' ? 'date' : 'text'}
                              value={field.default_value || ''}
                              onChange={e => updateField(idx, { default_value: e.target.value })}
                              placeholder="Valor pre-rellenado"
                            />
                          )}
                        </div>
                        <label className="flex items-center gap-1.5 text-[11px] pb-1.5 whitespace-nowrap" title="Si está desactivado, el respondiente no podrá modificar el valor por defecto.">
                          <Checkbox
                            checked={field.default_value_editable !== false}
                            onCheckedChange={v => updateField(idx, { default_value_editable: !!v })}
                            className="h-3.5 w-3.5"
                          />
                          Modificable
                        </label>
                      </div>
                    )}

                    {/* Behaviour toggles — pill row */}
                    <div>
                      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground mb-1.5">Comportamiento</p>
                      <div className="flex flex-wrap gap-1.5">
                        <Toggle
                          size="sm"
                          pressed={field.is_required}
                          onPressedChange={v => updateField(idx, { is_required: !!v })}
                          className="h-7 px-2 text-[11px] data-[state=on]:bg-rose-100 data-[state=on]:text-rose-700 data-[state=on]:border-rose-300 border"
                          title="El usuario debe responderlo"
                        >
                          <AlertCircle className="h-3 w-3 mr-1" /> Obligatorio
                        </Toggle>
                        <Toggle
                          size="sm"
                          pressed={field.is_visible}
                          onPressedChange={v => updateField(idx, { is_visible: !!v })}
                          className="h-7 px-2 text-[11px] data-[state=on]:bg-sky-100 data-[state=on]:text-sky-700 data-[state=on]:border-sky-300 border"
                          title="Si está apagado, el campo queda oculto en el formulario público"
                        >
                          {field.is_visible ? <Eye className="h-3 w-3 mr-1" /> : <EyeOff className="h-3 w-3 mr-1" />}
                          Visible
                        </Toggle>
                        <Toggle
                          size="sm"
                          pressed={field.is_readonly}
                          onPressedChange={v => updateField(idx, { is_readonly: !!v, is_editable: !v })}
                          className="h-7 px-2 text-[11px] data-[state=on]:bg-zinc-200 data-[state=on]:text-zinc-800 data-[state=on]:border-zinc-400 border"
                          title="Se muestra pero no se puede editar"
                        >
                          <Lock className="h-3 w-3 mr-1" /> Solo lectura
                        </Toggle>
                        {!!field.crm_table && (
                          <Toggle
                            size="sm"
                            pressed={field.preload_from_crm}
                            onPressedChange={v => updateField(idx, { preload_from_crm: !!v })}
                            className="h-7 px-2 text-[11px] data-[state=on]:bg-violet-100 data-[state=on]:text-violet-700 data-[state=on]:border-violet-300 border"
                            title="Pre-rellena el campo con el valor actual del CRM"
                          >
                            <Download className="h-3 w-3 mr-1" /> Precarga CRM
                          </Toggle>
                        )}
                        {showOnlyForNew && (
                          <Toggle
                            size="sm"
                            pressed={!!field.only_for_new}
                            onPressedChange={v => updateField(idx, { only_for_new: !!v })}
                            className="h-7 px-2 text-[11px] data-[state=on]:bg-emerald-100 data-[state=on]:text-emerald-700 data-[state=on]:border-emerald-300 border"
                            title="Visible para todos pero solo editable por empresas nuevas"
                          >
                            <UserPlus className="h-3 w-3 mr-1" /> Solo nuevas
                          </Toggle>
                        )}
                      </div>
                    </div>

                    {/* Advanced collapsible: condition + visual section */}
                    <Collapsible defaultOpen={hasAdvanced}>
                      <CollapsibleTrigger className="group flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors">
                        <Settings2 className="h-3 w-3" />
                        Avanzado: lógica condicional y agrupación visual
                        <ChevronDown className="h-3 w-3 transition-transform group-data-[state=open]:rotate-180" />
                      </CollapsibleTrigger>
                      <CollapsibleContent className="pt-3 space-y-3">
                        {/* Visual grouping (form-only) */}
                        <div>
                          <Label className="text-[11px]" title="Solo agrupa visualmente el campo en el formulario público. NO crea ni asigna sección en el CRM.">
                            📂 Agrupador visible al público
                          </Label>
                          <Select value={field.section_name || '__none'} onValueChange={v => updateField(idx, { section_name: v === '__none' ? '' : v })}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Sin agrupar" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none">Sin agrupar</SelectItem>
                              {Array.from(new Set([...customSections.map(s => s.name), ...formFields.map(f => f.section_name).filter(Boolean)])).map(name => (
                                <SelectItem key={name} value={name}>{name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <p className="text-[10px] text-muted-foreground mt-0.5">Solo afecta cómo se ven los campos en el formulario público. No modifica el CRM.</p>
                        </div>

                        {/* Conditional logic */}
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-[11px]">Mostrar solo si campo…</Label>
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
                              <Label className="text-[11px]">…tiene valor</Label>
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
                                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Seleccionar valor…" /></SelectTrigger>
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
                      </CollapsibleContent>
                    </Collapsible>
                  </div>
                </div>
              );})}
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
          <div className="space-y-5">
            {/* Pages / Question sections manager */}
            <div className="rounded-lg border bg-muted/20 p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-primary" />
                  <div>
                    <Label className="text-sm font-semibold">Secciones de preguntas (páginas)</Label>
                    <p className="text-[11px] text-muted-foreground mt-0.5">Divide el formulario en varias páginas. Si no creas ninguna, se mostrará en una sola página.</p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setPages(prev => [...prev, {
                    id: crypto.randomUUID(),
                    persisted: false,
                    title: `Página ${prev.length + 1}`,
                    description: '',
                    display_order: prev.length,
                  }])}
                >
                  <Plus className="h-3 w-3 mr-1" /> Añadir página
                </Button>
              </div>

              {pages.length === 0 ? (
                <div className="rounded-md border border-dashed p-4 text-center">
                  <FileText className="h-6 w-6 mx-auto text-muted-foreground/50 mb-1.5" />
                  <p className="text-xs text-muted-foreground">Sin páginas. El formulario se mostrará en una sola pantalla.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {pages.map((page, idx) => {
                    const fieldsInPage = formFields.filter(f => f.page_id === page.id);
                    return (
                      <div key={page.id} className="rounded-md border bg-card p-3 space-y-2">
                        <div className="flex items-start gap-2">
                          <div className="flex flex-col gap-0.5 pt-1">
                            <button
                              type="button"
                              disabled={idx === 0}
                              onClick={() => setPages(prev => {
                                const arr = [...prev]; [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
                                return arr.map((p, i) => ({ ...p, display_order: i }));
                              })}
                              className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                            >
                              <ArrowUp className="h-3 w-3" />
                            </button>
                            <span className="text-[10px] text-muted-foreground text-center font-medium">{idx + 1}</span>
                            <button
                              type="button"
                              disabled={idx === pages.length - 1}
                              onClick={() => setPages(prev => {
                                const arr = [...prev]; [arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]];
                                return arr.map((p, i) => ({ ...p, display_order: i }));
                              })}
                              className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                            >
                              <ArrowDown className="h-3 w-3" />
                            </button>
                          </div>
                          <div className="flex-1 space-y-2">
                            <div className="grid grid-cols-1 gap-2">
                              <Input
                                value={page.title}
                                onChange={e => setPages(prev => prev.map(p => p.id === page.id ? { ...p, title: e.target.value } : p))}
                                placeholder="Título de la página"
                                className="h-8 text-sm font-medium"
                              />
                              <Textarea
                                value={page.description}
                                onChange={e => setPages(prev => prev.map(p => p.id === page.id ? { ...p, description: e.target.value } : p))}
                                placeholder="Descripción opcional para esta página..."
                                rows={2}
                                className="text-xs"
                              />
                            </div>
                            <div className="rounded-md bg-muted/40 p-2">
                              <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium mb-1.5">
                                Preguntas en esta página ({fieldsInPage.length})
                              </p>
                              {formFields.length === 0 ? (
                                <p className="text-[11px] text-muted-foreground italic">Agrega campos en el paso "Constructor" para asignarlos.</p>
                              ) : (
                                <div className="space-y-1 max-h-40 overflow-y-auto">
                                  {formFields.map((field, fIdx) => (
                                    <label key={fIdx} className="flex items-center gap-2 text-xs hover:bg-background/60 rounded px-1.5 py-1 cursor-pointer">
                                      <Checkbox
                                        className="h-3.5 w-3.5"
                                        checked={field.page_id === page.id}
                                        onCheckedChange={v => updateField(fIdx, { page_id: v ? page.id : null })}
                                      />
                                      <span className="flex-1 truncate">{field.label || `Campo ${fIdx + 1}`}</span>
                                      {field.page_id && field.page_id !== page.id && (
                                        <Badge variant="outline" className="text-[9px] shrink-0">
                                          Pág. {pages.findIndex(p => p.id === field.page_id) + 1}
                                        </Badge>
                                      )}
                                    </label>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 shrink-0"
                            onClick={() => {
                              setPages(prev => prev.filter(p => p.id !== page.id));
                              setFormFields(prev => prev.map(f => f.page_id === page.id ? { ...f, page_id: null } : f));
                            }}
                          >
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                  {/* Unassigned fields warning */}
                  {(() => {
                    const unassigned = formFields.filter(f => !f.page_id);
                    if (unassigned.length === 0) return null;
                    return (
                      <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-500/10 dark:border-amber-500/30 p-2.5 text-[11px] text-amber-700 dark:text-amber-300">
                        <strong>{unassigned.length}</strong> campo(s) sin asignar a página. Aparecerán al final del formulario en una sección "General".
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>

            <Separator />

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

        </div>
      </main>

      {/* Sticky footer */}
      <footer className="sticky bottom-0 z-30 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex w-full max-w-[1400px] items-center justify-between px-4 py-3 sm:px-6">
          <Button variant="ghost" size="sm" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}>
            <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
          </Button>
          <div className="text-[11px] text-muted-foreground hidden sm:block">
            Paso {step + 1} de {STEPS.length} · {STEPS[step]}
          </div>
          <div className="flex gap-2">
            {step < STEPS.length - 1 ? (
              <Button variant="outline" size="sm" onClick={() => setStep(step + 1)}>
                Siguiente <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            ) : null}
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar formulario'}
            </Button>
          </div>
        </div>
      </footer>
    </div>
  );
}
