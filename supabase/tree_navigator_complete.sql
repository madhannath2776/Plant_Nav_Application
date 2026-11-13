-- ============================================================
-- TREE NAVIGATOR / CAMPUSFLORA — COMPLETE SUPABASE DATABASE
-- Corrected for the CURRENT profiles table:
-- id, full_name, avatar_url, xp, level, streak, verified_count, created_at
--
-- IMPORTANT:
-- 1. Run this entire script in Supabase SQL Editor.
-- 2. It is designed to be safe to re-run.
-- 3. Create the admin Auth user separately in Authentication.
-- 4. After Auth user exists, run the ADMIN SETUP block at the bottom.
-- ============================================================

create extension if not exists "uuid-ossp";
create extension if not exists "pg_trgm";

-- ============================================================
-- PROFILES
-- ============================================================

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default 'User',
  avatar_url text,
  xp integer not null default 0,
  level integer not null default 1,
  streak integer not null default 0,
  verified_count integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.profiles add column if not exists full_name text;
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists xp integer not null default 0;
alter table public.profiles add column if not exists level integer not null default 1;
alter table public.profiles add column if not exists streak integer not null default 0;
alter table public.profiles add column if not exists verified_count integer not null default 0;

-- Admin/user role. This was missing from the current database.
alter table public.profiles add column if not exists role text not null default 'user';

-- Migrate an older "name" column if one exists.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='profiles' and column_name='name'
  ) then
    update public.profiles
    set full_name = coalesce(nullif(full_name, ''), name)
    where full_name is null or full_name = '';
  end if;
end $$;

-- Ensure valid role values.
update public.profiles
set role = 'user'
where role is null or role not in ('user','admin');

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('user','admin'));

-- ============================================================
-- PLANT SUBMISSIONS
-- Every user submission remains here as an audit trail.
-- ============================================================

create table if not exists public.plant_submissions (
  id uuid primary key default uuid_generate_v4(),
  plant_name text not null
    check (length(trim(plant_name)) between 1 and 100),
  photo_url text,
  latitude double precision not null
    check (latitude between -90 and 90),
  longitude double precision not null
    check (longitude between -180 and 180),
  location_accuracy double precision
    check (location_accuracy is null or location_accuracy > 0),
  location_source text not null default 'legacy'
    check (location_source in ('gps','map','admin_corrected','legacy')),
  landmark text,
  submitted_by uuid references public.profiles(id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending','approved','rejected')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.plant_submissions
  add column if not exists location_accuracy double precision;
alter table public.plant_submissions
  add column if not exists location_source text default 'legacy';
alter table public.plant_submissions
  add column if not exists rejection_reason text;
alter table public.plant_submissions
  add column if not exists reviewed_by uuid references public.profiles(id) on delete set null;
alter table public.plant_submissions
  add column if not exists reviewed_at timestamptz;
alter table public.plant_submissions
  add column if not exists updated_at timestamptz not null default now();

-- ============================================================
-- PUBLIC VERIFIED PLANTS
-- Only approved records belong here.
-- ============================================================

create table if not exists public.plants (
  id uuid primary key default uuid_generate_v4(),
  plant_name text not null,
  photo_url text,
  latitude double precision not null
    check (latitude between -90 and 90),
  longitude double precision not null
    check (longitude between -180 and 180),
  location_accuracy double precision,
  location_source text
    check (location_source in ('gps','map','admin_corrected','legacy')),
  landmark text,
  submitted_by uuid references public.profiles(id) on delete set null,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  source_submission_id uuid references public.plant_submissions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.plants add column if not exists location_accuracy double precision;
alter table public.plants add column if not exists location_source text;
alter table public.plants add column if not exists approved_by uuid references public.profiles(id) on delete set null;
alter table public.plants add column if not exists approved_at timestamptz;
alter table public.plants add column if not exists source_submission_id uuid references public.plant_submissions(id) on delete set null;

-- ============================================================
-- MIGRATE OLD SINGLE-TABLE plants(status=...) DESIGN
-- ============================================================

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='plants' and column_name='status'
  ) then

    if exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='plants' and column_name='common_name'
    )
    and not exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='plants' and column_name='plant_name'
    ) then
      alter table public.plants rename column common_name to plant_name;
    end if;

    if exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='plants' and column_name='image_url'
    )
    and not exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='plants' and column_name='photo_url'
    ) then
      alter table public.plants rename column image_url to photo_url;
    end if;

    insert into public.plant_submissions (
      plant_name,
      photo_url,
      latitude,
      longitude,
      landmark,
      submitted_by,
      status,
      reviewed_at,
      location_source,
      created_at,
      updated_at
    )
    select
      plant_name,
      photo_url,
      latitude,
      longitude,
      landmark,
      submitted_by,
      case
        when status in ('pending','approved','rejected') then status
        when status = 'verified' then 'approved'
        else 'pending'
      end,
      case
        when status in ('approved','verified','rejected') then updated_at
        else null
      end,
      'legacy',
      created_at,
      updated_at
    from public.plants
    where status not in ('approved','verified');

    delete from public.plants
    where status not in ('approved','verified');

    update public.plants
    set location_source = coalesce(location_source, 'legacy');

    alter table public.plants drop column if exists status;
    alter table public.plants drop column if exists scientific_name;
    alter table public.plants drop column if exists local_name;
    alter table public.plants drop column if exists plant_type;
    alter table public.plants drop column if exists description;
    alter table public.plants drop column if exists campus_zone;
    alter table public.plants drop column if exists points_awarded;

    if exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='plants' and column_name='verified_by'
    ) then
      update public.plants
      set approved_by = verified_by
      where approved_by is null;
      alter table public.plants drop column verified_by;
    end if;

    if exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='plants' and column_name='verified_at'
    ) then
      update public.plants
      set approved_at = verified_at
      where approved_at is null;
      alter table public.plants drop column verified_at;
    end if;
  end if;
