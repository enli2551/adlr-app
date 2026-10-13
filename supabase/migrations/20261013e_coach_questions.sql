-- Coaches' own questions: extra questions in the intake (Kennenlernen) and in the weekly check-in.
-- Answers are stored with a copy of the question text, so editing/deleting a question never
-- changes old answers: intake → profiles.intake.custom, check-in → weekly_checkins.answers.
-- Run in Supabase → SQL Editor (safe to run twice). Until then the app simply shows no own questions.

CREATE TABLE IF NOT EXISTS coach_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  context text NOT NULL CHECK (context IN ('intake', 'checkin')),
  label text NOT NULL CHECK (char_length(label) BETWEEN 1 AND 300),
  kind text NOT NULL DEFAULT 'text' CHECK (kind IN ('text', 'scale', 'choice', 'yesno', 'number')),
  options text[],                -- for 'choice'
  required boolean NOT NULL DEFAULT false,
  position int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS coach_questions_trainer_idx ON coach_questions (trainer_id, context, position);
ALTER TABLE coach_questions ENABLE ROW LEVEL SECURITY;

-- The coach manages their own questions; their clients can read them.
DROP POLICY IF EXISTS "cq_read" ON coach_questions;
CREATE POLICY "cq_read" ON coach_questions FOR SELECT TO authenticated
  USING (trainer_id = auth.uid() OR trainer_id = public.my_trainer());
DROP POLICY IF EXISTS "cq_write" ON coach_questions;
CREATE POLICY "cq_write" ON coach_questions FOR ALL TO authenticated
  USING (trainer_id = auth.uid())
  WITH CHECK (trainer_id = auth.uid() AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'trainer'));

-- Answers to the coach's check-in questions: [{id, q, kind, a}]
ALTER TABLE weekly_checkins ADD COLUMN IF NOT EXISTS answers jsonb;

-- The coach still can't rewrite the client's answers (now including their own questions).
CREATE OR REPLACE FUNCTION public._adlr_protect_checkin()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() = NEW.client_id THEN
    NEW.trainer_reply := CASE WHEN TG_OP = 'UPDATE' THEN OLD.trainer_reply ELSE NULL END;
    NEW.replied_at := CASE WHEN TG_OP = 'UPDATE' THEN OLD.replied_at ELSE NULL END;
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.weight_kg := OLD.weight_kg; NEW.energy := OLD.energy; NEW.sleep := OLD.sleep;
    NEW.stress := OLD.stress; NEW.nutrition := OLD.nutrition; NEW.wins := OLD.wins; NEW.struggles := OLD.struggles;
    NEW.answers := OLD.answers;
  END IF;
  RETURN NEW;
END $$;
