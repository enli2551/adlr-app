-- Per-exercise notes the client writes during a workout (e.g. "Sitz Stufe 4", "Schulter zwickt"),
-- stored with the session as { "<exercise name>": "<note>" }. The training screen shows the latest
-- note of an exercise again next time; the coach sees them in the training history.
-- Run in Supabase Dashboard → SQL Editor. Until then notes are simply not saved (the workout is).
ALTER TABLE workout_completions ADD COLUMN IF NOT EXISTS exercise_notes jsonb;
