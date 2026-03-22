
-- Taxonomy tables for Category → Vertical → Sub-vertical management
CREATE TABLE public.crm_verticals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.crm_sub_verticals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Many-to-many: categories (text) ↔ verticals
CREATE TABLE public.crm_category_verticals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  vertical_id uuid NOT NULL REFERENCES public.crm_verticals(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(category, vertical_id)
);

-- Many-to-many: verticals ↔ sub-verticals
CREATE TABLE public.crm_vertical_sub_verticals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vertical_id uuid NOT NULL REFERENCES public.crm_verticals(id) ON DELETE CASCADE,
  sub_vertical_id uuid NOT NULL REFERENCES public.crm_sub_verticals(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(vertical_id, sub_vertical_id)
);

-- RLS
ALTER TABLE public.crm_verticals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_sub_verticals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_category_verticals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_vertical_sub_verticals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read crm_verticals" ON public.crm_verticals FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert crm_verticals" ON public.crm_verticals FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update crm_verticals" ON public.crm_verticals FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated can delete crm_verticals" ON public.crm_verticals FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated can read crm_sub_verticals" ON public.crm_sub_verticals FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert crm_sub_verticals" ON public.crm_sub_verticals FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update crm_sub_verticals" ON public.crm_sub_verticals FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated can delete crm_sub_verticals" ON public.crm_sub_verticals FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated can read crm_category_verticals" ON public.crm_category_verticals FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert crm_category_verticals" ON public.crm_category_verticals FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can delete crm_category_verticals" ON public.crm_category_verticals FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated can read crm_vertical_sub_verticals" ON public.crm_vertical_sub_verticals FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert crm_vertical_sub_verticals" ON public.crm_vertical_sub_verticals FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can delete crm_vertical_sub_verticals" ON public.crm_vertical_sub_verticals FOR DELETE TO authenticated USING (true);

-- Seed existing verticals
INSERT INTO public.crm_verticals (name) VALUES
  ('Biotecnología'), ('AgriTech'), ('IA / Machine Learning'), ('HealthTech'),
  ('CleanTech'), ('FinTech'), ('EdTech'), ('LogTech'), ('FoodTech'), ('Otro')
ON CONFLICT (name) DO NOTHING;

-- Seed default sub-verticals
INSERT INTO public.crm_sub_verticals (name) VALUES
  ('Bioinformática'), ('Bioprocesos'), ('Diagnóstico'), ('Terapéutica'),
  ('Agricultura de precisión'), ('Insumos biológicos'), ('Monitoreo de cultivos'),
  ('NLP'), ('Visión por computador'), ('Analítica predictiva'), ('Automatización'),
  ('Telemedicina'), ('Dispositivos médicos'), ('Salud digital'),
  ('Energías renovables'), ('Gestión de residuos'), ('Eficiencia energética'),
  ('Pagos'), ('Lending'), ('Seguros'), ('Blockchain'),
  ('E-learning'), ('Gestión educativa'), ('Contenido digital'),
  ('Última milla'), ('Gestión de flotas'), ('Cadena de suministro'),
  ('Delivery'), ('Alimentos alternativos'), ('Trazabilidad')
ON CONFLICT (name) DO NOTHING;

-- Seed default category-vertical links (all verticals to EBT and Startup)
INSERT INTO public.crm_category_verticals (category, vertical_id)
SELECT cat, v.id FROM public.crm_verticals v
CROSS JOIN (VALUES ('EBT'), ('Startup')) AS cats(cat)
ON CONFLICT (category, vertical_id) DO NOTHING;

-- Seed default vertical-sub_vertical links
WITH vlinks AS (
  SELECT v.id AS vid, s.id AS sid FROM public.crm_verticals v, public.crm_sub_verticals s
  WHERE (v.name = 'Biotecnología' AND s.name IN ('Bioinformática','Bioprocesos','Diagnóstico','Terapéutica'))
     OR (v.name = 'AgriTech' AND s.name IN ('Agricultura de precisión','Insumos biológicos','Monitoreo de cultivos'))
     OR (v.name = 'IA / Machine Learning' AND s.name IN ('NLP','Visión por computador','Analítica predictiva','Automatización'))
     OR (v.name = 'HealthTech' AND s.name IN ('Telemedicina','Dispositivos médicos','Salud digital'))
     OR (v.name = 'CleanTech' AND s.name IN ('Energías renovables','Gestión de residuos','Eficiencia energética'))
     OR (v.name = 'FinTech' AND s.name IN ('Pagos','Lending','Seguros','Blockchain'))
     OR (v.name = 'EdTech' AND s.name IN ('E-learning','Gestión educativa','Contenido digital'))
     OR (v.name = 'LogTech' AND s.name IN ('Última milla','Gestión de flotas','Cadena de suministro'))
     OR (v.name = 'FoodTech' AND s.name IN ('Delivery','Alimentos alternativos','Trazabilidad'))
)
INSERT INTO public.crm_vertical_sub_verticals (vertical_id, sub_vertical_id)
SELECT vid, sid FROM vlinks
ON CONFLICT (vertical_id, sub_vertical_id) DO NOTHING;
