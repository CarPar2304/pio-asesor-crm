
CREATE INDEX IF NOT EXISTS idx_portfolio_offers_name_trgm
  ON public.portfolio_offers USING gin (name gin_trgm_ops);

CREATE OR REPLACE FUNCTION public.find_offer_by_name(_name text, _limit int DEFAULT 5)
RETURNS TABLE(
  id uuid,
  name text,
  product text,
  status text,
  similarity double precision
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH scored AS (
    SELECT
      o.id, o.name, o.product, o.status,
      GREATEST(
        similarity(o.name, _name),
        similarity(coalesce(o.product, ''), _name)
      )::double precision AS sim
    FROM public.portfolio_offers o
    WHERE o.name % _name
       OR o.name ILIKE '%' || _name || '%'
       OR coalesce(o.product, '') % _name
       OR coalesce(o.product, '') ILIKE '%' || _name || '%'
  )
  SELECT s.id, s.name, s.product, s.status, s.sim
  FROM scored s
  WHERE s.sim > 0.1
  ORDER BY s.sim DESC
  LIMIT _limit;
END;
$$;
