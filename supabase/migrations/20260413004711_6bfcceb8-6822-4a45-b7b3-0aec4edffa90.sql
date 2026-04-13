
-- External Forms main table
CREATE TABLE public.external_forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  form_type text NOT NULL DEFAULT 'update' CHECK (form_type IN ('update', 'collection', 'creation')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'archived')),
  
  -- Verification config
  verification_mode text NOT NULL DEFAULT 'key_and_code' CHECK (verification_mode IN ('none', 'key_only', 'key_and_code')),
  verification_key_field text NOT NULL DEFAULT 'nit',
  code_expiration_minutes integer NOT NULL DEFAULT 10,
  max_code_attempts integer NOT NULL DEFAULT 5,
  
  -- Public UI texts
  public_title text NOT NULL DEFAULT '',
  public_subtitle text NOT NULL DEFAULT '',
  submit_button_text text NOT NULL DEFAULT 'Enviar',
  success_message text NOT NULL DEFAULT 'Tu información ha sido enviada exitosamente.',
  error_messages jsonb NOT NULL DEFAULT '{}'::jsonb,
  
  -- Branding
  logo_url text,
  primary_color text NOT NULL DEFAULT '#4f46e5',
  
  -- Stats
  access_count integer NOT NULL DEFAULT 0,
  started_count integer NOT NULL DEFAULT 0,
  submitted_count integer NOT NULL DEFAULT 0,
  completed_count integer NOT NULL DEFAULT 0,
  
  -- Target
  target_segment text,
  target_company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_external_forms_slug ON public.external_forms(slug);
CREATE INDEX idx_external_forms_status ON public.external_forms(status);

ALTER TABLE public.external_forms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can manage external_forms" ON public.external_forms
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Anon can read active forms by slug" ON public.external_forms
  FOR SELECT TO anon USING (status = 'active');

-- Form fields
CREATE TABLE public.external_form_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid NOT NULL REFERENCES public.external_forms(id) ON DELETE CASCADE,
  
  label text NOT NULL,
  field_key text NOT NULL,
  field_type text NOT NULL DEFAULT 'text' CHECK (field_type IN ('short_text', 'long_text', 'number', 'email', 'phone', 'select', 'multiselect', 'date', 'checkbox', 'url', 'file')),
  placeholder text NOT NULL DEFAULT '',
  help_text text NOT NULL DEFAULT '',
  section_name text NOT NULL DEFAULT '',
  
  -- Config
  is_required boolean NOT NULL DEFAULT false,
  is_visible boolean NOT NULL DEFAULT true,
  is_editable boolean NOT NULL DEFAULT true,
  is_readonly boolean NOT NULL DEFAULT false,
  
  -- Preload config
  preload_from_crm boolean NOT NULL DEFAULT false,
  crm_table text,
  crm_column text,
  crm_field_id uuid, -- for custom fields
  
  -- Select options
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_form_fields_form ON public.external_form_fields(form_id);

ALTER TABLE public.external_form_fields ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can manage form_fields" ON public.external_form_fields
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Anon can read form fields of active forms" ON public.external_form_fields
  FOR SELECT TO anon USING (
    EXISTS (SELECT 1 FROM public.external_forms f WHERE f.id = form_id AND f.status = 'active')
  );

-- Sessions
CREATE TABLE public.external_form_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid NOT NULL REFERENCES public.external_forms(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  
  is_verified boolean NOT NULL DEFAULT false,
  verified_at timestamptz,
  ip_address text,
  user_agent text,
  
  -- Token for accessing the form after verification
  session_token text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '2 hours'),
  
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_form_sessions_token ON public.external_form_sessions(session_token);
CREATE INDEX idx_form_sessions_form ON public.external_form_sessions(form_id);

ALTER TABLE public.external_form_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read sessions" ON public.external_form_sessions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Service role manages sessions" ON public.external_form_sessions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Verification codes
CREATE TABLE public.external_form_verification_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.external_form_sessions(id) ON DELETE CASCADE,
  
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  used boolean NOT NULL DEFAULT false,
  
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_verification_codes_session ON public.external_form_verification_codes(session_id);

ALTER TABLE public.external_form_verification_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages verification codes" ON public.external_form_verification_codes
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Responses
CREATE TABLE public.external_form_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid NOT NULL REFERENCES public.external_forms(id) ON DELETE CASCADE,
  session_id uuid REFERENCES public.external_form_sessions(id) ON DELETE SET NULL,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  
  response_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'applied')),
  
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid,
  
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_form_responses_form ON public.external_form_responses(form_id);
CREATE INDEX idx_form_responses_company ON public.external_form_responses(company_id);

ALTER TABLE public.external_form_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can manage responses" ON public.external_form_responses
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Service role manages responses" ON public.external_form_responses
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Audit log
CREATE TABLE public.external_form_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  response_id uuid NOT NULL REFERENCES public.external_form_responses(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  
  field_key text NOT NULL,
  field_label text NOT NULL DEFAULT '',
  old_value text,
  new_value text,
  
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_log_response ON public.external_form_audit_log(response_id);
CREATE INDEX idx_audit_log_company ON public.external_form_audit_log(company_id);

ALTER TABLE public.external_form_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read audit log" ON public.external_form_audit_log
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Service role manages audit log" ON public.external_form_audit_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Trigger for updated_at on external_forms
CREATE TRIGGER update_external_forms_updated_at
  BEFORE UPDATE ON public.external_forms
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
