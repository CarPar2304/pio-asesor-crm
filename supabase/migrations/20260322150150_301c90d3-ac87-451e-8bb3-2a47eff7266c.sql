-- Table for category-level config (custom branch labels)
CREATE TABLE IF NOT EXISTS public.crm_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  level1_label text NOT NULL DEFAULT 'Verticales',
  level2_label text NOT NULL DEFAULT 'Sub-verticales',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.crm_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read crm_categories" ON public.crm_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert crm_categories" ON public.crm_categories FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update crm_categories" ON public.crm_categories FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated can delete crm_categories" ON public.crm_categories FOR DELETE TO authenticated USING (true);

-- Add UPDATE policy for crm_category_verticals (was missing)
CREATE POLICY "Authenticated can update crm_category_verticals" ON public.crm_category_verticals FOR UPDATE TO authenticated USING (true);

-- Add UPDATE policy for crm_vertical_sub_verticals (was missing)  
CREATE POLICY "Authenticated can update crm_vertical_sub_verticals" ON public.crm_vertical_sub_verticals FOR UPDATE TO authenticated USING (true);

-- Seed existing categories
INSERT INTO public.crm_categories (name) VALUES ('EBT'), ('Startup')
ON CONFLICT (name) DO NOTHING;