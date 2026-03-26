CREATE TABLE public.pipeline_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id uuid NOT NULL REFERENCES portfolio_offers(id) ON DELETE CASCADE,
  content text NOT NULL DEFAULT '',
  created_by uuid DEFAULT auth.uid(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.pipeline_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read pipeline_notes" ON public.pipeline_notes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert pipeline_notes" ON public.pipeline_notes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can delete pipeline_notes" ON public.pipeline_notes FOR DELETE TO authenticated USING (true);
CREATE POLICY "Authenticated can update pipeline_notes" ON public.pipeline_notes FOR UPDATE TO authenticated USING (true);