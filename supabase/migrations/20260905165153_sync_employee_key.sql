-- Carry the employee link from Supabase Auth into the profile.
--
-- employee_key lives in app_metadata, never user_metadata: user_metadata is editable by
-- the account holder, and someone able to rewrite their own key could read a colleague's
-- payout.

create or replace function public.handle_auth_user_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, role, employee_key)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce((new.raw_app_meta_data ->> 'role')::public.app_role, 'manager'),
    nullif(
      lower(regexp_replace(trim(coalesce(new.raw_app_meta_data ->> 'employee_key', '')), '\s+', ' ', 'g')),
      ''
    )
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(nullif(excluded.full_name, ''), profiles.full_name),
        role = excluded.role,
        employee_key = coalesce(excluded.employee_key, profiles.employee_key);
  return new;
end;
$$;
