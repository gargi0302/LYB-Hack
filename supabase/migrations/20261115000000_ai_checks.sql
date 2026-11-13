-- "AI checks" on the Plant X dashboard: count only listings where the photo AI gave a guess and a person
-- or the recycler changed it. Listings made by tapping items (no photo scanned) have no AI guess and
-- were wrongly counted as corrections.
create or replace view model_corrections as
select id, ai_type, ai_confidence, final_type, actual_type, created_at
from batches
where ai_type is not null and ai_type <> 'UNCLEAR'
  and (ai_type <> final_type or actual_type <> ai_type);
