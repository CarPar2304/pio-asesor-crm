
-- Table for custom sections (e.g. "Financiamiento", "Mercados")
CREATE TABLE public.custom_sections (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  display_order int NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.custom_sections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read custom_sections" ON public.custom_sections FOR SELECT USING (true);
CREATE POLICY "Authenticated users can insert custom_sections" ON public.custom_sections FOR INSERT WITH CHECK (true);
CREATE POLICY "Authenticated users can update custom_sections" ON public.custom_sections FOR UPDATE USING (true);
CREATE POLICY "Authenticated users can delete custom_sections" ON public.custom_sections FOR DELETE USING (true);

-- Table for custom field definitions (global schema)
CREATE TABLE public.custom_fields (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  section_id uuid REFERENCES public.custom_sections(id) ON DELETE CASCADE,
  name text NOT NULL,
  field_type text NOT NULL DEFAULT 'text', -- 'text', 'number', 'select', 'metric_by_year'
  options jsonb DEFAULT '[]'::jsonb, -- for select type: ["B2B","B2C","B2G"]
  display_order int NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.custom_fields ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read custom_fields" ON public.custom_fields FOR SELECT USING (true);
CREATE POLICY "Authenticated users can insert custom_fields" ON public.custom_fields FOR INSERT WITH CHECK (true);
CREATE POLICY "Authenticated users can update custom_fields" ON public.custom_fields FOR UPDATE USING (true);
CREATE POLICY "Authenticated users can delete custom_fields" ON public.custom_fields FOR DELETE USING (true);

-- Table for per-company values of custom fields
CREATE TABLE public.custom_field_values (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  field_id uuid NOT NULL REFERENCES public.custom_fields(id) ON DELETE CASCADE,
  text_value text DEFAULT '',
  number_value numeric DEFAULT NULL,
  year_values jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(company_id, field_id)
);

ALTER TABLE public.custom_field_values ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read custom_field_values" ON public.custom_field_values FOR SELECT USING (true);
CREATE POLICY "Authenticated users can insert custom_field_values" ON public.custom_field_values FOR INSERT WITH CHECK (true);
CREATE POLICY "Authenticated users can update custom_field_values" ON public.custom_field_values FOR UPDATE USING (true);
CREATE POLICY "Authenticated users can delete custom_field_values" ON public.custom_field_values FOR DELETE USING (true);
