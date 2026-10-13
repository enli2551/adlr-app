-- RPE / RIR per logged set (supersets, circuits and the RPE/RIR targets themselves live in the
-- plan's exercises jsonb: group, group_type, rpe, rir — no schema change needed for those).
-- Run in Supabase → SQL Editor. Until then the app saves the sets without RPE/RIR.
ALTER TABLE exercise_set_logs ADD COLUMN IF NOT EXISTS rpe numeric CHECK (rpe IS NULL OR (rpe >= 1 AND rpe <= 10));
ALTER TABLE exercise_set_logs ADD COLUMN IF NOT EXISTS rir smallint CHECK (rir IS NULL OR (rir >= 0 AND rir <= 10));
