-- Addresses and business locations come from an Indian PIN code: the area (post office locality),
-- city (district) and state are filled in from it, and the map point from the area.
-- The demo rows keep their made-up areas and have no PIN code.
alter table profiles add column pincode text, add column city text, add column state text;
alter table addresses add column pincode text, add column city text, add column state text;
