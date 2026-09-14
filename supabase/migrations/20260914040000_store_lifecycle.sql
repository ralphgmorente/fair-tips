-- Make a new store usable the moment it exists, and stop tenants colliding.
--
-- Creating a store left it with no settings row and no members, so the first person to
-- open it saw defaults that could not be saved. Opening a second business was therefore
-- a manual database job rather than something the product could do.

-- --------------------------------------------------------------------------
-- A new store arrives complete: its own settings, and its creator as an admin.
-- --------------------------------------------------------------------------

create or replace function public.handle_new_store()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.workspace_settings (store_id)
  values (new.id)
  on conflict (store_id) do nothing;

  -- auth.uid() is null when a store is seeded by a script rather than by a person.
  if (select auth.uid()) is not null then
    insert into public.store_members (store_id, user_id, role)
    values (new.id, (select auth.uid()), 'admin')
    on conflict (store_id, user_id) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists stores_set_up_defaults on public.stores;

create trigger stores_set_up_defaults
  after insert on public.stores
  for each row
  execute function public.handle_new_store();

-- Someone signed in may open a business of their own; the trigger above makes them its
-- admin, so this cannot be used to join a store that already exists.
drop policy if exists "Create your own store" on public.stores;
create policy "Create your own store"
  on public.stores for insert to authenticated
  with check (true);

drop policy if exists "Managers rename their store" on public.stores;
create policy "Managers rename their store"
  on public.stores for update to authenticated
  using (app.is_manager_of(id))
  with check (app.is_manager_of(id));

-- --------------------------------------------------------------------------
-- Uniqueness that has to hold per store, not globally.
-- --------------------------------------------------------------------------

-- Two businesses can upload byte-identical exports, and one pending invite per address
-- per store is the most that can be meaningful.
create unique index if not exists store_invites_pending_idx
  on public.store_invites (store_id, lower(email))
  where accepted_at is null;

-- --------------------------------------------------------------------------
-- Documentation of what identifies whom, since there are now two of each.
-- --------------------------------------------------------------------------

comment on column public.store_members.employee_key is
  'The name this person is called on THIS store''s timesheet. Payouts are matched on it,
   so the same person can be "Ana" at one venue and "Ana Diaz" at another.';

comment on column public.profiles.employee_key is
  'Legacy single-store timesheet name. store_members.employee_key is what payouts match
   on; this remains only so older single-store accounts keep working.';

comment on table public.stores is
  'A tip pool: the group of people who share tips from the same takings. Usually one
   restaurant, but a franchise or a second company is just another row.';
