-- Collectors decide when they are free, how far they go, and what they charge beyond 5 km.
-- Pickups up to 5 km stay free for the user. Further away, the user pays the collector's rate per
-- extra km, in cash at pickup. The database works the charge out, so it can't be changed from the app.

alter table profiles
  add column max_km numeric not null default 5 check (max_km between 1 and 50),
  add column fee_per_km numeric not null default 0 check (fee_per_km between 0 and 100),
  -- free pickup slots as 'weekday-hour', weekday 0 = Sunday, e.g. {'1-9','1-12','3-16'};
  -- empty (null) = every standard slot, as before
  add column free_slots text[];

alter table batches
  add column distance_km numeric,
  add column pickup_fee numeric not null default 0;

-- straight-line distance in km (haversine), the same formula as lib/match.ts
create function distance_km(lat1 float8, lng1 float8, lat2 float8, lng2 float8) returns float8
language sql immutable as $$
  select 2 * 6371 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)))
$$;

-- When a collector is chosen: record the distance and the charge, and refuse a collector who is
-- further away than they said they'd go. Any other update keeps the charge as it was.
create function set_pickup_fee() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  c profiles;
  km float8;
begin
  if tg_op = 'UPDATE' and new.collector_id is not distinct from old.collector_id then
    new.distance_km := old.distance_km;
    new.pickup_fee := old.pickup_fee;
    return new;
  end if;
  if new.collector_id is null then
    new.distance_km := null;
    new.pickup_fee := 0;
    return new;
  end if;
  select * into c from profiles where id = new.collector_id;
  km := distance_km(new.lat, new.lng, c.lat, c.lng);
  if km > c.max_km and coalesce(current_setting('app.seeding', true), '') <> 'on' then
    raise exception '% only collects within % km (this pickup is % km away)', c.name, c.max_km, round(km::numeric, 1);
  end if;
  new.distance_km := round(km::numeric, 1);
  new.pickup_fee := round(greatest(km - 5, 0)::numeric * c.fee_per_km);
  return new;
end $$;

create trigger batches_pickup_fee before insert or update on batches
  for each row execute function set_pickup_fee();
