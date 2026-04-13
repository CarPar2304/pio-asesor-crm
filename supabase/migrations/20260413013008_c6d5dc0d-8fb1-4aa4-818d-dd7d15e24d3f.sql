
ALTER TABLE public.external_form_fields
  ADD COLUMN IF NOT EXISTS condition_field_key text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS condition_value text DEFAULT NULL;
