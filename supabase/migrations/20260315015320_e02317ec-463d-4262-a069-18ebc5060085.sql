
-- Allies table
CREATE TABLE public.allies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  logo TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.allies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read allies" ON public.allies FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert allies" ON public.allies FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update allies" ON public.allies FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated can delete allies" ON public.allies FOR DELETE TO authenticated USING (true);

-- Ally contacts
CREATE TABLE public.ally_contacts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ally_id UUID NOT NULL REFERENCES public.allies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.ally_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read ally_contacts" ON public.ally_contacts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert ally_contacts" ON public.ally_contacts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update ally_contacts" ON public.ally_contacts FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated can delete ally_contacts" ON public.ally_contacts FOR DELETE TO authenticated USING (true);

-- Offer-Ally junction table (many-to-many)
CREATE TABLE public.offer_allies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  offer_id UUID NOT NULL REFERENCES public.portfolio_offers(id) ON DELETE CASCADE,
  ally_id UUID NOT NULL REFERENCES public.allies(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(offer_id, ally_id)
);

ALTER TABLE public.offer_allies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read offer_allies" ON public.offer_allies FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert offer_allies" ON public.offer_allies FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can delete offer_allies" ON public.offer_allies FOR DELETE TO authenticated USING (true);

-- Add added_by to pipeline_entries for tracking who added each company
ALTER TABLE public.pipeline_entries ADD COLUMN added_by UUID;
