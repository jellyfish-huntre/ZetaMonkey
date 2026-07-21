-- Run this in the Supabase SQL editor after deploying the app changes.
create table if not exists public.feedback_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  feedback_type text not null default 'general'
    check (feedback_type in ('general', 'bug', 'feature')),
  message text not null
    check (char_length(btrim(message)) between 1 and 2000),
  contact_email text
    check (contact_email is null or char_length(contact_email) <= 320),
  status text not null default 'new'
    check (status in ('new', 'reviewed', 'resolved')),
  created_at timestamptz not null default now()
);

alter table public.feedback_submissions enable row level security;

drop policy if exists "Anyone can submit feedback" on public.feedback_submissions;
create policy "Anyone can submit feedback"
  on public.feedback_submissions
  for insert
  to anon, authenticated
  with check (
    (auth.uid() is null and user_id is null)
    or auth.uid() = user_id
  );

-- The public clients can submit only the form fields. Reading feedback remains
-- restricted to the Supabase dashboard/service role.
revoke all on table public.feedback_submissions from anon, authenticated;
grant insert (user_id, feedback_type, message, contact_email)
  on public.feedback_submissions to anon, authenticated;

create index if not exists feedback_submissions_created_at_idx
  on public.feedback_submissions (created_at desc);

create index if not exists feedback_submissions_user_id_idx
  on public.feedback_submissions (user_id)
  where user_id is not null;
