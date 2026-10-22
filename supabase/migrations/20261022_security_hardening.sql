/*
# Security & scalability hardening (audit 2026-10-22)

1. Storage
   * `avatars` bucket: every logged-in user could upload, overwrite or delete ANY file in it
     (public bucket → free file hosting for anyone who signs up). The app doesn't use it any
     more, so nobody may write to it now (existing files stay readable).
   * Size / type limits per bucket, so one account can't fill the storage with huge files:
     photos 10 MB images · feedback (coach voice/video replies) 50 MB audio/video ·
     exercise-videos (coach demo clips) 100 MB video.

2. Indexes for the queries every screen runs (client history, coach dashboards, chat).
   Without them each query scans the whole table — fine with 20 users, slow with 2,000.

Run once in the Supabase SQL Editor (safe to run twice).
*/

-- ── 1. Storage ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "adlr_avatars" ON storage.objects;

UPDATE storage.buckets SET file_size_limit = 10 * 1024 * 1024, allowed_mime_types = ARRAY['image/*']
 WHERE id = 'photos';
UPDATE storage.buckets SET file_size_limit = 50 * 1024 * 1024, allowed_mime_types = ARRAY['audio/*', 'video/*']
 WHERE id = 'feedback';
UPDATE storage.buckets SET file_size_limit = 100 * 1024 * 1024, allowed_mime_types = ARRAY['video/*']
 WHERE id = 'exercise-videos';

-- ── 2. Indexes ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS profiles_trainer_idx            ON public.profiles (trainer_id);
CREATE INDEX IF NOT EXISTS workout_completions_client_idx  ON public.workout_completions (client_id, completed_at DESC);
CREATE INDEX IF NOT EXISTS exercise_set_logs_client_time_idx ON public.exercise_set_logs (client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS exercise_set_logs_completion_idx ON public.exercise_set_logs (workout_completion_id);
CREATE INDEX IF NOT EXISTS messages_client_time_idx        ON public.messages (client_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS daily_checkins_client_idx       ON public.daily_checkins (client_id, logged_at DESC);
CREATE INDEX IF NOT EXISTS personal_records_client_idx     ON public.personal_records (client_id);
CREATE INDEX IF NOT EXISTS progress_entries_client_idx     ON public.progress_entries (client_id, logged_at);
CREATE INDEX IF NOT EXISTS progress_photos_client_idx      ON public.progress_photos (client_id);
CREATE INDEX IF NOT EXISTS client_plans_client_idx         ON public.client_plans (client_id) WHERE is_active;
CREATE INDEX IF NOT EXISTS plan_days_plan_idx              ON public.plan_days (plan_id);
CREATE INDEX IF NOT EXISTS plans_trainer_idx               ON public.plans (trainer_id);
CREATE INDEX IF NOT EXISTS sessions_client_time_idx        ON public.sessions (client_id, scheduled_at);
CREATE INDEX IF NOT EXISTS sessions_trainer_time_idx       ON public.sessions (trainer_id, scheduled_at);
CREATE INDEX IF NOT EXISTS weekly_messages_client_idx      ON public.weekly_messages (client_id, created_at DESC);
DO $$ BEGIN
  IF to_regclass('public.health_daily') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS health_daily_client_day_idx ON public.health_daily (client_id, day);
  END IF;
END $$;

-- ── 3. Chat: the sender is who is logged in, not what the app sends ───────────
-- (a coach could post a message as "client" and vice versa)
CREATE OR REPLACE FUNCTION public._adlr_message_sender()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;          -- service role / SQL editor
  IF auth.uid() = NEW.client_id THEN NEW.sender := 'client';
  ELSIF public.is_trainer_of(NEW.client_id) THEN NEW.sender := 'trainer';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS adlr_message_sender ON public.messages;
CREATE TRIGGER adlr_message_sender BEFORE INSERT OR UPDATE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public._adlr_message_sender();

-- ── Check (read-only): limits and the avatars policy ──────────────────────────
SELECT id, public, file_size_limit, allowed_mime_types FROM storage.buckets ORDER BY id;
SELECT policyname FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' ORDER BY 1;
