begin;

-- Remove the two manually reviewed, disqualified submissions.
delete from public.leaderboard
where id in (
  '252e2520-328c-4f26-9616-d9a77d2d8fac',
  'a507cc54-e066-40e5-8619-c89489240142'
);

-- Reject invalid scores even if a client bypasses application validation.
alter table public.leaderboard
  drop constraint if exists leaderboard_score_range;

alter table public.leaderboard
  add constraint leaderboard_score_range
  check (score between 0 and 300);

commit;
