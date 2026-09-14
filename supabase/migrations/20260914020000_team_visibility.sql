-- Make the team list work.
--
-- Two things stopped Settings showing who is on the team. PostgREST had no declared
-- relationship between a membership row and the profile it belongs to, so asking for
-- both in one query failed and the list came back empty rather than wrong. And the only
-- read policy on profiles let someone read their own row, so even with the relationship
-- a manager would have seen a list of blanks.

alter table public.store_members
  drop constraint if exists store_members_profile_fk;

-- profiles.id is already the auth user id, so this adds a relationship rather than a
-- new rule: any row that satisfied the existing auth.users key satisfies this one.
alter table public.store_members
  add constraint store_members_profile_fk
  foreign key (user_id) references public.profiles (id) on delete cascade;

-- security definer so evaluating it does not re-enter the policies on store_members.
create or replace function app.shares_managed_store(target_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.store_members them
    join public.store_members me on me.store_id = them.store_id
    where them.user_id = target_user
      and me.user_id = (select auth.uid())
      and me.role in ('manager', 'admin')
  );
$$;

grant execute on function app.shares_managed_store(uuid) to authenticated;

drop policy if exists "Managers read their store's profiles" on public.profiles;

create policy "Managers read their store's profiles"
  on public.profiles for select to authenticated
  using (app.shares_managed_store(id));

comment on function app.shares_managed_store(uuid) is
  'True when the caller manages a store the target user belongs to. Scopes a manager''s
   view of profiles to their own team.';
