-- Decoder — cheatsheet storage with per-user row-level security.
-- Run this in your Supabase project: SQL Editor → paste → Run.

create table if not exists public.cheatsheet_items (
  user_id    uuid        not null references auth.users (id) on delete cascade,
  concept_id text        not null,
  created_at timestamptz not null default now(),
  primary key (user_id, concept_id)
);

alter table public.cheatsheet_items enable row level security;

-- Each user can only see and change their own saved terms.
drop policy if exists "select own cheatsheet" on public.cheatsheet_items;
create policy "select own cheatsheet"
  on public.cheatsheet_items for select
  using (auth.uid() = user_id);

drop policy if exists "insert own cheatsheet" on public.cheatsheet_items;
create policy "insert own cheatsheet"
  on public.cheatsheet_items for insert
  with check (auth.uid() = user_id);

drop policy if exists "delete own cheatsheet" on public.cheatsheet_items;
create policy "delete own cheatsheet"
  on public.cheatsheet_items for delete
  using (auth.uid() = user_id);
