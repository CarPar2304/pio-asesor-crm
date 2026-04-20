
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Drop legacy UNIQUE constraints (not just indexes)
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT tc.table_name, tc.constraint_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
     AND tc.table_schema = kcu.table_schema
    WHERE tc.table_schema='public'
      AND tc.constraint_type='UNIQUE'
      AND tc.table_name IN ('company_embeddings','offer_embeddings','pipeline_embeddings','ally_embeddings')
    GROUP BY tc.table_name, tc.constraint_name
    HAVING COUNT(*) = 1
       AND MAX(kcu.column_name) IN ('company_id','offer_id','ally_id')
  LOOP
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', r.table_name, r.constraint_name);
  END LOOP;
END $$;

-- company_embeddings
ALTER TABLE public.company_embeddings
  ADD COLUMN IF NOT EXISTS chunk_type   text NOT NULL DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS chunk_key    text NOT NULL DEFAULT 'main',
  ADD COLUMN IF NOT EXISTS metadata     jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS content_hash text;
CREATE UNIQUE INDEX IF NOT EXISTS company_embeddings_chunk_uniq
  ON public.company_embeddings (company_id, chunk_type, chunk_key);
CREATE INDEX IF NOT EXISTS company_embeddings_metadata_gin
  ON public.company_embeddings USING gin (metadata);
CREATE INDEX IF NOT EXISTS company_embeddings_chunk_type_idx
  ON public.company_embeddings (chunk_type);

-- offer_embeddings
ALTER TABLE public.offer_embeddings
  ADD COLUMN IF NOT EXISTS chunk_type   text NOT NULL DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS chunk_key    text NOT NULL DEFAULT 'main',
  ADD COLUMN IF NOT EXISTS metadata     jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS content_hash text;
CREATE UNIQUE INDEX IF NOT EXISTS offer_embeddings_chunk_uniq
  ON public.offer_embeddings (offer_id, chunk_type, chunk_key);
CREATE INDEX IF NOT EXISTS offer_embeddings_metadata_gin
  ON public.offer_embeddings USING gin (metadata);

-- pipeline_embeddings
ALTER TABLE public.pipeline_embeddings
  ADD COLUMN IF NOT EXISTS chunk_type   text NOT NULL DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS chunk_key    text NOT NULL DEFAULT 'main',
  ADD COLUMN IF NOT EXISTS metadata     jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS content_hash text;
CREATE UNIQUE INDEX IF NOT EXISTS pipeline_embeddings_chunk_uniq
  ON public.pipeline_embeddings (offer_id, chunk_type, chunk_key);
CREATE INDEX IF NOT EXISTS pipeline_embeddings_metadata_gin
  ON public.pipeline_embeddings USING gin (metadata);

-- ally_embeddings
ALTER TABLE public.ally_embeddings
  ADD COLUMN IF NOT EXISTS chunk_type   text NOT NULL DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS chunk_key    text NOT NULL DEFAULT 'main',
  ADD COLUMN IF NOT EXISTS metadata     jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS content_hash text;
CREATE UNIQUE INDEX IF NOT EXISTS ally_embeddings_chunk_uniq
  ON public.ally_embeddings (ally_id, chunk_type, chunk_key);
CREATE INDEX IF NOT EXISTS ally_embeddings_metadata_gin
  ON public.ally_embeddings USING gin (metadata);

-- pg_trgm indexes
CREATE INDEX IF NOT EXISTS companies_trade_name_trgm
  ON public.companies USING gin (trade_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS companies_legal_name_trgm
  ON public.companies USING gin (legal_name gin_trgm_ops);

-- find_company_by_name
CREATE OR REPLACE FUNCTION public.find_company_by_name(
  _name text,
  _limit integer DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  trade_name text,
  legal_name text,
  nit text,
  similarity double precision,
  match_field text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH scored AS (
    SELECT
      c.id, c.trade_name, c.legal_name, c.nit,
      GREATEST(
        similarity(c.trade_name, _name),
        similarity(c.legal_name, _name)
      )::double precision AS sim,
      CASE
        WHEN similarity(c.trade_name, _name) >= similarity(c.legal_name, _name)
          THEN 'trade_name'
        ELSE 'legal_name'
      END AS field
    FROM public.companies c
    WHERE c.trade_name % _name OR c.legal_name % _name
       OR c.trade_name ILIKE '%' || _name || '%'
       OR c.legal_name ILIKE '%' || _name || '%'
  )
  SELECT s.id, s.trade_name, s.legal_name, s.nit, s.sim, s.field
  FROM scored s
  WHERE s.sim > 0.15
  ORDER BY s.sim DESC
  LIMIT _limit;
END;
$$;

-- match_company_chunks
CREATE OR REPLACE FUNCTION public.match_company_chunks(
  query_embedding extensions.vector,
  match_threshold double precision DEFAULT 0.3,
  match_count integer DEFAULT 10,
  filter_chunk_types text[] DEFAULT NULL,
  filter_company_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  company_id uuid,
  chunk_type text,
  chunk_key text,
  content text,
  metadata jsonb,
  similarity double precision
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ce.id,
    ce.company_id,
    ce.chunk_type,
    ce.chunk_key,
    ce.content,
    ce.metadata,
    (1 - (ce.embedding OPERATOR(extensions.<=>) query_embedding))::double precision AS similarity
  FROM public.company_embeddings ce
  WHERE ce.embedding IS NOT NULL
    AND (1 - (ce.embedding OPERATOR(extensions.<=>) query_embedding)) > match_threshold
    AND (filter_chunk_types IS NULL OR ce.chunk_type = ANY(filter_chunk_types))
    AND (filter_company_ids IS NULL OR ce.company_id = ANY(filter_company_ids))
  ORDER BY ce.embedding OPERATOR(extensions.<=>) query_embedding
  LIMIT match_count;
END;
$$;

-- chat_retrieval_logs
CREATE TABLE IF NOT EXISTS public.chat_retrieval_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid,
  user_id uuid,
  user_message text NOT NULL DEFAULT '',
  intent text,
  path text,
  evidence_level text,
  vacancy_case text,
  tools_called jsonb NOT NULL DEFAULT '[]'::jsonb,
  router_output jsonb NOT NULL DEFAULT '{}'::jsonb,
  latency_ms integer,
  tokens_in integer,
  tokens_out integer,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chat_retrieval_logs_user_idx
  ON public.chat_retrieval_logs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS chat_retrieval_logs_conversation_idx
  ON public.chat_retrieval_logs (conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS chat_retrieval_logs_path_idx
  ON public.chat_retrieval_logs (path, created_at DESC);

ALTER TABLE public.chat_retrieval_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read chat_retrieval_logs" ON public.chat_retrieval_logs;
CREATE POLICY "Admins can read chat_retrieval_logs"
  ON public.chat_retrieval_logs
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Service role manages chat_retrieval_logs" ON public.chat_retrieval_logs;
CREATE POLICY "Service role manages chat_retrieval_logs"
  ON public.chat_retrieval_logs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
