-- Cleanup: workouts saved several times by repeated taps on "Training beenden"
-- (calendar shows "Training + Training + Training", every set appears 2–3×).
--
-- A row counts as a duplicate ONLY if an earlier row of the SAME client has
--   • the same plan day and the same title,
--   • exactly the same logged sets (exercise, set no., weight, reps),
--   • and was completed less than 10 minutes before it.
-- The earliest row is always kept. Nothing else is touched (plans, links, other workouts).
-- Set logs of a removed duplicate go with it (exercise_set_logs … ON DELETE CASCADE).
--
-- STEP 1 — run this SELECT alone first and look at the list (read-only).
-- STEP 2 — if the list looks right, run the BEGIN … COMMIT block below.

with sig as (
  select wc.id, wc.client_id, wc.plan_day_id, wc.title, wc.completed_at,
         coalesce((
           select string_agg(l.exercise_name || '|' || l.set_number || '|' || coalesce(l.weight_kg::text, '') || '|' || coalesce(l.reps::text, ''),
                             ';' order by l.exercise_name, l.set_number, l.weight_kg, l.reps)
           from exercise_set_logs l where l.workout_completion_id = wc.id
         ), '') as sets
  from workout_completions wc
),
dup as (
  select distinct b.id as dup_id
  from sig a
  join sig b on b.client_id = a.client_id and b.id <> a.id
   and b.plan_day_id is not distinct from a.plan_day_id
   and b.title is not distinct from a.title
   and b.sets = a.sets
   and b.completed_at >= a.completed_at
   and b.completed_at - a.completed_at < interval '10 minutes'
   and (b.completed_at > a.completed_at or b.id > a.id)
)
select concat_ws(' ', p.first_name, p.last_name) as name, p.email, wc.completed_at, wc.title,
       (select count(*) from exercise_set_logs l where l.workout_completion_id = wc.id) as sets
from dup
join workout_completions wc on wc.id = dup.dup_id
join profiles p on p.id = wc.client_id
order by name, wc.completed_at;

-- ── STEP 2 ────────────────────────────────────────────────────────────────────
/*
begin;

with sig as (
  select wc.id, wc.client_id, wc.plan_day_id, wc.title, wc.completed_at,
         coalesce((
           select string_agg(l.exercise_name || '|' || l.set_number || '|' || coalesce(l.weight_kg::text, '') || '|' || coalesce(l.reps::text, ''),
                             ';' order by l.exercise_name, l.set_number, l.weight_kg, l.reps)
           from exercise_set_logs l where l.workout_completion_id = wc.id
         ), '') as sets
  from workout_completions wc
),
dup as (
  select distinct b.id as dup_id
  from sig a
  join sig b on b.client_id = a.client_id and b.id <> a.id
   and b.plan_day_id is not distinct from a.plan_day_id
   and b.title is not distinct from a.title
   and b.sets = a.sets
   and b.completed_at >= a.completed_at
   and b.completed_at - a.completed_at < interval '10 minutes'
   and (b.completed_at > a.completed_at or b.id > a.id)
)
delete from workout_completions where id in (select dup_id from dup);

commit;
*/
