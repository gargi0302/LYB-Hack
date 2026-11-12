-- Sign-up lets people choose their role: user, collector, recycler or Plant X.
-- One email = one login = one profile (the profile id is the login id), so an email has exactly
-- one role, and the role is fixed once chosen.
-- Run on a hosted project after 20261112000000_schema.sql (SQL editor), or locally with `npm run reset-db`.

drop policy "sign up as user" on profiles;
create policy "sign up with one role" on profiles for insert to authenticated
  with check (id = auth.uid());

-- "edit own profile" lets people change their name or phone, but never their role
create function keep_role() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.role is distinct from old.role then
    raise exception 'The role of an account cannot be changed';
  end if;
  return new;
end $$;

create trigger profiles_keep_role before update on profiles
  for each row execute function keep_role();