end $$;

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================

create or replace function public.update_updated_at()
returns trigger
language plpgsql
security invoker
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists plants_updated_at on public.plants;
create trigger plants_updated_at
before update on public.plants
for each row execute function public.update_updated_at();

drop trigger if exists plant_submissions_updated_at on public.plant_submissions;
create trigger plant_submissions_updated_at
before update on public.plant_submissions
for each row execute function public.update_updated_at();

-- ============================================================
-- INDEXES
-- ============================================================

create index if not exists plants_name_trgm_idx
  on public.plants using gin (plant_name gin_trgm_ops);

create index if not exists plants_coords_idx
  on public.plants(latitude, longitude);

create index if not exists plants_created_at_idx
  on public.plants(created_at desc);

create index if not exists plants_submitted_by_idx
  on public.plants(submitted_by);

create index if not exists plants_source_submission_idx
  on public.plants(source_submission_id);

create index if not exists plant_submissions_status_idx
  on public.plant_submissions(status);

create index if not exists plant_submissions_submitted_by_idx
  on public.plant_submissions(submitted_by);

create index if not exists plant_submissions_created_at_idx
  on public.plant_submissions(created_at desc);

-- ============================================================
-- AUTO CREATE PROFILE WHEN A USER SIGNS UP
-- ============================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id,
    full_name,
    avatar_url,
    xp,
    level,
    streak,
    verified_count,
    role
  )
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data->>'full_name',''),
      nullif(new.raw_user_meta_data->>'name',''),
      split_part(coalesce(new.email,''),'@',1),
      'User'
    ),
    new.raw_user_meta_data->>'avatar_url',
    0,
    1,
    0,
    0,
    'user'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ============================================================
-- ADMIN CHECK HELPER
-- SECURITY DEFINER avoids recursive RLS checks.
-- ============================================================

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- ============================================================
-- APPROVAL REWARD
-- EXACTLY +10 XP ONLY AFTER ADMIN APPROVAL.
-- No XP is awarded when a submission is merely created.
-- ============================================================

create or replace function public.award_approval_xp()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_xp integer;
begin
  update public.profiles
  set
    xp = xp + 10,
    verified_count = verified_count + 1,
    level = greatest(1, ((xp + 10) / 100) + 1)
  where id = new.submitted_by
  returning xp into new_xp;

  return new;
end;
$$;

drop trigger if exists plants_award_approval_xp on public.plants;
create trigger plants_award_approval_xp
after insert on public.plants
for each row execute function public.award_approval_xp();

-- ============================================================
-- LEADERBOARD
-- ============================================================

drop view if exists public.leaderboard;

create view public.leaderboard as
select
  p.id,
  p.full_name,
  p.avatar_url,
  p.xp,
  p.level,
  p.streak,
  p.verified_count,
  rank() over (order by p.xp desc, p.verified_count desc, p.created_at asc) as rank
from public.profiles p
order by p.xp desc, p.verified_count desc, p.created_at asc;

-- ============================================================
-- SEARCH
-- ONLY VERIFIED/PUBLIC plants are searched.
-- ============================================================

create or replace function public.search_plant_names(
  q text,
  max_results integer default 8
)
returns table (
  plant_name text,
  match_count integer
)
language sql
stable
as $$
  select
    pl.plant_name,
    count(*)::int as match_count
  from public.plants pl
  where trim(q) <> ''
    and pl.plant_name ilike '%' || trim(q) || '%'
  group by pl.plant_name
  order by
    (lower(pl.plant_name) = lower(trim(q))) desc,
    count(*) desc,
    pl.plant_name asc
  limit greatest(1, least(max_results, 50));
