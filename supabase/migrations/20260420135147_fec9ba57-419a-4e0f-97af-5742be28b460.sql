ALTER TABLE public.chat_retrieval_logs
  ADD COLUMN IF NOT EXISTS actions_executed jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS actions_failed jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS operation text;