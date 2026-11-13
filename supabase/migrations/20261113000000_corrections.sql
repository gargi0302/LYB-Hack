-- "Teach Basellion": corrections of the photo AI (see lib/memory.ts), plus example photos of
-- known items added by the team (no user, no AI answer), for instance the items used in the demo.
-- embedding: what the model saw in the photo (1024 numbers). Everyone signed in can read the
-- embeddings and types, so a correction helps all users at once. The photo (a small JPEG of the
-- item) and who sent it stay private: only the retraining script reads them, with the service key.
create table corrections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid default auth.uid() references profiles (id) on delete cascade, -- empty: added by the team
  created_at timestamptz not null default now(),
  ai_type plastic,
  type plastic not null,
  name text check (length(name) <= 60), -- what the item is, e.g. "Dark Fantasy wrapper"
  embedding real[] not null check (cardinality(embedding) = 1024),
  photo text check (length(photo) < 100000),
  check (type <> ai_type or name is not null) -- the AI's own answer only counts with a name for the item
);

alter table corrections enable row level security;
create policy "teach as yourself" on corrections for insert to authenticated
  with check (user_id = auth.uid() and ai_type is not null);
create policy "everyone learns" on corrections for select to authenticated using (true);

revoke all on corrections from anon, authenticated;
grant insert (ai_type, type, name, embedding, photo) on corrections to authenticated;
grant select (type, name, embedding) on corrections to authenticated;

-- a cap so one account can't flood the memory: 30 corrections a day
create function corrections_per_day() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from corrections where user_id = new.user_id and created_at > now() - interval '1 day') >= 30 then
    raise exception 'Too many corrections today, thank you! Try again tomorrow.';
  end if;
  return new;
end $$;
create trigger corrections_limit before insert on corrections
  for each row execute function corrections_per_day();
