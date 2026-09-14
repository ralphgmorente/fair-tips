-- Scope every tip table to the store it belongs to.
--
-- Stores were added, but the rules protecting periods, payouts, upload records and
-- settings were never moved over: they still asked "is this person a manager?" using the
-- single global role on their profile, not "a manager of THIS store". A manager of one
-- restaurant could therefore read and overwrite another restaurant's payouts, and the
-- settings table was readable by everyone signed in, whichever business they belonged to.
--
-- Two roles also disagreed. profiles.role is the account's role; store_members.role is
-- the role at one store. Authorisation now uses only the per-store one, so someone can be
-- a manager at one venue and staff at another without that granting them anything extra.

-- --------------------------------------------------------------------------
-- Settings become one row per store rather than one row for the whole install.
-- --------------------------------------------------------------------------

alter table public.workspace_settings drop constraint if exists workspace_settings_pkey;
alter table public.workspace_settings drop column if exists id;

delete from public.workspace_settings where store_id is null;
alter table public.workspace_settings alter column store_id set not null;

alter table public.workspace_settings
  add constraint workspace_settings_pkey primary key using index workspace_settings_store_idx;

-- Every store needs its row: the event terminal is named per venue.
insert into public.workspace_settings (store_id)
select s.id
from public.stores s
where not exists (
  select 1 from public.workspace_settings w where w.store_id = s.id
);

drop policy if exists "Read workspace settings" on public.workspace_settings;
drop policy if exists "Managers change workspace settings" on public.workspace_settings;

-- Staff may read them, because these settings explain the figures they are shown.
create policy "Read your store's settings"
  on public.workspace_settings for select to authenticated
  using (app.is_member(store_id));

create policy "Managers change their store's settings"
  on public.workspace_settings for all to authenticated
  using (app.is_manager_of(store_id))
  with check (app.is_manager_of(store_id));

-- --------------------------------------------------------------------------
-- Pay periods
-- --------------------------------------------------------------------------

drop policy if exists "Read published periods" on public.pay_periods;
drop policy if exists "Managers write periods" on public.pay_periods;

create policy "Read your store's periods"
  on public.pay_periods for select to authenticated
  using (
    app.is_manager_of(store_id)
    or (status = 'published' and app.is_member(store_id))
  );

create policy "Managers write their store's periods"
  on public.pay_periods for all to authenticated
  using (app.is_manager_of(store_id))
  with check (app.is_manager_of(store_id));

-- --------------------------------------------------------------------------
-- Payouts. A payout has no store of its own; it takes the one on its period.
-- --------------------------------------------------------------------------

drop policy if exists "Read own payout" on public.payouts;
drop policy if exists "Managers write payouts" on public.payouts;

-- Staff match on the name used at THAT store, so the same person can be "Ana" at one
-- venue and "Ana Diaz" at another and still find their own line in both.
create policy "Read your own payout"
  on public.payouts for select to authenticated
  using (
    exists (
      select 1
      from public.pay_periods period
      where period.id = payouts.pay_period_id
        and (
          app.is_manager_of(period.store_id)
          or (
            period.status = 'published'
            and payouts.employee_key is not distinct from app.employee_key_at(period.store_id)
          )
        )
    )
  );

create policy "Managers write their store's payouts"
  on public.payouts for all to authenticated
  using (
    exists (
      select 1 from public.pay_periods period
      where period.id = payouts.pay_period_id and app.is_manager_of(period.store_id)
    )
  )
  with check (
    exists (
      select 1 from public.pay_periods period
      where period.id = payouts.pay_period_id and app.is_manager_of(period.store_id)
    )
  );

-- --------------------------------------------------------------------------
-- Upload records
-- --------------------------------------------------------------------------

drop policy if exists "Read uploads for published periods" on public.report_uploads;
drop policy if exists "Managers write uploads" on public.report_uploads;

create policy "Read uploads for your store's periods"
  on public.report_uploads for select to authenticated
  using (
    exists (
      select 1
      from public.pay_periods period
      where period.id = report_uploads.pay_period_id
        and (
          app.is_manager_of(period.store_id)
          or (period.status = 'published' and app.is_member(period.store_id))
        )
    )
  );

create policy "Managers write their store's uploads"
  on public.report_uploads for all to authenticated
  using (
    exists (
      select 1 from public.pay_periods period
      where period.id = report_uploads.pay_period_id and app.is_manager_of(period.store_id)
    )
  )
  with check (
    exists (
      select 1 from public.pay_periods period
      where period.id = report_uploads.pay_period_id and app.is_manager_of(period.store_id)
    )
  );

-- --------------------------------------------------------------------------
-- Payouts are looked up by store through their period often enough to index for it.
-- --------------------------------------------------------------------------

create index if not exists pay_periods_store_published_idx
  on public.pay_periods (store_id, published_at desc);

comment on column public.profiles.role is
  'The account''s default role. NOT used for authorisation: what someone may do at a
   given store comes from store_members.role for that store.';