$$;

-- ============================================================
-- NEAREST PLANTS
-- ============================================================

create or replace function public.nearest_plants_by_name(
  plant_name_query text,
  user_lat double precision default null,
  user_lon double precision default null,
  max_results integer default 50
)
returns table (
  id uuid,
  plant_name text,
  photo_url text,
  latitude double precision,
  longitude double precision,
  landmark text,
  created_at timestamptz,
  distance_metres double precision
)
language sql
stable
as $$
  select
    pl.id,
    pl.plant_name,
    pl.photo_url,
    pl.latitude,
    pl.longitude,
    pl.landmark,
    pl.created_at,
    case
      when user_lat is null or user_lon is null then null
      else
        2 * 6371000 * asin(
          sqrt(
            sin(radians(pl.latitude - user_lat) / 2)^2 +
            cos(radians(user_lat)) *
            cos(radians(pl.latitude)) *
            sin(radians(pl.longitude - user_lon) / 2)^2
          )
        )
    end as distance_metres
  from public.plants pl
  where lower(pl.plant_name) = lower(trim(plant_name_query))
  order by distance_metres asc nulls last
  limit greatest(1, least(max_results, 200));
$$;

-- ============================================================
-- POPULAR PLANTS
-- ============================================================

create or replace function public.popular_plant_names(
  max_results integer default 6
)
returns table (
  plant_name text,
  total integer
)
language sql
stable
as $$
  select
    pl.plant_name,
    count(*)::int as total
  from public.plants pl
  group by pl.plant_name
  order by total desc, pl.plant_name asc
  limit greatest(1, least(max_results, 50));
$$;

-- ============================================================
-- ATOMIC ADMIN APPROVAL
-- Pending submission -> public plants +10 XP in one transaction.
-- ============================================================

create or replace function public.approve_plant_submission(
  submission_id uuid,
  override_plant_name text default null,
  override_latitude double precision default null,
  override_longitude double precision default null,
  override_landmark text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  sub public.plant_submissions%rowtype;
  new_plant_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Only admins can approve submissions';
  end if;

  select *
  into sub
  from public.plant_submissions
  where id = submission_id
  for update;

  if not found then
    raise exception 'Submission not found';
  end if;

  if sub.status <> 'pending' then
    raise exception 'Submission has already been reviewed (status: %)', sub.status;
  end if;

  insert into public.plants (
    plant_name,
    photo_url,
    latitude,
    longitude,
    location_accuracy,
    location_source,
    landmark,
    submitted_by,
    approved_by,
    approved_at,
    source_submission_id
  )
  values (
    coalesce(nullif(trim(override_plant_name), ''), sub.plant_name),
    sub.photo_url,
    coalesce(override_latitude, sub.latitude),
    coalesce(override_longitude, sub.longitude),
    case
      when override_latitude is not null
        or override_longitude is not null
      then null
      else sub.location_accuracy
    end,
    case
      when override_latitude is not null
        or override_longitude is not null
      then 'admin_corrected'
      else sub.location_source
    end,
    coalesce(nullif(trim(override_landmark), ''), sub.landmark),
    sub.submitted_by,
    auth.uid(),
    now(),
    sub.id
  )
  returning id into new_plant_id;

  update public.plant_submissions
  set
    status = 'approved',
    reviewed_by = auth.uid(),
    reviewed_at = now()
  where id = submission_id;

  return new_plant_id;
end;
$$;

grant execute on function public.approve_plant_submission(
  uuid, text, double precision, double precision, text
) to authenticated;

-- ============================================================
-- ADMIN REJECTION
-- No plants row. No XP.
-- ============================================================

create or replace function public.reject_plant_submission(
  submission_id uuid,
  reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  sub public.plant_submissions%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Only admins can reject submissions';
  end if;

  select *
  into sub
  from public.plant_submissions
  where id = submission_id
  for update;

  if not found then
    raise exception 'Submission not found';
  end if;

  if sub.status <> 'pending' then
    raise exception 'Submission has already been reviewed (status: %)', sub.status;
  end if;

  update public.plant_submissions
  set
    status = 'rejected',
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    rejection_reason = nullif(trim(reason), '')
  where id = submission_id;
end;
$$;

grant execute on function public.reject_plant_submission(uuid, text)
to authenticated;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.profiles enable row level security;
alter table public.plant_submissions enable row level security;
alter table public.plants enable row level security;

-- ------------------------------------------------------------
-- PROFILES
-- ------------------------------------------------------------

drop policy if exists profiles_public_read on public.profiles;
create policy profiles_public_read
on public.profiles
for select
to authenticated
using (true);

drop policy if exists profiles_own_insert on public.profiles;
create policy profiles_own_insert
on public.profiles
for insert
to authenticated
with check (
  auth.uid() = id
  and role = 'user'
  and xp = 0
  and level = 1
  and streak = 0
  and verified_count = 0
);

drop policy if exists profiles_own_update on public.profiles;
create policy profiles_own_update
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

-- ------------------------------------------------------------
-- SUBMISSIONS
-- ------------------------------------------------------------

drop policy if exists submissions_read on public.plant_submissions;
create policy submissions_read
on public.plant_submissions
for select
to authenticated
using (
  submitted_by = auth.uid()
  or public.is_admin()
);

drop policy if exists submissions_insert_own_pending on public.plant_submissions;
create policy submissions_insert_own_pending
on public.plant_submissions
for insert
to authenticated
with check (
  auth.uid() = submitted_by
  and status = 'pending'
  and reviewed_by is null
  and reviewed_at is null
);

drop policy if exists submissions_admin_update on public.plant_submissions;
create policy submissions_admin_update
on public.plant_submissions
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists submissions_admin_delete on public.plant_submissions;
create policy submissions_admin_delete
on public.plant_submissions
for delete
to authenticated
using (public.is_admin());

-- ------------------------------------------------------------
-- PLANTS
-- ------------------------------------------------------------

drop policy if exists plants_public_read on public.plants;
create policy plants_public_read
on public.plants
for select
to anon, authenticated
using (true);

drop policy if exists plants_admin_insert on public.plants;
create policy plants_admin_insert
on public.plants
for insert
to authenticated
with check (public.is_admin());

drop policy if exists plants_admin_update on public.plants;
create policy plants_admin_update
on public.plants
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists plants_admin_delete on public.plants;
create policy plants_admin_delete
on public.plants
for delete
to authenticated
using (public.is_admin());

-- ============================================================
-- STORAGE
-- ============================================================

insert into storage.buckets (id, name, public)
values ('plant-images', 'plant-images', true)
on conflict (id) do update set public = true;

drop policy if exists plant_images_public_read on storage.objects;
create policy plant_images_public_read
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'plant-images');

drop policy if exists plant_images_auth_upload on storage.objects;
create policy plant_images_auth_upload
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'plant-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists plant_images_own_update on storage.objects;
create policy plant_images_own_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'plant-images'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_admin()
  )
)
with check (
  bucket_id = 'plant-images'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_admin()
  )
);

