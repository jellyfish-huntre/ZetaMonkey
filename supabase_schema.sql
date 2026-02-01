-- Create a table for user profiles
create table profiles (
  id uuid references auth.users on delete cascade primary key,
  username text unique,
  high_score int default 0,
  total_games int default 0,
  total_questions int default 0,
  theme text default 'dark',
  updated_at timestamp with time zone default timezone('utc'::text, now())
);

-- Set up Row Level Security (RLS)
alter table profiles enable row level security;

create policy "Users can view their own profile."
  on profiles for select
  using ( auth.uid() = id );

create policy "Users can update their own profile."
  on profiles for update
  using ( auth.uid() = id );
