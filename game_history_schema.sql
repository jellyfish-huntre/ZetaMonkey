-- Create a table for individual game sessions
create table public.games (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  score int not null,
  qpm int not null,
  accuracy int not null,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- Set up Row Level Security (RLS)
alter table public.games enable row level security;

create policy "Users can view their own games."
  on public.games for select
  using ( auth.uid() = user_id );

create policy "Users can insert their own games."
  on public.games for insert
  with check ( auth.uid() = user_id );

-- Index for performance
create index games_user_id_idx on public.games (user_id);
create index games_created_at_idx on public.games (created_at desc);
