
CREATE TABLE public.company_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL DEFAULT 'action',
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  metadata JSONB DEFAULT '{}',
  performed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_company_history_company ON public.company_history(company_id);
CREATE INDEX idx_company_history_date ON public.company_history(created_at DESC);

ALTER TABLE public.company_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view history"
  ON public.company_history FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert history"
  ON public.company_history FOR INSERT
  TO authenticated WITH CHECK (true);
