
-- Offer embeddings
CREATE TABLE public.offer_embeddings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id uuid NOT NULL REFERENCES public.portfolio_offers(id) ON DELETE CASCADE,
  content text NOT NULL,
  embedding extensions.vector(1536),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(offer_id)
);

ALTER TABLE public.offer_embeddings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read offer_embeddings" ON public.offer_embeddings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service role can manage offer_embeddings" ON public.offer_embeddings FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Pipeline embeddings (one per offer, contains all entries for that offer)
CREATE TABLE public.pipeline_embeddings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id uuid NOT NULL REFERENCES public.portfolio_offers(id) ON DELETE CASCADE,
  content text NOT NULL,
  embedding extensions.vector(1536),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(offer_id)
);

ALTER TABLE public.pipeline_embeddings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read pipeline_embeddings" ON public.pipeline_embeddings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service role can manage pipeline_embeddings" ON public.pipeline_embeddings FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Ally embeddings
CREATE TABLE public.ally_embeddings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ally_id uuid NOT NULL REFERENCES public.allies(id) ON DELETE CASCADE,
  content text NOT NULL,
  embedding extensions.vector(1536),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(ally_id)
);

ALTER TABLE public.ally_embeddings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read ally_embeddings" ON public.ally_embeddings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service role can manage ally_embeddings" ON public.ally_embeddings FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Match functions
CREATE OR REPLACE FUNCTION public.match_offers(query_embedding extensions.vector, match_threshold double precision DEFAULT 0.3, match_count integer DEFAULT 10)
RETURNS TABLE(id uuid, offer_id uuid, content text, similarity double precision)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
begin
  return query
  select oe.id, oe.offer_id, oe.content,
    (1 - (oe.embedding OPERATOR(extensions.<=>) query_embedding))::double precision as similarity
  from public.offer_embeddings oe
  where oe.embedding is not null
    and (1 - (oe.embedding OPERATOR(extensions.<=>) query_embedding)) > match_threshold
  order by oe.embedding OPERATOR(extensions.<=>) query_embedding
  limit match_count;
end;
$$;

CREATE OR REPLACE FUNCTION public.match_pipeline(query_embedding extensions.vector, match_threshold double precision DEFAULT 0.3, match_count integer DEFAULT 10)
RETURNS TABLE(id uuid, offer_id uuid, content text, similarity double precision)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
begin
  return query
  select pe.id, pe.offer_id, pe.content,
    (1 - (pe.embedding OPERATOR(extensions.<=>) query_embedding))::double precision as similarity
  from public.pipeline_embeddings pe
  where pe.embedding is not null
    and (1 - (pe.embedding OPERATOR(extensions.<=>) query_embedding)) > match_threshold
  order by pe.embedding OPERATOR(extensions.<=>) query_embedding
  limit match_count;
end;
$$;

CREATE OR REPLACE FUNCTION public.match_allies(query_embedding extensions.vector, match_threshold double precision DEFAULT 0.3, match_count integer DEFAULT 10)
RETURNS TABLE(id uuid, ally_id uuid, content text, similarity double precision)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
begin
  return query
  select ae.id, ae.ally_id, ae.content,
    (1 - (ae.embedding OPERATOR(extensions.<=>) query_embedding))::double precision as similarity
  from public.ally_embeddings ae
  where ae.embedding is not null
    and (1 - (ae.embedding OPERATOR(extensions.<=>) query_embedding)) > match_threshold
  order by ae.embedding OPERATOR(extensions.<=>) query_embedding
  limit match_count;
end;
$$;
