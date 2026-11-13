-- ============================================================================
-- Tree Navigator — Supabase schema
-- Run once in the Supabase SQL editor (safe to re-run; it is idempotent).
--
-- Flow:  user -> plant_submissions (pending) -> admin approve -> plants (public)
--                                            -> admin reject  -> rejected (never public)
-- XP:    +10 only on approval, exactly once (row lock + unique xp_events row).
-- Admin: a row in public.admin_users. Never writable from the client.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id             uuid primary key references auth.users (id) on delete cascade,
  full_name      text,
  avatar_url     text,
  xp             integer     not null default 0 check (xp >= 0),
  level          integer     not null default 1,
  streak         integer     not null default 0,
  verified_count integer     not null default 0,
  created_at     timestamptz not null default now()
);
alter table public.profiles add column if not exists verified_count integer not null default 0;
alter table public.profiles add column if not exists streak integer not null default 0;
alter table public.profiles add column if not exists level integer not null default 1;
alter table public.profiles add column if not exists created_at timestamptz not null default now();

create table if not exists public.admin_users (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.plants (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null,
  image_url            text,
  landmark             text,
  latitude             double precision not null check (latitude between -90 and 90),
  longitude            double precision not null check (longitude between -180 and 180),
  location_source      text,
  gps_accuracy         double precision,
  source_submission_id uuid unique,
  submitted_by         uuid references auth.users (id) on delete set null,
  approved_by          uuid references auth.users (id) on delete set null,
  approved_at          timestamptz,
  created_at           timestamptz not null default now()
);
alter table public.plants add column if not exists location_source text;
alter table public.plants add column if not exists gps_accuracy double precision;
alter table public.plants add column if not exists source_submission_id uuid unique;
alter table public.plants add column if not exists submitted_by uuid references auth.users (id) on delete set null;
alter table public.plants add column if not exists approved_by uuid references auth.users (id) on delete set null;
alter table public.plants add column if not exists approved_at timestamptz;

create table if not exists public.plant_submissions (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users (id) on delete cascade,
  plant_name            text not null check (char_length(btrim(plant_name)) between 1 and 120),
  image_url             text,
  latitude              double precision not null check (latitude between -90 and 90),
  longitude             double precision not null check (longitude between -180 and 180),
  location_source       text check (location_source in ('gps', 'map')),
  gps_accuracy          double precision,
  landmark              text check (landmark is null or char_length(landmark) <= 160),
  status                text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  rejection_reason      text,
  reviewed_by           uuid references auth.users (id) on delete set null,
  reviewed_at           timestamptz,
  plant_id              uuid references public.plants (id) on delete set null,
  xp_awarded            integer not null default 0,
  level_before          integer,
  level_after           integer,
  achievements_unlocked text[] not null default '{}',
  reward_seen           boolean not null default false,
  created_at            timestamptz not null default now()
);
alter table public.plant_submissions add column if not exists location_source text;
alter table public.plant_submissions add column if not exists gps_accuracy double precision;
alter table public.plant_submissions add column if not exists rejection_reason text;
alter table public.plant_submissions add column if not exists reviewed_by uuid references auth.users (id) on delete set null;
alter table public.plant_submissions add column if not exists reviewed_at timestamptz;
alter table public.plant_submissions add column if not exists plant_id uuid references public.plants (id) on delete set null;
alter table public.plant_submissions add column if not exists xp_awarded integer not null default 0;
alter table public.plant_submissions add column if not exists level_before integer;
alter table public.plant_submissions add column if not exists level_after integer;
alter table public.plant_submissions add column if not exists achievements_unlocked text[] not null default '{}';
alter table public.plant_submissions add column if not exists reward_seen boolean not null default false;

create index if not exists plant_submissions_status_idx on public.plant_submissions (status, created_at desc);
create index if not exists plant_submissions_user_idx on public.plant_submissions (user_id, created_at desc);
create index if not exists plants_name_idx on public.plants (lower(name));

-- One row per rewarded submission: the idempotency guard for XP.
create table if not exists public.xp_events (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  submission_id uuid not null unique references public.plant_submissions (id) on delete cascade,
  amount        integer not null,
  reason        text not null default 'plant_approved',
  created_at    timestamptz not null default now()
);

create table if not exists public.achievements (
  code  text primary key,
  label text not null,
  goal  integer not null,
  sort  integer not null default 0
);
create table if not exists public.user_achievements (
  user_id     uuid not null references auth.users (id) on delete cascade,
  code        text not null references public.achievements (code) on delete cascade,
  unlocked_at timestamptz not null default now(),
  primary key (user_id, code)
);

insert into public.achievements (code, label, goal, sort) values
  ('first_plant', 'First plant', 1, 1),
  ('five_verified', '5 verified', 5, 2),
  ('ten_verified', '10 verified', 10, 3),
  ('plant_hunter', 'Plant hunter', 25, 4)
on conflict (code) do update set label = excluded.label, goal = excluded.goal, sort = excluded.sort;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admin_users a where a.user_id = auth.uid());
$$;

