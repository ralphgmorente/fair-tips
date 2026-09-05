-- Make republishing a period replace it rather than duplicate it.
--
-- Publishing inserted a new row every time, so a manager pressing the button twice gave
-- staff the same week listed twice and no way to tell which figure was owed.

alter table public.pay_periods
  add column if not exists period_key text;

-- Identify a period by its date range where the reports carried dates, and by its label
-- otherwise, so a re-run of the same upload lands on the same row.
update public.pay_periods
set period_key = coalesce(starts_on::text || '_' || ends_on::text, label)
where period_key is null;

alter table public.pay_periods
  alter column period_key set not null;

create unique index if not exists pay_periods_period_key_idx
  on public.pay_periods (period_key);

comment on column public.pay_periods.period_key is
  'Stable identity for a pay period so republishing updates it instead of adding a duplicate.';
