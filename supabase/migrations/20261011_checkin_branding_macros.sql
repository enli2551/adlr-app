-- Weekly check-in 2.0, coach branding, macros from Apple Health / Health Connect.
-- Run in Supabase Dashboard → SQL Editor (safe to run twice). Until then the app keeps
-- working: the new fields are simply not saved / shown.

-- ── 1. Weekly check-in: auto week summary, coach voice/video reply ─────────────
-- Filled automatically when the client submits: trainings, minutes, volume, Ø steps,
-- Ø kcal/protein/carbs/fat, Ø sleep, weight change … (see src/lib/checkinStats.ts)
ALTER TABLE weekly_checkins ADD COLUMN IF NOT EXISTS stats jsonb;
ALTER TABLE weekly_checkins ADD COLUMN IF NOT EXISTS reply_media_path text; -- storage path in 'feedback'
ALTER TABLE weekly_checkins ADD COLUMN IF NOT EXISTS reply_media_type text CHECK (reply_media_type IN ('audio', 'video'));

-- Coach voice/video replies: private bucket, folder = the client's id.
-- The client's coach writes, the client and their coach read. 50 MB per file.
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('feedback', 'feedback', false, 52428800)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "adlr_feedback_read" ON storage.objects;
CREATE POLICY "adlr_feedback_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'feedback' AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR public.is_trainer_of_folder((storage.foldername(name))[1])
  ));
DROP POLICY IF EXISTS "adlr_feedback_write" ON storage.objects;
CREATE POLICY "adlr_feedback_write" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'feedback' AND public.is_trainer_of_folder((storage.foldername(name))[1]))
  WITH CHECK (bucket_id = 'feedback' AND public.is_trainer_of_folder((storage.foldername(name))[1]));

-- ── 2. Macros per day from the health platform (written by the client app) ─────
ALTER TABLE health_daily ADD COLUMN IF NOT EXISTS protein_g numeric;
ALTER TABLE health_daily ADD COLUMN IF NOT EXISTS carbs_g numeric;
ALTER TABLE health_daily ADD COLUMN IF NOT EXISTS fat_g numeric;

-- ── 3. Coach branding: logo + main colour, shown in the app of their clients ────
-- brand_logo is a small data URL (≤ 320 px, like avatars), brand_color '#RRGGBB'.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS brand_logo text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS brand_color text CHECK (brand_color IS NULL OR brand_color ~ '^#[0-9A-Fa-f]{6}$');
