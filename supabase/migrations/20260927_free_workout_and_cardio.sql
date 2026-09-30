-- Free workouts (not from the plan) get their own title; plan_day_id stays NULL.
ALTER TABLE workout_completions ADD COLUMN IF NOT EXISTS title text;

-- Cardio logging: time and distance per "set" (e.g. 25 min / 4.2 km on the treadmill).
ALTER TABLE exercise_set_logs ADD COLUMN IF NOT EXISTS duration_sec integer;
ALTER TABLE exercise_set_logs ADD COLUMN IF NOT EXISTS distance_km numeric;
