-- reset_demo() deletes every batch and loads the demo data again. It was open to every signed-in
-- account; now only Plant X may run it from the app. reset_demo() is defined in seed.sql (with the same
-- check for fresh databases); on a database that already has it, it is wrapped here.
do $$
begin
  if to_regprocedure('public.reset_demo()') is not null and to_regprocedure('public.reset_demo_data()') is null then
    alter function public.reset_demo() rename to reset_demo_data;
    revoke execute on function public.reset_demo_data() from public, anon, authenticated;
    create function public.reset_demo() returns void
    language plpgsql security definer set search_path = public as $f$
    begin
      if auth.uid() is not null and my_role() is distinct from 'plantx' then
        raise exception 'Only Plant X can reset the demo data';
      end if;
      perform reset_demo_data();
    end $f$;
    revoke execute on function public.reset_demo() from public, anon;
    grant execute on function public.reset_demo() to authenticated;
  end if;
end $$;
