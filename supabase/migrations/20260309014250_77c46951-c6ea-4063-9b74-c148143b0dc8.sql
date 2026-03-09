
-- 1. Portfolio offer categories
CREATE TABLE public.portfolio_offer_categories (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#6366f1',
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.portfolio_offer_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read offer categories"
  ON public.portfolio_offer_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert offer categories"
  ON public.portfolio_offer_categories FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update offer categories"
  ON public.portfolio_offer_categories FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete offer categories"
  ON public.portfolio_offer_categories FOR DELETE TO authenticated USING (true);

INSERT INTO public.portfolio_offer_categories (name, color, display_order) VALUES
  ('Producto', '#3b82f6', 0),
  ('Servicio', '#10b981', 1),
  ('Evento', '#f59e0b', 2),
  ('Convocatoria', '#8b5cf6', 3),
  ('Misión Comercial', '#ef4444', 4);

-- 2. Portfolio offers
CREATE TABLE public.portfolio_offers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  type text NOT NULL DEFAULT 'service',
  category_id uuid REFERENCES public.portfolio_offer_categories(id) ON DELETE SET NULL,
  start_date date,
  end_date date,
  status text NOT NULL DEFAULT 'active',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.portfolio_offers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read offers"
  ON public.portfolio_offers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert offers"
  ON public.portfolio_offers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update offers"
  ON public.portfolio_offers FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete offers"
  ON public.portfolio_offers FOR DELETE TO authenticated USING (true);

CREATE TRIGGER update_portfolio_offers_updated_at
  BEFORE UPDATE ON public.portfolio_offers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Pipeline stages (Kanban columns per offer)
CREATE TABLE public.pipeline_stages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  offer_id uuid NOT NULL REFERENCES public.portfolio_offers(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#6366f1',
  icon text NOT NULL DEFAULT 'Circle',
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.pipeline_stages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read pipeline stages"
  ON public.pipeline_stages FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert pipeline stages"
  ON public.pipeline_stages FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update pipeline stages"
  ON public.pipeline_stages FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete pipeline stages"
  ON public.pipeline_stages FOR DELETE TO authenticated USING (true);

-- 4. Pipeline entries (companies in a stage)
CREATE TABLE public.pipeline_entries (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  offer_id uuid NOT NULL REFERENCES public.portfolio_offers(id) ON DELETE CASCADE,
  stage_id uuid NOT NULL REFERENCES public.pipeline_stages(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  notes text NOT NULL DEFAULT '',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (offer_id, company_id)
);

ALTER TABLE public.pipeline_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read pipeline entries"
  ON public.pipeline_entries FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert pipeline entries"
  ON public.pipeline_entries FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update pipeline entries"
  ON public.pipeline_entries FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete pipeline entries"
  ON public.pipeline_entries FOR DELETE TO authenticated USING (true);

CREATE INDEX idx_pipeline_stages_offer_id ON public.pipeline_stages(offer_id);
CREATE INDEX idx_pipeline_entries_offer_id ON public.pipeline_entries(offer_id);
CREATE INDEX idx_pipeline_entries_stage_id ON public.pipeline_entries(stage_id);
CREATE INDEX idx_pipeline_entries_company_id ON public.pipeline_entries(company_id);
