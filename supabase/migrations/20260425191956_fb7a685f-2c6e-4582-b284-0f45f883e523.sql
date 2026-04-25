ALTER TABLE public.external_form_sessions
  ADD COLUMN IF NOT EXISTS pending_email text;