/*
  Add session duration (seconds) to workout_completions.
  The client app now records how long each training session took; the trainer's
  client detail shows it in the Trainings-Historie. Past completions stay NULL
  (shown as no duration); new sessions record it.

  Run in Supabase Dashboard → SQL Editor.
*/

ALTER TABLE workout_completions
  ADD COLUMN IF NOT EXISTS duration_sec integer;
