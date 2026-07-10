begin;

create table if not exists public.versus_rooms (
  code text primary key,
  room_id uuid not null default gen_random_uuid() unique,
  host_id uuid not null,
  guest_id uuid,
  status text not null default 'waiting' check (status in ('waiting', 'joined', 'active')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '5 minutes'),
  constraint versus_rooms_code_format check (
    code ~ '^(banana|apple|grape|orange|cherry|melon)-(banana|apple|grape|orange|cherry|melon)-(banana|apple|grape|orange|cherry|melon)$'
  ),
  constraint versus_rooms_guest_status check (
    (status = 'waiting' and guest_id is null) or
    (status in ('joined', 'active') and guest_id is not null)
  )
);

alter table public.versus_rooms enable row level security;
revoke all on table public.versus_rooms from anon, authenticated;

create index if not exists versus_rooms_expires_at_idx
  on public.versus_rooms (expires_at);

create or replace function public.create_versus_room(p_host_id uuid)
returns table(room_code text, room_id uuid, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  candidate text;
  inserted_room_id uuid;
  inserted_expires_at timestamptz;
begin
  if p_host_id is null then
    raise exception 'INVALID_PLAYER_ID';
  end if;

  delete from public.versus_rooms where versus_rooms.expires_at <= now();

  for candidate in
    select first_fruit || '-' || second_fruit || '-' || third_fruit
    from unnest(array['banana', 'apple', 'grape', 'orange', 'cherry', 'melon']) first_fruit,
         unnest(array['banana', 'apple', 'grape', 'orange', 'cherry', 'melon']) second_fruit,
         unnest(array['banana', 'apple', 'grape', 'orange', 'cherry', 'melon']) third_fruit
    order by random()
  loop
    insert into public.versus_rooms (code, host_id)
    values (candidate, p_host_id)
    on conflict (code) do nothing
    returning versus_rooms.room_id, versus_rooms.expires_at
      into inserted_room_id, inserted_expires_at;

    if inserted_room_id is not null then
      room_code := candidate;
      room_id := inserted_room_id;
      expires_at := inserted_expires_at;
      return next;
      return;
    end if;
  end loop;

  raise exception 'NO_ROOMS_AVAILABLE';
end;
$$;

create or replace function public.join_versus_room(p_code text, p_guest_id uuid)
returns table(room_code text, room_id uuid, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_guest_id is null or p_code is null then
    raise exception 'INVALID_JOIN_REQUEST';
  end if;

  delete from public.versus_rooms where versus_rooms.expires_at <= now();

  return query
  update public.versus_rooms
  set guest_id = p_guest_id,
      status = 'joined',
      expires_at = now() + interval '5 minutes'
  where code = lower(p_code)
    and status = 'waiting'
    and guest_id is null
    and host_id <> p_guest_id
    and versus_rooms.expires_at > now()
  returning code, versus_rooms.room_id, versus_rooms.expires_at;

  if not found then
    raise exception 'ROOM_NOT_FOUND_OR_FULL';
  end if;
end;
$$;

create or replace function public.start_versus_room(p_room_id uuid, p_host_id uuid, p_guest_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  started boolean;
begin
  update public.versus_rooms
  set status = 'active',
      expires_at = now() + interval '5 minutes'
  where room_id = p_room_id
    and host_id = p_host_id
    and guest_id = p_guest_id
    and status = 'joined'
    and expires_at > now();
  started := found;
  return started;
end;
$$;

create or replace function public.heartbeat_versus_room(p_room_id uuid, p_player_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  touched boolean;
begin
  update public.versus_rooms
  set expires_at = now() + interval '5 minutes'
  where room_id = p_room_id
    and (host_id = p_player_id or guest_id = p_player_id)
    and expires_at > now();
  touched := found;
  return touched;
end;
$$;

create or replace function public.leave_versus_room(p_room_id uuid, p_player_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  changed boolean;
begin
  delete from public.versus_rooms
  where room_id = p_room_id and host_id = p_player_id;
  if found then
    return true;
  end if;

  update public.versus_rooms
  set guest_id = null,
      status = 'waiting',
      expires_at = now() + interval '5 minutes'
  where room_id = p_room_id
    and guest_id = p_player_id
    and status = 'joined';
  if found then
    return true;
  end if;

  update public.versus_rooms
  set expires_at = greatest(expires_at, now() + interval '3 minutes')
  where room_id = p_room_id
    and guest_id = p_player_id
    and status = 'active';
  changed := found;
  return changed;
end;
$$;

create or replace function public.keep_alive()
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  database_time timestamptz;
begin
  delete from public.versus_rooms where expires_at <= now();
  select now() into database_time;
  return database_time;
end;
$$;

revoke all on function public.create_versus_room(uuid) from public;
revoke all on function public.join_versus_room(text, uuid) from public;
revoke all on function public.start_versus_room(uuid, uuid, uuid) from public;
revoke all on function public.heartbeat_versus_room(uuid, uuid) from public;
revoke all on function public.leave_versus_room(uuid, uuid) from public;
revoke all on function public.keep_alive() from public;

grant execute on function public.create_versus_room(uuid) to anon, authenticated;
grant execute on function public.join_versus_room(text, uuid) to anon, authenticated;
grant execute on function public.start_versus_room(uuid, uuid, uuid) to anon, authenticated;
grant execute on function public.heartbeat_versus_room(uuid, uuid) to anon, authenticated;
grant execute on function public.leave_versus_room(uuid, uuid) to anon, authenticated;
grant execute on function public.keep_alive() to service_role;

commit;
