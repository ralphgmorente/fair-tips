-- ShiftFlow login schema.
--
-- Authentication itself lives in Supabase Auth (auth.users). This migration adds the
-- application-side profile that hangs off each auth user, so the app has a name and a
-- role to show and to authorize against.
--
-- Accounts are admin-seeded (see scripts/seed-user.ts); self-signup is disabled in
-- supabase/config.toml, so nothing here needs to guard against public registration.

create type public.app_role as enum ('manager', 'admin');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text not null default '',
  role public.app_role not null default 'manager',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'Application profile for each Supabase Auth user. One row per auth.users row.';

alter table public.profiles enable row level security;

-- A signed-in user may read and update only their own profile. There is deliberately no
-- insert policy and no delete policy: rows are created by the trigger below and removed
-- by the cascade from auth.users, both of which run as the definer and bypass RLS.
create policy "Users can read their own profile"
  on public.profiles
  for select
  to authenticated
  using ((select auth.uid()) = id);

create policy "Users can update their own profile"
  on public.profiles
  for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Keep updated_at honest.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row
  execute function public.set_updated_at();

-- Mirror auth users into public.profiles.
--
-- This fires on UPDATE as well as INSERT on purpose: Supabase Auth creates the auth.users
-- row first and writes custom app_metadata in a second statement, so an insert-only
-- trigger reads the row before the role is set and every account lands on the default.
--
-- security definer is required because the auth service, not the end user, writes to
-- auth.users.
create or replace function public.handle_auth_user_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    -- Role is read from app_metadata, never user_metadata: user_metadata is editable by
    -- the user themselves and must never drive an authorization decision.
    coalesce((new.raw_app_meta_data ->> 'role')::public.app_role, 'manager')
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(nullif(excluded.full_name, ''), profiles.full_name),
        role = excluded.role;
  return new;
end;
$$;

create trigger on_auth_user_changed
  after insert or update of email, raw_app_meta_data, raw_user_meta_data on auth.users
  for each row
  execute function public.handle_auth_user_change();
