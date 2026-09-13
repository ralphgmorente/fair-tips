-- Settings that change how tips are calculated belong to the business, not to a browser.
--
-- Kept in localStorage at first, which meant two managers on two laptops could feed the
-- same files in and get different payouts — the event terminal alone moves about $66
-- between people. One row, shared by everyone.

create table public.workspace_settings (
  id boolean primary key default true,
  -- Terminal used at offsite events, matched against the Device column of a Payments
  -- export. Empty means fall back to the CLOVERGO order number.
  event_device_name text not null default '',
  -- Till accounts that are not people, so they are not reported as missing a shift.
  ignored_sales_names text[] not null default '{}',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  -- A single row: the check makes a second one impossible rather than merely unlikely.
  constraint workspace_settings_singleton check (id)
);

insert into public.workspace_settings (id) values (true) on conflict (id) do nothing;

alter table public.workspace_settings enable row level security;

-- Everyone signed in may read them, since they explain the numbers staff are shown.
create policy "Read workspace settings"
  on public.workspace_settings for select to authenticated
  using (true);

create policy "Managers change workspace settings"
  on public.workspace_settings for update to authenticated
  using (public.is_manager())
  with check (public.is_manager());

create trigger workspace_settings_set_updated_at
  before update on public.workspace_settings
  for each row
  execute function public.set_updated_at();
