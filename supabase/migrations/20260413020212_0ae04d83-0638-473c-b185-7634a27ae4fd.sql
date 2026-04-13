
ALTER TABLE public.external_forms
  ADD COLUMN IF NOT EXISTS linked_offer_id uuid REFERENCES public.portfolio_offers(id) ON DELETE SET NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS linked_stage_id uuid REFERENCES public.pipeline_stages(id) ON DELETE SET NULL DEFAULT NULL;
