-- Adds the staff role and the link between an account and a person on the timesheet.
--
-- ALTER TYPE ... ADD VALUE is kept in its own migration because the new value cannot be
-- used in the same transaction that introduces it.

alter type public.app_role add value if not exists 'staff';

-- Clover timesheets carry free-text names, so an account is tied to a person by a
-- normalised form of that name rather than by an id the export does not have.
alter table public.profiles
  add column if not exists employee_key text;

comment on column public.profiles.employee_key is
  'Lower-cased, whitespace-collapsed timesheet name this account is paid as. Null for managers.';

create index if not exists profiles_employee_key_idx
  on public.profiles (employee_key)
  where employee_key is not null;
