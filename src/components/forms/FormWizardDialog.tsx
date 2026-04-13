import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/lib/toast';
import { useAuth } from '@/hooks/useAuth';
import {
  ExternalForm, ExternalFormField, FormType, FormStatus, VerificationMode,
  FormFieldType, FORM_TYPE_LABELS, FIELD_TYPE_OPTIONS, CRM_FIELD_MAPPINGS
} from '@/types/externalForms';
import { useCustomFields } from '@/contexts/CustomFieldsContext';
import { ChevronLeft, ChevronRight, Plus, Trash2, GripVertical, Copy, ExternalLink } from 'lucide-react';
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
}

export default function FormWizardDialog({ open, onClose, editingForm, onSaved }: Props) {
  const { session } = useAuth();
  const { fields: customFields, sections: customSections } = useCustomFields();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  // Step 1
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [formType, setFormType] = useState<FormType>('update');
  const [status, setStatus] = useState<FormStatus>('draft');

  // Step 2
  const [verificationMode, setVerificationMode] = useState<VerificationMode>('key_and_code');
  const [verificationKeyField, setVerificationKeyField] = useState('nit');
  const [codeExpiration, setCodeExpiration] = useState(10);
  const [maxAttempts, setMaxAttempts] = useState(5);

  // Step 3
  const [formFields, setFormFields] = useState<FieldDraft[]>([]);

  // Step 5
  const [publicTitle, setPublicTitle] = useState('');
  const [publicSubtitle, setPublicSubtitle] = useState('');
  const [submitButtonText, setSubmitButtonText] = useState('Enviar');
  const [successMessage, setSuccessMessage] = useState('Tu información ha sido enviada exitosamente.');
  const [primaryColor, setPrimaryColor] = useState('#4f46e5');

  // Step 6
  const [savedSlug, setSavedSlug] = useState('');

  useEffect(() => {
    if (!open) return;
    if (editingForm) {
      setName(editingForm.name);
      setDescription(editingForm.description);
      setFormType(editingForm.form_type);
      setStatus(editingForm.status);
      setVerificationMode(editingForm.verification_mode);
      setVerificationKeyField(editingForm.verification_key_field);
      setCodeExpiration(editingForm.code_expiration_minutes);
      setMaxAttempts(editingForm.max_code_attempts);
      setPublicTitle(editingForm.public_title);
      setPublicSubtitle(editingForm.public_subtitle);
      setSubmitButtonText(editingForm.submit_button_text);
      setSuccessMessage(editingForm.success_message);
      setPrimaryColor(editingForm.primary_color);
      setSavedSlug(editingForm.slug);
      // Load fields
      supabase.from('external_form_fields').select('*').eq('form_id', editingForm.id).order('display_order')
        .then(({ data }) => {
          if (data) setFormFields(data.map((f: any) => ({ ...f, options: Array.isArray(f.options) ? f.options : [] })));
        });
    } else {
      setName(''); setDescription(''); setFormType('update'); setStatus('draft');
      setVerificationMode('key_and_code'); setVerificationKeyField('nit');
      setCodeExpiration(10); setMaxAttempts(5); setFormFields([]);
      setPublicTitle(''); setPublicSubtitle(''); setSubmitButtonText('Enviar');
      setSuccessMessage('Tu información ha sido enviada exitosamente.');
      setPrimaryColor('#4f46e5'); setSavedSlug('');
    }
    setStep(0);
  }, [open, editingForm]);

  const addField = () => {
    setFormFields(prev => [...prev, {
      label: '', field_key: '', field_type: 'short_text', placeholder: '', help_text: '',
      section_name: '', is_required: false, is_visible: true, is_editable: true, is_readonly: false,
      preload_from_crm: false, crm_table: null, crm_column: null, crm_field_id: null,
      options: [], display_order: prev.length
    }]);
  };

  const addCrmField = (mapping: typeof CRM_FIELD_MAPPINGS[0]) => {
    const key = `${mapping.table}_${mapping.column}`;
    if (formFields.find(f => f.field_key === key)) return;
    setFormFields(prev => [...prev, {
      label: mapping.label, field_key: key, field_type: 'short_text', placeholder: '', help_text: '',
      section_name: '', is_required: false, is_visible: true, is_editable: true, is_readonly: false,
      preload_from_crm: true, crm_table: mapping.table, crm_column: mapping.column, crm_field_id: null,
      options: [], display_order: prev.length
    }]);
  };

  const addCustomCrmField = (cf: any) => {
    const key = `custom_${cf.id}`;
    if (formFields.find(f => f.field_key === key)) return;
    setFormFields(prev => [...prev, {
      label: cf.name, field_key: key, field_type: cf.fieldType === 'number' ? 'number' : cf.fieldType === 'select' ? 'select' : 'short_text',
      placeholder: '', help_text: '', section_name: '',
      is_required: false, is_visible: true, is_editable: true, is_readonly: false,
      preload_from_crm: true, crm_table: 'custom_field_values', crm_column: null, crm_field_id: cf.id,
      options: cf.options || [], display_order: prev.length
    }]);
  };

  const updateField = (idx: number, updates: Partial<FieldDraft>) => {
    setFormFields(prev => prev.map((f, i) => i === idx ? { ...f, ...updates } : f));
  };

  const removeField = (idx: number) => {
    setFormFields(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    if (!name.trim()) { showError('Error', 'El nombre es obligatorio'); return; }
    setSaving(true);

    try {
      const slug = editingForm?.slug || crypto.randomUUID().slice(0, 12);
      const formData: any = {
        slug, name, description, form_type: formType, status,
        verification_mode: verificationMode, verification_key_field: verificationKeyField,
        code_expiration_minutes: codeExpiration, max_code_attempts: maxAttempts,
        public_title: publicTitle, public_subtitle: publicSubtitle,
        submit_button_text: submitButtonText, success_message: successMessage,
        primary_color: primaryColor, created_by: session?.user?.id
      };

      let formId: string;
      if (editingForm) {
        const { error } = await supabase.from('external_forms').update(formData).eq('id', editingForm.id);
        if (error) throw error;
        formId = editingForm.id;
        // Delete old fields, insert new
        await supabase.from('external_form_fields').delete().eq('form_id', formId);
      } else {
        const { data, error } = await supabase.from('external_forms').insert(formData).select('id, slug').single();
        if (error) throw error;
        formId = data!.id;
        setSavedSlug(data!.slug);
      }

      // Insert fields
      if (formFields.length > 0) {
        const fieldsToInsert = formFields.map((f, i) => ({
          form_id: formId, label: f.label, field_key: f.field_key || f.label.toLowerCase().replace(/\s+/g, '_'),
          field_type: f.field_type, placeholder: f.placeholder, help_text: f.help_text, section_name: f.section_name,
          is_required: f.is_required, is_visible: f.is_visible, is_editable: f.is_editable, is_readonly: f.is_readonly,
          preload_from_crm: f.preload_from_crm, crm_table: f.crm_table, crm_column: f.crm_column,
          crm_field_id: f.crm_field_id, options: f.options, display_order: i
        }));
        const { error } = await supabase.from('external_form_fields').insert(fieldsToInsert as any);
        if (error) throw error;
      }

      showSuccess('Guardado', editingForm ? 'Formulario actualizado' : 'Formulario creado');
      if (!editingForm) setSavedSlug(slug);
      onSaved();
      if (step < 5) setStep(5); // Go to publish step
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
              <Select value={formType} onValueChange={v => setFormType(v as FormType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="update">Actualización — la empresa actualiza info existente</SelectItem>
                  <SelectItem value="collection">Recopilación — solicitar nueva info a empresa existente</SelectItem>
                  <SelectItem value="creation">Creación — registrar empresa nueva</SelectItem>
                </SelectContent>
              </Select>
            </div>
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
                      <SelectItem value="email">Email</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground mt-1">La empresa usará este campo para identificarse</p>
                </div>
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
                <Button variant="outline" size="sm" onClick={addField}>
                  <Plus className="h-3 w-3 mr-1" /> Campo libre
                </Button>
              </div>
            </div>

            {/* Quick add from CRM */}
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
              {customFields.length > 0 && (
                <>
                  <p className="text-[11px] font-medium text-muted-foreground mt-3 mb-2">Campos personalizados</p>
                  <div className="flex flex-wrap gap-1">
                    {customFields.map(cf => (
                      <Button key={cf.id} variant="outline" size="sm" className="h-6 text-[10px] px-2"
                        onClick={() => addCustomCrmField(cf)} disabled={formFields.some(f => f.field_key === `custom_${cf.id}`)}>
                        {cf.name}
                      </Button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Field list */}
            <div className="space-y-3 max-h-[350px] overflow-y-auto">
              {formFields.map((field, idx) => (
                <div key={idx} className="rounded-md border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-xs font-medium">Campo {idx + 1}</span>
                      {field.preload_from_crm && <Badge variant="outline" className="text-[9px]">CRM</Badge>}
                    </div>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeField(idx)}>
                      <Trash2 className="h-3 w-3 text-red-500" />
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
                          {FIELD_TYPE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
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
                      <Input className="h-8 text-xs" value={field.section_name} onChange={e => updateField(idx, { section_name: e.target.value })} />
                    </div>
                  </div>
                  {(field.field_type === 'select' || field.field_type === 'multiselect') && (
                    <div>
                      <Label className="text-[11px]">Opciones (separadas por coma)</Label>
                      <Input className="h-8 text-xs" value={field.options.join(', ')}
                        onChange={e => updateField(idx, { options: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} />
                    </div>
                  )}
                  <div className="flex items-center gap-4 text-[11px]">
                    <label className="flex items-center gap-1.5">
                      <Checkbox checked={field.is_required} onCheckedChange={v => updateField(idx, { is_required: !!v })} className="h-3.5 w-3.5" />
                      Obligatorio
                    </label>
                    <label className="flex items-center gap-1.5">
                      <Checkbox checked={field.is_visible} onCheckedChange={v => updateField(idx, { is_visible: !!v })} className="h-3.5 w-3.5" />
                      Visible
                    </label>
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
