create or replace function public.match_companies(
  query_embedding extensions.vector(1536),
  match_threshold double precision default 0.3,
  match_count integer default 10
) returns table (
  id uuid,
  company_id uuid,
  content text,
  similarity double precision
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return query
  select
    ce.id,
    ce.company_id,
    ce.content,
    (1 - (ce.embedding OPERATOR(extensions.<=>) query_embedding))::double precision as similarity
  from public.company_embeddings ce
  where ce.embedding is not null
    and (1 - (ce.embedding OPERATOR(extensions.<=>) query_embedding)) > match_threshold
  order by ce.embedding OPERATOR(extensions.<=>) query_embedding
  limit match_count;
end;
$$;