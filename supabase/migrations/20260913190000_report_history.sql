-- Saved report history, so a manager or staff member can look back at earlier periods.
--
-- Deliberately NOT stored: the raw CSV contents. A Clover export carries card auth codes,
-- transaction ids and customer names, and this database is reachable with a publishable
-- key. History needs the results, not the source rows, so each upload is recorded by
-- fingerprint only and the numbers are kept alongside the period.

-- Everything the dashboard shows for a period, kept as one document so the view stays
-- simple and new metrics do not need a migration each time.
alter table public.pay_periods
  add column if not exists metrics jsonb not null default '{}'::jsonb;

comment on column public.pay_periods.metrics is
  'Derived dashboard figures for the period: sales, labour, tip rate, order and tender mix.';

create table public.report_uploads (
  id uuid primary key default gen_random_uuid(),
  pay_period_id uuid not null references public.pay_periods (id) on delete cascade,
  kind text not null check (kind in ('orders', 'payments', 'timesheet')),
  file_name text not null,
  row_count integer not null default 0,
  -- sha256 of the file's parsed contents. Two uploads of the same export share a hash,
  -- which is what lets a re-upload be recognised instead of silently duplicating a period.
  content_hash text not null,
  uploaded_by uuid references auth.users (id) on delete set null,
  uploaded_at timestamptz not null default now(),
  unique (pay_period_id, kind)
);

create index report_uploads_hash_idx on public.report_uploads (content_hash);

comment on table public.report_uploads is
  'Fingerprint of each file behind a period. No file contents are stored.';

alter table public.report_uploads enable row level security;

-- Same shape as payouts: managers manage, everyone signed in can see what a published
-- period was built from.
create policy "Read uploads for published periods"
  on public.report_uploads for select to authenticated
  using (
    public.is_manager()
    or exists (
      select 1 from public.pay_periods period
      where period.id = report_uploads.pay_period_id and period.status = 'published'
    )
  );

create policy "Managers write uploads"
  on public.report_uploads for all to authenticated
  using (public.is_manager())
  with check (public.is_manager());
