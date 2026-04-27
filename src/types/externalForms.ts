export type FormType = 'update' | 'collection' | 'creation';
export type FormStatus = 'draft' | 'active' | 'paused' | 'archived';
export type VerificationMode = 'none' | 'key_only' | 'key_and_code';
export type FormFieldType = 'short_text' | 'long_text' | 'number' | 'email' | 'phone' | 'select' | 'multiselect' | 'date' | 'checkbox' | 'url' | 'file' | 'sales_by_year';
export type ResponseStatus = 'pending' | 'approved' | 'rejected' | 'applied';

export const FORM_TYPE_LABELS: Record<FormType, string> = {
  update: 'Actualización',
  collection: 'Recopilación',
  creation: 'Creación',
};

export const FORM_STATUS_LABELS: Record<FormStatus, string> = {
  draft: 'Borrador',
  active: 'Activo',
  paused: 'Pausado',
  archived: 'Archivado',
};

export const FORM_STATUS_COLORS: Record<FormStatus, string> = {
  draft: 'bg-muted text-muted-foreground',
  active: 'bg-emerald-100 text-emerald-700',
  paused: 'bg-amber-100 text-amber-700',
  archived: 'bg-red-100 text-red-700',
};

export const FIELD_TYPE_OPTIONS: { value: FormFieldType; label: string }[] = [
  { value: 'short_text', label: 'Texto corto' },
  { value: 'long_text', label: 'Texto largo' },
  { value: 'number', label: 'Número' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Teléfono' },
  { value: 'select', label: 'Selección' },
  { value: 'multiselect', label: 'Multi-selección' },
  { value: 'date', label: 'Fecha' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'url', label: 'URL' },
  { value: 'file', label: 'Archivo / Logo' },
  { value: 'sales_by_year', label: 'Ventas por año' },
];

export const CRM_FIELD_MAPPINGS = [
  { table: 'companies', column: 'trade_name', label: 'Nombre comercial' },
  { table: 'companies', column: 'legal_name', label: 'Razón social' },
  { table: 'companies', column: 'nit', label: 'NIT' },
  { table: 'companies', column: 'description', label: 'Descripción' },
  { table: 'companies', column: 'city', label: 'Ciudad' },
  { table: 'companies', column: 'vertical', label: 'Vertical' },
  { table: 'companies', column: 'economic_activity', label: 'Sub-vertical' },
  { table: 'companies', column: 'website', label: 'Sitio web' },
  { table: 'companies', column: 'exports_usd', label: 'Exportaciones USD' },
  { table: 'companies', column: 'category', label: 'Categoría' },
  { table: 'companies', column: 'logo', label: 'Logo' },
  { table: 'companies', column: 'sales_by_year', label: 'Ventas por año' },
  { table: 'contacts', column: 'name', label: 'Nombre contacto principal' },
  { table: 'contacts', column: 'email', label: 'Email contacto principal' },
  { table: 'contacts', column: 'phone', label: 'Teléfono contacto principal' },
  { table: 'contacts', column: 'position', label: 'Cargo contacto principal' },
];

export interface ExternalForm {
  id: string;
  slug: string;
  name: string;
  description: string;
  form_type: FormType;
  status: FormStatus;
  verification_mode: VerificationMode;
  verification_key_field: string;
  code_expiration_minutes: number;
  max_code_attempts: number;
  public_title: string;
  public_subtitle: string;
  submit_button_text: string;
  success_message: string;
  error_messages: Record<string, string>;
  logo_url: string | null;
  primary_color: string;
  access_count: number;
  started_count: number;
  submitted_count: number;
  completed_count: number;
  target_segment: string | null;
  target_company_id: string | null;
  created_by: string | null;
  linked_offer_id: string | null;
  linked_stage_id: string | null;
  allow_creation: boolean;
  created_at: string;
  updated_at: string;
}

export type DynamicKind = 'operation' | 'generation';

export type DynamicOperationType = 'add' | 'subtract' | 'multiply' | 'divide' | 'percentage' | 'formula';

// dynamic_config shape:
// For 'operation':
//   { mode: 'simple', op: 'add'|'subtract'|'multiply'|'divide'|'percentage', input_a: 'field_key', input_b: 'field_key' }
//   { mode: 'formula', formula: '({ventas} * {pct}) / 100', inputs: ['field_key_1','field_key_2'] }
//   plus: { decimals?: number, suffix?: string }
// For 'generation':
//   { inputs: ['field_key_1','field_key_2'], prompt: '...', model: 'gpt-4o-mini', max_tokens?: number }
export interface DynamicConfig {
  mode?: 'simple' | 'formula';
  op?: DynamicOperationType;
  input_a?: string;
  input_b?: string;
  formula?: string;
  inputs?: string[];
  prompt?: string;
  model?: string;
  max_tokens?: number;
  decimals?: number;
  suffix?: string;
}

export interface ExternalFormField {
  id: string;
  form_id: string;
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
  only_for_new: boolean;
  page_id: string | null;
  default_value: string;
  default_value_editable: boolean;
  is_dynamic: boolean;
  dynamic_kind: DynamicKind | null;
  dynamic_config: DynamicConfig;
  created_at: string;
}

export interface ExternalFormPage {
  id: string;
  form_id: string;
  title: string;
  description: string;
  display_order: number;
  created_at: string;
}

export interface ExternalFormResponse {
  id: string;
  form_id: string;
  session_id: string | null;
  company_id: string | null;
  response_data: Record<string, any>;
  status: ResponseStatus;
  submitted_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  created_at: string;
}
