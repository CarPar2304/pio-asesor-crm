
-- Pages (sections of questions) for external forms
CREATE TABLE IF NOT EXISTS public.external_form_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid NOT NULL REFERENCES public.external_forms(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_external_form_pages_form_id ON public.external_form_pages(form_id, display_order);

ALTER TABLE public.external_form_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon can read pages of active forms"
  ON public.external_form_pages FOR SELECT
  TO anon
  USING (EXISTS (SELECT 1 FROM public.external_forms f WHERE f.id = external_form_pages.form_id AND f.status = 'active'));

CREATE POLICY "Authenticated can manage form pages"
  ON public.external_form_pages FOR ALL
  TO authenticated
  USING (true) WITH CHECK (true);

-- Add page_id reference to fields (nullable; null = legacy/single-page behavior)
ALTER TABLE public.external_form_fields
  ADD COLUMN IF NOT EXISTS page_id uuid REFERENCES public.external_form_pages(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_external_form_fields_page_id ON public.external_form_fields(page_id);
