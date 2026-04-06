
-- Enable pgvector extension
create extension if not exists vector with schema extensions;

-- Create company_embeddings table
create table public.company_embeddings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  content text not null,
  embedding extensions.vector(1536),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint company_embeddings_company_id_key unique (company_id)
);

-- RLS
alter table public.company_embeddings enable row level security;

create policy "Authenticated can read company_embeddings"
  on public.company_embeddings for select to authenticated using (true);

create policy "Service role can manage company_embeddings"
  on public.company_embeddings for all to service_role using (true) with check (true);

-- RPC for semantic search
create or replace function public.match_companies(
  query_embedding extensions.vector(1536),
  match_threshold float default 0.3,
  match_count int default 10
)
returns table (
  id uuid,
  company_id uuid,
  content text,
  similarity float
)
language plpgsql
stable
security definer
set search_path = 'public'
as $$
begin
  return query
  select
    ce.id,
    ce.company_id,
    ce.content,
    (1 - (ce.embedding <=> query_embedding))::float as similarity
  from public.company_embeddings ce
  where 1 - (ce.embedding <=> query_embedding) > match_threshold
  order by ce.embedding <=> query_embedding
  limit match_count;
end;
$$;
