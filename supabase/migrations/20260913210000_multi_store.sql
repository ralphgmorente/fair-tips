-- Multi-store: one deployment serving several venues, with people who may work at more
-- than one of them.
--
-- Previously every table was implicitly "this café": a person had one role, one timesheet
-- name, and one set of calculation settings. That cannot express a second location, a
-- food truck run by the same owners, or a barista who covers both.
--
-- Membership, role and timesheet name all move to the store. A truck that shares a store's
-- books stays one store and is separated by its terminal in the settings below; a truck
-- with its own books becomes its own store.

create table public.stores (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- Order timestamps in Clover exports are local to the venue.
  timezone text not null default 'America/Los_Angeles',
  created_at timestamptz not null default now()
);

create table public.store_members (
  store_id uuid not null references public.stores (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.app_role not null default 'staff',
  -- The name this person appears under on THIS store's timesheet. The same person can be
  -- "Ana" at one venue and "Ana Diaz" at another.
  employee_key text,
  created_at timestamptz not null default now(),
  primary key (store_id, user_id)
);

create index store_members_user_idx on public.store_members (user_id);
create index store_members_employee_idx on public.store_members (store_id, employee_key);

-- Helpers live in a private schema. PostgREST exposes only `public`, so a security
-- definer function here cannot be called over the API — which is what makes it safe to
-- let it read membership without tripping the policies that depend on it.
create schema if not exists app;
revoke all on schema app from anon, authenticated;

create or replace function app.is_member(target_store uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.store_members m
    where m.store_id = target_store and m.user_id = (select auth.uid())
  );
$$;

create or replace function app.is_manager_of(target_store uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.store_members m
    where m.store_id = target_store
      and m.user_id = (select auth.uid())
      and m.role in ('manager', 'admin')
  );
$$;

create or replace function app.employee_key_at(target_store uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select m.employee_key from public.store_members m
  where m.store_id = target_store and m.user_id = (select auth.uid());
$$;

grant execute on function app.is_member(uuid), app.is_manager_of(uuid),
  app.employee_key_at(uuid) to authenticated;

-- Scope the existing tables to a store.
alter table public.pay_periods add column if not exists store_id uuid references public.stores (id) on delete cascade;
alter table public.workspace_settings add column if not exists store_id uuid references public.stores (id) on delete cascade;

-- Carry the current data into a first store so nothing is orphaned.
do $$
declare first_store uuid;
begin
  insert into public.stores (name) values ('The American Acai Cafe') returning id into first_store;

  update public.pay_periods set store_id = first_store where store_id is null;
  update public.workspace_settings set store_id = first_store where store_id is null;

  -- Everyone who already had an account keeps their role at that store.
  insert into public.store_members (store_id, user_id, role, employee_key)
  select first_store, p.id, p.role, p.employee_key
  from public.profiles p
  on conflict (store_id, user_id) do nothing;
end $$;

alter table public.pay_periods alter column store_id set not null;

-- A period key is only unique within its store.
drop index if exists pay_periods_period_key_idx;
create unique index pay_periods_store_period_key_idx
  on public.pay_periods (store_id, period_key);

-- Settings are per store; the old single-row constraint no longer applies.
alter table public.workspace_settings drop constraint if exists workspace_settings_singleton;
alter table public.workspace_settings alter column id drop default;
create unique index if not exists workspace_settings_store_idx
  on public.workspace_settings (store_id);

alter table public.stores enable row level security;
alter table public.store_members enable row level security;

create policy "Read stores you belong to"
  on public.stores for select to authenticated
  using (app.is_member(id));

create policy "Read your own memberships"
  on public.store_members for select to authenticated
  using (user_id = (select auth.uid()) or app.is_manager_of(store_id));

create policy "Managers manage their store's members"
  on public.store_members for all to authenticated
  using (app.is_manager_of(store_id))
  with check (app.is_manager_of(store_id));
