ALTER TABLE public.external_form_fields
  ADD COLUMN IF NOT EXISTS is_dynamic boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS dynamic_kind text,
  ADD COLUMN IF NOT EXISTS dynamic_config jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Validación: si is_dynamic=true, dynamic_kind debe ser operation o generation
ALTER TABLE public.external_form_fields
  DROP CONSTRAINT IF EXISTS external_form_fields_dynamic_kind_check;

ALTER TABLE public.external_form_fields
  ADD CONSTRAINT external_form_fields_dynamic_kind_check
  CHECK (
    (is_dynamic = false AND dynamic_kind IS NULL)
    OR (is_dynamic = true AND dynamic_kind IN ('operation', 'generation'))
  );