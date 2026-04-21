ALTER TABLE public.section_widgets
  ADD COLUMN IF NOT EXISTS sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS hide_if_empty boolean NOT NULL DEFAULT true;