ALTER TABLE public.external_forms
  ADD COLUMN IF NOT EXISTS allow_creation boolean NOT NULL DEFAULT false;

ALTER TABLE public.external_form_fields
  ADD COLUMN IF NOT EXISTS only_for_new boolean NOT NULL DEFAULT false;