-- Let an admin add staff without anyone holding the service key.
--
-- Creating a Supabase auth user normally needs the secret key, which is not in this
-- deployment and must never be committed. Instead an admin records an invite, sign-up is
-- opened, and a trigger refuses any registration whose email was not invited. The invite
-- also carries the role and timesheet name, so the account arrives fully configured and
-- nobody can self-assign a role by signing up.

create table public.store_invites (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  email text not null,
  full_name text not null default '',
  role public.app_role not null default 'staff',
  -- Their name on this store's timesheet; how their payouts find them.
  employee_key text,
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  unique (store_id, email)
);

create index store_invites_email_idx on public.store_invites (lower(email));

comment on table public.store_invites is
  'Pending and accepted invitations. An email must appear here before it can register.';

alter table public.store_invites enable row level security;

create policy "Managers see their store's invites"
  on public.store_invites for select to authenticated
  using (app.is_manager_of(store_id));

create policy "Managers manage their store's invites"
  on public.store_invites for all to authenticated
  using (app.is_manager_of(store_id))
  with check (app.is_manager_of(store_id));

-- Only an invited address may register, and the invite decides the role.
create or replace function public.handle_invited_signup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare invite public.store_invites%rowtype;
begin
  select * into invite
  from public.store_invites
  where lower(email) = lower(new.email) and accepted_at is null
  limit 1;

  if invite.id is null then
    raise exception 'This email has not been invited.'
      using errcode = 'check_violation';
  end if;

  -- The membership carries the role, so signing up cannot grant more than was offered.
  insert into public.store_members (store_id, user_id, role, employee_key)
  values (invite.store_id, new.id, invite.role, invite.employee_key)
  on conflict (store_id, user_id) do update
    set role = excluded.role, employee_key = excluded.employee_key;

  update public.store_invites set accepted_at = now() where id = invite.id;

  -- Keep the profile in step for code that still reads it.
  update public.profiles
  set role = invite.role,
      employee_key = coalesce(invite.employee_key, employee_key),
      full_name = coalesce(nullif(invite.full_name, ''), full_name)
  where id = new.id;

  return new;
end;
$$;

-- Runs after the profile trigger, so the profile row exists to update.
create trigger on_auth_user_invited
  after insert on auth.users
  for each row
  execute function public.handle_invited_signup();