create or replace function public.level_for_xp(p_xp integer)
returns integer language sql immutable as $$ select greatest(p_xp, 0) / 100 + 1; $$;

-- New auth user -> profile row.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (new.id,
          nullif(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), ''),
          new.raw_user_meta_data ->> 'avatar_url')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill profiles for users that signed up before this trigger existed.
insert into public.profiles (id, full_name)
select u.id, nullif(btrim(coalesce(u.raw_user_meta_data ->> 'full_name', '')), '')
from auth.users u
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Moderation RPCs (security definer; every one re-checks is_admin())
-- ---------------------------------------------------------------------------
create or replace function public.approve_submission(p_submission_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s            public.plant_submissions;
  v_plant_id   uuid;
  v_xp_before  integer;
  v_xp_after   integer;
  v_verified   integer;
  v_lvl_before integer;
  v_lvl_after  integer;
  v_unlocked   text[] := '{}';
  v_inserted   integer;
  c_reward constant integer := 10;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;

  -- Row lock: a second concurrent click waits, then sees status = approved.
  select * into s from public.plant_submissions where id = p_submission_id for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;

  if s.status = 'approved' then
    return jsonb_build_object('status', 'approved', 'already', true, 'plant_id', s.plant_id);
  end if;
  if s.status = 'rejected' then
    raise exception 'ALREADY_REJECTED' using errcode = 'P0001';
  end if;

  insert into public.plants as p
    (name, image_url, landmark, latitude, longitude, location_source, gps_accuracy,
     source_submission_id, submitted_by, approved_by, approved_at)
  values
    (btrim(s.plant_name), s.image_url, s.landmark, s.latitude, s.longitude, s.location_source,
     s.gps_accuracy, s.id, s.user_id, auth.uid(), now())
  on conflict (source_submission_id) do update
    set name = excluded.name, image_url = excluded.image_url, landmark = excluded.landmark,
        latitude = excluded.latitude, longitude = excluded.longitude,
        approved_by = excluded.approved_by, approved_at = excluded.approved_at
  returning p.id into v_plant_id;

  -- XP ledger insert is the idempotency guard; only reward when it inserted.
  insert into public.xp_events (user_id, submission_id, amount)
  values (s.user_id, s.id, c_reward)
  on conflict (submission_id) do nothing;
  get diagnostics v_inserted = row_count;

  insert into public.profiles (id) values (s.user_id) on conflict (id) do nothing;
  select xp into v_xp_before from public.profiles where id = s.user_id for update;
  v_xp_after := v_xp_before;
  select verified_count into v_verified from public.profiles where id = s.user_id;

  if v_inserted = 1 then
    v_xp_after := v_xp_before + c_reward;
    v_verified := v_verified + 1;
    update public.profiles
       set xp = v_xp_after, verified_count = v_verified, level = public.level_for_xp(v_xp_after)
     where id = s.user_id;

    with new_rows as (
      insert into public.user_achievements (user_id, code)
      select s.user_id, a.code from public.achievements a where a.goal <= v_verified
      on conflict do nothing
      returning code
    )
    select coalesce(array_agg(code), '{}') into v_unlocked from new_rows;
  end if;

  v_lvl_before := public.level_for_xp(v_xp_before);
  v_lvl_after  := public.level_for_xp(v_xp_after);

  update public.plant_submissions
     set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(), plant_id = v_plant_id,
         rejection_reason = null,
         xp_awarded = case when v_inserted = 1 then c_reward else xp_awarded end,
         level_before = v_lvl_before, level_after = v_lvl_after,
         achievements_unlocked = v_unlocked, reward_seen = false
   where id = s.id;

  return jsonb_build_object('status', 'approved', 'already', false, 'plant_id', v_plant_id,
                            'xp_awarded', case when v_inserted = 1 then c_reward else 0 end);
end;
$$;

create or replace function public.reject_submission(p_submission_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare s public.plant_submissions;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  select * into s from public.plant_submissions where id = p_submission_id for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  if s.status = 'rejected' then return jsonb_build_object('status', 'rejected', 'already', true); end if;
  if s.status = 'approved' then raise exception 'ALREADY_APPROVED' using errcode = 'P0001'; end if;

  update public.plant_submissions
     set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(),
         rejection_reason = nullif(left(btrim(coalesce(p_reason, '')), 300), ''), reward_seen = true
   where id = s.id;
  return jsonb_build_object('status', 'rejected', 'already', false);
end;
$$;

-- Admin queue: submissions + submitter name, filtered by status.
create or replace function public.admin_list_submissions(p_status text default 'pending')
returns table (
  id uuid, user_id uuid, submitted_by text, plant_name text, image_url text,
  latitude double precision, longitude double precision, location_source text,
  gps_accuracy double precision, landmark text, status text, rejection_reason text,
  created_at timestamptz, reviewed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  return query
    select s.id, s.user_id, coalesce(nullif(pr.full_name, ''), 'Explorer'), s.plant_name, s.image_url,
           s.latitude, s.longitude, s.location_source, s.gps_accuracy, s.landmark, s.status,
           s.rejection_reason, s.created_at, s.reviewed_at
      from public.plant_submissions s
      left join public.profiles pr on pr.id = s.user_id
     where s.status = p_status
     order by case when p_status = 'pending' then s.created_at end asc,
              coalesce(s.reviewed_at, s.created_at) desc
     limit 200;
end;
$$;

create or replace function public.admin_submission_counts()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  return (select jsonb_build_object(
    'pending',  count(*) filter (where status = 'pending'),
    'approved', count(*) filter (where status = 'approved'),
    'rejected', count(*) filter (where status = 'rejected'))
    from public.plant_submissions);
end;
$$;

-- User marks the reward animation as seen (cannot touch any other column).
create or replace function public.ack_reward(p_submission_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.plant_submissions set reward_seen = true
   where id = p_submission_id and user_id = auth.uid() and status = 'approved';
$$;

-- ---------------------------------------------------------------------------
-- Leaderboard view (admins are excluded; they do not play)
-- ---------------------------------------------------------------------------
create or replace view public.leaderboard as
select p.id, p.full_name, p.avatar_url, p.xp, p.level, p.verified_count,
       rank() over (order by p.xp desc, p.verified_count desc, p.created_at asc) as rank
  from public.profiles p
 where not exists (select 1 from public.admin_users a where a.user_id = p.id);

-- ---------------------------------------------------------------------------
-- Row level security + privileges
-- ---------------------------------------------------------------------------
alter table public.profiles          enable row level security;
alter table public.plants            enable row level security;
alter table public.plant_submissions enable row level security;
alter table public.admin_users       enable row level security;
alter table public.xp_events         enable row level security;
alter table public.achievements      enable row level security;
alter table public.user_achievements enable row level security;

-- profiles: public read; a user may only change name/avatar (never xp/level/etc.)
drop policy if exists "profiles read" on public.profiles;
create policy "profiles read" on public.profiles for select using (true);
drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own" on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());
revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (full_name, avatar_url) on public.profiles to authenticated;

-- plants: public read of approved records only; all writes go through RPCs.
drop policy if exists "plants read" on public.plants;
create policy "plants read" on public.plants for select using (true);
revoke insert, update, delete on public.plants from anon, authenticated;

-- plant_submissions: users insert/read their own pending rows; admins read all.
drop policy if exists "submissions insert own" on public.plant_submissions;
create policy "submissions insert own" on public.plant_submissions for insert to authenticated
  with check (
    user_id = auth.uid() and status = 'pending' and reviewed_by is null and plant_id is null
    and xp_awarded = 0 and reward_seen = false
  );
drop policy if exists "submissions read own or admin" on public.plant_submissions;
create policy "submissions read own or admin" on public.plant_submissions for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
revoke update, delete on public.plant_submissions from anon, authenticated;
revoke all on public.plant_submissions from anon;

-- admin_users / xp_events: no client access at all.
revoke all on public.admin_users from anon, authenticated;
revoke all on public.xp_events from anon, authenticated;

-- achievements: public read; user_achievements: own rows.
drop policy if exists "achievements read" on public.achievements;
create policy "achievements read" on public.achievements for select using (true);
drop policy if exists "user achievements read own" on public.user_achievements;
create policy "user achievements read own" on public.user_achievements for select to authenticated
  using (user_id = auth.uid());
revoke insert, update, delete on public.achievements, public.user_achievements from anon, authenticated;

grant select on public.leaderboard to anon, authenticated;

revoke execute on function public.approve_submission(uuid)        from public, anon;
revoke execute on function public.reject_submission(uuid, text)   from public, anon;
revoke execute on function public.admin_list_submissions(text)    from public, anon;
revoke execute on function public.admin_submission_counts()       from public, anon;
revoke execute on function public.ack_reward(uuid)                from public, anon;
grant  execute on function public.approve_submission(uuid)        to authenticated;
grant  execute on function public.reject_submission(uuid, text)   to authenticated;
grant  execute on function public.admin_list_submissions(text)    to authenticated;
grant  execute on function public.admin_submission_counts()       to authenticated;
grant  execute on function public.ack_reward(uuid)                to authenticated;
grant  execute on function public.is_admin()                      to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Storage buckets (public read; users write only inside their own folder)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public) values
  ('plant-images', 'plant-images', true),
  ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

drop policy if exists "tn images read" on storage.objects;
create policy "tn images read" on storage.objects for select
  using (bucket_id in ('plant-images', 'avatars'));

drop policy if exists "tn images insert own" on storage.objects;
create policy "tn images insert own" on storage.objects for insert to authenticated
  with check (bucket_id in ('plant-images', 'avatars') and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "tn avatars update own" on storage.objects;
create policy "tn avatars update own" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "tn avatars delete own" on storage.objects;
create policy "tn avatars delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- Realtime (profile XP + submission status updates in the user app)
-- ---------------------------------------------------------------------------
do $$
begin
  begin alter publication supabase_realtime add table public.profiles;          exception when others then null; end;
  begin alter publication supabase_realtime add table public.plant_submissions; exception when others then null; end;
  begin alter publication supabase_realtime add table public.plants;            exception when others then null; end;
end $$;

-- ---------------------------------------------------------------------------
-- Make someone an admin (run manually, NOT from the app):
--   insert into public.admin_users (user_id)
--   select id from auth.users where email = 'admin@example.com';
-- ---------------------------------------------------------------------------
