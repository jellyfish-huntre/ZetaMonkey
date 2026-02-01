-- Function to handle new user signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, username, high_score, total_games, theme)
  values (
    new.id,
    new.raw_user_meta_data ->> 'username',
    0,
    0,
    'dark'
  );
  return new;
end;
$$;

-- Trigger the function every time a user is created
create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
