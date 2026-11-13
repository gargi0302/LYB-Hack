-- Plant X sees its own city, not every city on the platform. A batch is "in the city" when its city
-- (from the pickup address's PIN code) matches Plant X's city; when either has no city (the demo data was
-- made before PIN codes), when it is within 25 km of Plant X. Plant X still can't read single batches:
-- these functions return totals only, and only to Plant X (anyone else gets nothing back).

alter table batches add column city text; -- from the pickup address; null on older and demo batches

create function in_city(b_city text, b_lat float8, b_lng float8, p_city text, p_lat float8, p_lng float8) returns boolean
language sql immutable as $$
  select case when b_city is not null and p_city is not null then lower(trim(b_city)) = lower(trim(p_city))
              else distance_km(b_lat, b_lng, p_lat, p_lng) <= 25 end
$$;

-- the signed-in Plant X (none for any other role)
create function my_plant() returns setof profiles
language sql stable security definer set search_path = public as $$
  select * from profiles where id = auth.uid() and role = 'plantx'
$$;

create function city_impact() returns table (week date, area text, plastic plastic, kg numeric, co2e_kg numeric)
language sql stable security definer set search_path = public as $$
  select date_trunc('week', e.created_at)::date, b.area, coalesce(b.actual_type, b.final_type),
         sum(b.actual_kg), round(sum(b.actual_kg * f.kg_co2e_per_kg), 1)
  from my_plant() me
  join batches b on in_city(b.city, b.lat, b.lng, me.city, me.lat, me.lng)
  join status_events e on e.batch_id = b.id and e.to_status = 'recycled'
  join emission_factors f on f.plastic = coalesce(b.actual_type, b.final_type)
  group by 1, 2, 3
  order by 1
$$;

create function city_quality() returns table (area text, checked bigint, match_pct numeric)
language sql stable security definer set search_path = public as $$
  select b.area, count(*), round(100.0 * count(*) filter (where b.actual_type = b.final_type) / count(*))
  from my_plant() me
  join batches b on in_city(b.city, b.lat, b.lng, me.city, me.lat, me.lng)
  where b.actual_type is not null
  group by b.area
  order by 3
$$;

create function city_leaderboard() returns table (id uuid, name text, area text, coins numeric)
language sql stable security definer set search_path = public as $$
  select p.id, p.name, p.area, floor(sum(b.declared_kg) * 10)
  from my_plant() me
  join batches b on in_city(b.city, b.lat, b.lng, me.city, me.lat, me.lng) and b.status >= 'picked_up'
  join profiles p on p.id = b.generator_id
  group by p.id
  order by 4 desc
  limit 5
$$;

-- listings where the photo AI guessed and a person or the recycler changed it (as model_corrections)
create function city_corrections() returns bigint
language sql stable security definer set search_path = public as $$
  select count(*)
  from my_plant() me
  join batches b on in_city(b.city, b.lat, b.lng, me.city, me.lat, me.lng)
  where b.ai_type is not null and b.ai_type <> 'UNCLEAR' and (b.ai_type <> b.final_type or b.actual_type <> b.ai_type)
$$;

revoke execute on function my_plant(), city_impact(), city_quality(), city_leaderboard(), city_corrections() from public, anon;
grant execute on function my_plant(), city_impact(), city_quality(), city_leaderboard(), city_corrections() to authenticated;
