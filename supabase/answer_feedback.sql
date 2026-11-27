-- Decoder — answer feedback (thumbs up / down on decoded sentences).
-- Run once in the Supabase SQL Editor: paste → Run. Safe to re-run.
--
-- Privacy shape (web/privacy.html): a sentence is stored ONLY when a reader votes
-- on its answer. No account id, no page address, no IP. Readers can add rows but
-- can never read them back; only the dashboard (service role) reads.

-- 1. One row per vote. A reader who taps 👎 and then picks a reason makes two
--    rows with the same answer_id; the latest row per answer_id is the vote.
create table if not exists public.answer_feedback (
  id             bigint generated always as identity primary key,
  created_at     timestamptz not null default now(),
  answer_id      uuid        not null,
  surface        text        not null check (surface in ('web', 'extension', 'unknown')),
  vote           text        not null check (vote in ('up', 'down')),
  reason         text        check (reason in ('wrong', 'confusing', 'wrong_term', 'missed_term', 'is_ai', 'other')),
  comment        text        check (char_length(comment) <= 1000),
  kind           text        not null check (kind in ('answer', 'declined')),
  sentence       text        not null check (char_length(sentence) between 1 and 1000),
  restatement    text        not null check (char_length(restatement) <= 4000),
  terms          jsonb       not null default '[]'::jsonb,
  gaps           jsonb       not null default '[]'::jsonb,
  gate           text        check (char_length(gate) <= 40),
  prompt_version text        check (char_length(prompt_version) <= 20),
  shelf_version  text        check (char_length(shelf_version) <= 80)
);
create index if not exists answer_feedback_created_idx on public.answer_feedback (created_at desc);
create index if not exists answer_feedback_answer_idx  on public.answer_feedback (answer_id, created_at desc);

alter table public.answer_feedback enable row level security;
drop policy if exists "anyone can add feedback" on public.answer_feedback;
create policy "anyone can add feedback"
  on public.answer_feedback for insert
  to anon, authenticated
  with check (true);
-- No select/update/delete policy: nobody but the service role can read or change rows.

-- 2. How many answers were shown, per day, surface and kind. Counts only — no
--    sentence text — so "votes / answers shown" has a denominator.
create table if not exists public.answer_counts (
  day     date not null,
  surface text not null,
  kind    text not null,
  gate    text not null,
  n       integer not null default 0,
  primary key (day, surface, kind, gate)
);
alter table public.answer_counts enable row level security;   -- no policies: unreadable from the API

create or replace function public.bump_answer_count(p_surface text, p_kind text, p_gate text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.answer_counts (day, surface, kind, gate, n)
  values (current_date, left(coalesce(p_surface, 'unknown'), 20), left(coalesce(p_kind, 'answer'), 20), left(coalesce(p_gate, 'off'), 40), 1)
  on conflict (day, surface, kind, gate) do update set n = public.answer_counts.n + 1;
$$;
revoke all on function public.bump_answer_count(text, text, text) from public;
grant execute on function public.bump_answer_count(text, text, text) to anon, authenticated;

-- 3. The weekly view. Read it in the Supabase Table Editor / SQL Editor.
--    Revoked from the API roles so it can't leak feedback text.
create or replace view public.answer_feedback_weekly as
with latest as (
  select distinct on (answer_id) *
  from public.answer_feedback
  order by answer_id, created_at desc
), shown as (
  select date_trunc('week', day)::date as week, surface, kind, sum(n) as answers_shown
  from public.answer_counts group by 1, 2, 3
), votes as (
  select date_trunc('week', created_at)::date as week, surface, kind,
         count(*) filter (where vote = 'up')   as up,
         count(*) filter (where vote = 'down') as down,
         count(*) filter (where reason = 'wrong')       as r_wrong,
         count(*) filter (where reason = 'confusing')   as r_confusing,
         count(*) filter (where reason = 'wrong_term')  as r_wrong_term,
         count(*) filter (where reason = 'missed_term') as r_missed_term,
         count(*) filter (where reason = 'is_ai')       as r_is_ai,
         count(*) filter (where reason = 'other')       as r_other
  from latest group by 1, 2, 3
)
select coalesce(v.week, s.week) as week,
       coalesce(v.surface, s.surface) as surface,
       coalesce(v.kind, s.kind) as kind,
       coalesce(s.answers_shown, 0) as answers_shown,
       coalesce(v.up, 0) as up, coalesce(v.down, 0) as down,
       round(100.0 * v.up / nullif(v.up + v.down, 0), 1) as helpful_pct,
       round(100.0 * (v.up + v.down) / nullif(s.answers_shown, 0), 1) as vote_rate_pct,
       v.r_wrong, v.r_confusing, v.r_wrong_term, v.r_missed_term, v.r_is_ai, v.r_other
from votes v
full join shown s on s.week = v.week and s.surface = v.surface and s.kind = v.kind
order by 1 desc, 2, 3;
revoke all on public.answer_feedback_weekly from anon, authenticated;

-- The latest thumbs-down with comments, for the weekly read:
--   select created_at, surface, kind, reason, comment, sentence, restatement, terms, gaps
--   from (select distinct on (answer_id) * from answer_feedback order by answer_id, created_at desc) t
--   where vote = 'down' order by created_at desc limit 50;

-- 4. Retention: 12 months (decided 2026-11-24). If pg_cron is enabled
--    (Database → Extensions → pg_cron), schedule the purge once:
--   select cron.schedule('purge-answer-feedback', '0 3 * * *',
--     $$delete from public.answer_feedback where created_at < now() - interval '12 months'$$);
