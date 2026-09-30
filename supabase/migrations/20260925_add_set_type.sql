/*
  Add a warm-up / working-set / drop-set tag to each logged set.
  The client app now lets the user mark a set as "Aufwärmen" (warm-up) or "Dropset"
  instead of a plain working set (default). Past logs stay NULL (treated as a normal
  working set); new sets record the tag. The app retries the insert without this
  column if it's missing, so nothing breaks before this migration is run.

  Run in Supabase Dashboard → SQL Editor.
*/

ALTER TABLE exercise_set_logs
  ADD COLUMN IF NOT EXISTS set_type text CHECK (set_type IN ('warmup', 'working', 'dropset'));
