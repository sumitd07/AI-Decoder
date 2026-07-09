-- Decoder — the shelf (glossary) as a database table.
-- This is NEW and separate from schema.sql (which holds cheatsheet_items, the per-user saves).
-- It does NOT touch the extension: the extension still loads a static concepts.js bundle,
-- which we generate FROM this table rather than hand-edit.
-- Run in Supabase: SQL Editor -> paste -> Run. Then run concepts_seed.sql.

create table if not exists public.concepts (
  -- identity (stable slug — never reused, never renamed)
  id          text        primary key,

  -- display fields (mirror the DECODER_CONCEPTS object)
  term        text        not null,
  aliases     text        not null default '',
  said        text        not null default '',
  alias_list  text[]      not null default '{}',
  status      text        not null default 'Core'
                          check (status in ('Core','Rising','Fading','Historical')),
  one_liner   text        not null default '',
  analogy     text        not null default '',
  example     text        not null default '',
  related     jsonb       not null default '[]'::jsonb,  -- [{text, id?}, ...]
  deeper      text        not null default '',

  -- lenses (mirror the DECODER_LENSES object)
  lens_pm     text        not null default '',
  lens_eng    text        not null default '',

  -- metadata for scale
  domain      text,                                       -- taxonomy bucket
  tags        text[]      not null default '{}',
  priority    int         not null default 0,             -- higher = ships in the static "core" bundle
  is_published boolean    not null default true,
  review_state text       not null default 'auto'
                          check (review_state in ('auto','flagged','reviewed')),

  -- full-text search over the human-readable fields (drives long-tail live search)
  search_tsv  tsvector generated always as (
    to_tsvector('english',
      coalesce(term,'') || ' ' || coalesce(aliases,'') || ' ' ||
      coalesce(one_liner,'') || ' ' || coalesce(analogy,'') || ' ' ||
      coalesce(example,'') || ' ' || coalesce(deeper,'')
    )
  ) stored,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists concepts_search_idx   on public.concepts using gin (search_tsv);
create index if not exists concepts_alias_idx     on public.concepts using gin (alias_list);
create index if not exists concepts_domain_idx    on public.concepts (domain);
create index if not exists concepts_priority_idx  on public.concepts (priority desc);

-- keep updated_at fresh
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists concepts_touch on public.concepts;
create trigger concepts_touch before update on public.concepts
  for each row execute function public.touch_updated_at();

-- RLS: the shelf is public, read-only, and only published rows are visible.
-- Writes are NOT granted to any signed-in user here. Admin edits happen through
-- Supabase Studio (service role bypasses RLS) until the custom /admin page is built,
-- at which point an admins() table + write policies get added.
alter table public.concepts enable row level security;

drop policy if exists "public read published concepts" on public.concepts;
create policy "public read published concepts"
  on public.concepts for select
  using (is_published = true);
