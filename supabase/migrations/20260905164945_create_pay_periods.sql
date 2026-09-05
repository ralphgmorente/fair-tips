-- Stored payouts, so staff have something to sign in and look at.
--
-- Tip calculation still happens entirely in the manager's browser and uploaded Clover
-- reports are never stored. Only the resulting per-person totals are saved, and only
-- when a manager chooses to publish them.

create type public.pay_period_status as enum ('draft', 'published');

create table public.pay_periods (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  starts_on date,
  ends_on date,
  status public.pay_period_status not null default 'published',
  total_tips numeric(12, 2) not null default 0,
  allocated_tips numeric(12, 2) not null default 0,
  unallocated_tips numeric(12, 2) not null default 0,
  published_by uuid references auth.users (id) on delete set null,
  published_at timestamptz not null default now()
);

create table public.payouts (
  id uuid primary key default gen_random_uuid(),
  pay_period_id uuid not null references public.pay_periods (id) on delete cascade,
  employee_name text not null,
  -- Matches profiles.employee_key so a staff account finds its own row.
  employee_key text not null,
  paid_hours numeric(10, 2) not null default 0,
  store_tips numeric(12, 2) not null default 0,
  event_tips numeric(12, 2) not null default 0,
  total_tips numeric(12, 2) not null default 0,
  share_percent numeric(8, 5) not null default 0,
  unique (pay_period_id, employee_key)
);

create index payouts_employee_key_idx on public.payouts (employee_key);
create index pay_periods_published_at_idx on public.pay_periods (published_at desc);

-- security invoker, so these read profiles as the caller and are covered by the existing
-- "users read their own profile" policy. A definer function here would be a privilege
-- escalation sitting in an API-exposed schema.
create or replace function public.is_manager()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    (select p.role in ('manager', 'admin') from public.profiles p where p.id = (select auth.uid())),
    false
  );
$$;

create or replace function public.current_employee_key()
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select p.employee_key from public.profiles p where p.id = (select auth.uid());
$$;

alter table public.pay_periods enable row level security;
alter table public.payouts enable row level security;

-- Managers see every period; staff see only what has been published to them.
create policy "Read published periods"
  on public.pay_periods for select to authenticated
  using (status = 'published' or public.is_manager());

create policy "Managers write periods"
  on public.pay_periods for all to authenticated
  using (public.is_manager())
  with check (public.is_manager());

-- A staff member reads only their own line, and only once the period is published.
create policy "Read own payout"
  on public.payouts for select to authenticated
  using (
    public.is_manager()
    or (
      employee_key is not distinct from public.current_employee_key()
      and exists (
        select 1 from public.pay_periods period
        where period.id = payouts.pay_period_id and period.status = 'published'
      )
    )
  );

create policy "Managers write payouts"
  on public.payouts for all to authenticated
  using (public.is_manager())
  with check (public.is_manager());