drop policy if exists plant_images_own_delete on storage.objects;
create policy plant_images_own_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'plant-images'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_admin()
  )
);

-- ============================================================
-- ADMIN SETUP
-- Run this AFTER creating the Auth user:
--
-- Email: madhannaths2776@gmail.com
-- Password: admin01
--
-- DO NOT put the password in this SQL.
-- Supabase Auth stores the password securely.
-- ============================================================

-- 1) Verify the Auth user:
select id, email
from auth.users
where email = 'madhannaths2776@gmail.com';

-- 2) Promote that Auth user to admin.
update public.profiles
set role = 'admin'
where id = (
  select id
  from auth.users
  where email = 'madhannaths2776@gmail.com'
);

-- 3) If the Auth user has no profile row, create it:
insert into public.profiles (
  id,
  full_name,
  avatar_url,
  xp,
  level,
  streak,
  verified_count,
  role
)
select
  u.id,
  coalesce(
    nullif(u.raw_user_meta_data->>'full_name',''),
    nullif(u.raw_user_meta_data->>'name',''),
    'Madhan'
  ),
  u.raw_user_meta_data->>'avatar_url',
  0,
  1,
  0,
  0,
  'admin'
from auth.users u
where u.email = 'madhannaths2776@gmail.com'
and not exists (
  select 1
  from public.profiles p
  where p.id = u.id
);

-- 4) Final verification:
select
  p.id,
  p.full_name,
  u.email,
  p.role,
  p.xp,
  p.level,
  p.verified_count
from public.profiles p
join auth.users u on u.id = p.id
where u.email = 'madhannaths2776@gmail.com';

-- ============================================================
-- OPTIONAL: SAMPLE PLANTS
-- Leave this section commented out for a clean production DB.
-- ============================================================

-- insert into public.plants
--   (plant_name, latitude, longitude, landmark, location_source, approved_at)
-- values
--   ('Neem Tree', 11.01680, 76.95580, 'Near Biotechnology Block', 'legacy', now()),
--   ('Mango Tree', 11.01720, 76.95620, 'Near Hostel', 'legacy', now()),
--   ('Banyan Tree', 11.01650, 76.95540, 'Main Entrance', 'legacy', now());

-- ============================================================
-- END
-- ============================================================
