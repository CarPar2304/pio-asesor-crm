
-- Companies table
CREATE TABLE public.companies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  trade_name TEXT NOT NULL,
  legal_name TEXT NOT NULL DEFAULT '',
  nit TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'Startup',
  vertical TEXT NOT NULL DEFAULT '',
  economic_activity TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  sales_by_year JSONB NOT NULL DEFAULT '{}',
  exports_usd NUMERIC NOT NULL DEFAULT 0,
  logo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Contacts table
CREATE TABLE public.contacts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Company actions table
CREATE TABLE public.company_actions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'meeting',
  description TEXT NOT NULL DEFAULT '',
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Milestones table
CREATE TABLE public.milestones (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'capital',
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Company tasks table
CREATE TABLE public.company_tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  due_date DATE NOT NULL DEFAULT CURRENT_DATE,
  completed_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Custom properties table
CREATE TABLE public.custom_properties (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'general',
  value TEXT,
  year_values JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Saved views table
CREATE TABLE public.saved_views (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  filters JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_views ENABLE ROW LEVEL SECURITY;

-- RLS policies: all authenticated users can CRUD (shared CRM)
CREATE POLICY "Authenticated users can read companies" ON public.companies FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert companies" ON public.companies FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update companies" ON public.companies FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete companies" ON public.companies FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated users can read contacts" ON public.contacts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert contacts" ON public.contacts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update contacts" ON public.contacts FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete contacts" ON public.contacts FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated users can read actions" ON public.company_actions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert actions" ON public.company_actions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update actions" ON public.company_actions FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete actions" ON public.company_actions FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated users can read milestones" ON public.milestones FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert milestones" ON public.milestones FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update milestones" ON public.milestones FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete milestones" ON public.milestones FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated users can read tasks" ON public.company_tasks FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert tasks" ON public.company_tasks FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update tasks" ON public.company_tasks FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete tasks" ON public.company_tasks FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated users can read custom_properties" ON public.custom_properties FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert custom_properties" ON public.custom_properties FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update custom_properties" ON public.custom_properties FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete custom_properties" ON public.custom_properties FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated users can read saved_views" ON public.saved_views FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert saved_views" ON public.saved_views FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update saved_views" ON public.saved_views FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete saved_views" ON public.saved_views FOR DELETE TO authenticated USING (true);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_companies_updated_at
  BEFORE UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Indexes
CREATE INDEX idx_contacts_company ON public.contacts(company_id);
CREATE INDEX idx_actions_company ON public.company_actions(company_id);
CREATE INDEX idx_milestones_company ON public.milestones(company_id);
CREATE INDEX idx_tasks_company ON public.company_tasks(company_id);
CREATE INDEX idx_custom_props_company ON public.custom_properties(company_id);
