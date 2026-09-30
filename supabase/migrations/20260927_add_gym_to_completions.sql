-- Studio/gym per training session: machine weights differ between gyms, so the app
-- pre-fills and shows "Letztes Mal" from the same gym. NULL = no gym chosen.
-- Pure ASCII, safe to copy/paste into the Supabase SQL Editor.
ALTER TABLE workout_completions ADD COLUMN IF NOT EXISTS gym text;
