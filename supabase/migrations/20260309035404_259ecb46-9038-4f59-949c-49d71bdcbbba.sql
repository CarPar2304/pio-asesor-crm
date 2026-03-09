-- Create offer types table for dynamic types (like categories)
CREATE TABLE public.portfolio_offer_types (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.portfolio_offer_types ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Authenticated users can read offer types" ON public.portfolio_offer_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert offer types" ON public.portfolio_offer_types FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update offer types" ON public.portfolio_offer_types FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete offer types" ON public.portfolio_offer_types FOR DELETE TO authenticated USING (true);

-- Seed default types
INSERT INTO public.portfolio_offer_types (name) VALUES ('Producto'), ('Servicio');