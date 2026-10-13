-- Coaches' own exercises and own videos.
--   • exercises.trainer_id: NULL = the shared ADLR library; set = a coach's own exercise, visible
--     only to that coach and their clients.
--   • exercises.video_path: the coach's video for their own exercise ('exercise-videos' bucket).
--   • coach_exercise_media: the coach's own video for ANY exercise (e.g. their bench press
--     demo) — replaces the animation for their clients.
-- Run in Supabase → SQL Editor (safe to run twice). Until then the app shows the shared
-- library only.

ALTER TABLE exercises ADD COLUMN IF NOT EXISTS trainer_id uuid REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS video_path text;
CREATE INDEX IF NOT EXISTS idx_exercises_trainer ON exercises(trainer_id);

-- Shared rows stay public; own rows: the coach + their clients. Writes: only own rows, coaches only.
DROP POLICY IF EXISTS "read_exercises" ON exercises;
CREATE POLICY "read_exercises" ON exercises FOR SELECT TO anon
  USING (trainer_id IS NULL);
DROP POLICY IF EXISTS "read_exercises_auth" ON exercises;
CREATE POLICY "read_exercises_auth" ON exercises FOR SELECT TO authenticated
  USING (trainer_id IS NULL OR trainer_id = auth.uid() OR trainer_id = public.my_trainer());
DROP POLICY IF EXISTS "coach_write_exercises" ON exercises;
CREATE POLICY "coach_write_exercises" ON exercises FOR ALL TO authenticated
  USING (trainer_id = auth.uid())
  WITH CHECK (trainer_id = auth.uid() AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'trainer'));

CREATE TABLE IF NOT EXISTS coach_exercise_media (
  trainer_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  exercise_name text NOT NULL,
  video_path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (trainer_id, exercise_name)
);
ALTER TABLE coach_exercise_media ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cem_read" ON coach_exercise_media;
CREATE POLICY "cem_read" ON coach_exercise_media FOR SELECT TO authenticated
  USING (trainer_id = auth.uid() OR trainer_id = public.my_trainer());
DROP POLICY IF EXISTS "cem_write" ON coach_exercise_media;
CREATE POLICY "cem_write" ON coach_exercise_media FOR ALL TO authenticated
  USING (trainer_id = auth.uid()) WITH CHECK (trainer_id = auth.uid());

-- Videos: private bucket, folder = the coach's id. The coach writes, the coach + their clients read.
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('exercise-videos', 'exercise-videos', false, 52428800)
ON CONFLICT (id) DO NOTHING;
DROP POLICY IF EXISTS "adlr_exvideo_read" ON storage.objects;
CREATE POLICY "adlr_exvideo_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'exercise-videos' AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR (storage.foldername(name))[1] = public.my_trainer()::text
  ));
DROP POLICY IF EXISTS "adlr_exvideo_write" ON storage.objects;
CREATE POLICY "adlr_exvideo_write" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'exercise-videos' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'exercise-videos' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Renaming an own exercise: plans store exercise names, so the coach's plans follow the new name
-- (logged history keeps the name it was trained under).
CREATE OR REPLACE FUNCTION public.rename_coach_exercise(p_old text, p_new text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM exercises WHERE trainer_id = auth.uid() AND name = p_new) THEN
    RAISE EXCEPTION 'not_allowed';
  END IF;
  UPDATE plan_days d
  SET exercises = (
    SELECT jsonb_agg(CASE WHEN x.e->>'name' = p_old THEN jsonb_set(x.e, '{name}', to_jsonb(p_new)) ELSE x.e END ORDER BY x.ord)
    FROM jsonb_array_elements(d.exercises) WITH ORDINALITY AS x(e, ord)
  )
  WHERE d.plan_id IN (SELECT id FROM plans WHERE trainer_id = auth.uid())
    AND d.exercises @> jsonb_build_array(jsonb_build_object('name', p_old));
END $$;
REVOKE ALL ON FUNCTION public.rename_coach_exercise(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rename_coach_exercise(text, text) TO authenticated;
