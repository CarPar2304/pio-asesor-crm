ALTER TABLE public.company_history
  ADD COLUMN IF NOT EXISTS event_date timestamptz;

CREATE INDEX IF NOT EXISTS idx_company_history_event_date
  ON public.company_history(company_id, event_date DESC NULLS LAST, created_at DESC);