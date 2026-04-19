ALTER TABLE public.external_form_fields
  ADD COLUMN IF NOT EXISTS default_value text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS default_value_editable boolean NOT NULL DEFAULT true;