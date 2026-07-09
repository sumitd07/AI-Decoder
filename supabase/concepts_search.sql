-- Decoder — long-tail search over the shelf.
-- Powers the "type to look up any term" path for terms NOT in the static core bundle.
-- Supabase-side only; does not affect the extension.
-- Run AFTER concepts.sql (needs the concepts table + search_tsv index).

-- Full-text + prefix search, published rows only, ranked by relevance then priority.
create or replace function public.search_concepts(q text, lim int default 20)
returns table (
  id text, term text, aliases text, status text,
  one_liner text, domain text, priority int, rank real
)
language sql stable
security invoker
set search_path = public
as $$
  with query as (
    -- websearch_to_tsquery handles quotes/OR/-; fall back to prefix for short partials
    select case
      when length(trim(q)) = 0 then null
      else websearch_to_tsquery('english', q)
    end as tsq
  )
  select
    c.id, c.term, c.aliases, c.status,
    c.one_liner, c.domain, c.priority,
    ts_rank(c.search_tsv, query.tsq) as rank
  from public.concepts c, query
  where c.is_published = true
    and (
      query.tsq is not null and c.search_tsv @@ query.tsq
      -- alias / prefix match so "embed" finds "embeddings"
      or exists (
        select 1 from unnest(c.alias_list) a
        where a ilike q || '%'
      )
      or c.term ilike q || '%'
    )
  order by rank desc nulls last, c.priority desc, c.term asc
  limit greatest(1, least(lim, 50));
$$;

-- Let the public (anon key) call it, matching the public-read RLS on the table.
grant execute on function public.search_concepts(text, int) to anon, authenticated;

-- Fetch one full term by id (for click-to-open on a long-tail result).
create or replace function public.get_concept(concept_id text)
returns setof public.concepts
language sql stable
security invoker
set search_path = public
as $$
  select * from public.concepts
  where id = concept_id and is_published = true;
$$;

grant execute on function public.get_concept(text) to anon, authenticated;
