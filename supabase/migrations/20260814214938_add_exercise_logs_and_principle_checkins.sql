/*
# Exercise set logs & nutrition principle check-ins

## New Tables

1. exercise_set_logs
   - Stores per-set weight/reps for each exercise within a workout completion.
   - Linked to workout_completions (cascade delete) and includes exercise_name,
     set_number, weight_kg, reps, and created_at.
   - Enables "Letztes Mal: 40 kg × 10 Wdh." display and training performance trends.

2. nutrition_principle_checkins
   - Daily Ja/Nein check-in for each nutrition principle.
   - UNIQUE (client_id, principle, log_date) so only one entry per principle per day.
   - Enables weekly summary "Zucker vermieden: 5/7 Tage".

## Security
- RLS enabled on both tables.
- Owner-scoped CRUD (client_id = auth.uid()).
- Trainer can read via EXISTS check (same pattern as other client tables).
*/

CREATE TABLE IF NOT EXISTS exercise_set_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  workout_completion_id uuid REFERENCES workout_completions(id) ON DELETE CASCADE,
  plan_day_id uuid REFERENCES plan_days(id) ON DELETE SET NULL,
  exercise_name text NOT NULL,
  set_number int NOT NULL DEFAULT 1,
  weight_kg numeric,
  reps int,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS exercise_set_logs_client_idx ON exercise_set_logs (client_id);
CREATE INDEX IF NOT EXISTS exercise_set_logs_exercise_idx ON exercise_set_logs (exercise_name, client_id, created_at);

CREATE TABLE IF NOT EXISTS nutrition_principle_checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  principle text NOT NULL,
  adhered boolean NOT NULL,
  log_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, principle, log_date)
);

CREATE INDEX IF NOT EXISTS nutrition_principle_checkins_client_idx ON nutrition_principle_checkins (client_id, log_date);

ALTER TABLE exercise_set_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE nutrition_principle_checkins ENABLE ROW LEVEL SECURITY;

-- exercise_set_logs policies
DROP POLICY IF EXISTS "esl_select" ON exercise_set_logs;
CREATE POLICY "esl_select" ON exercise_set_logs FOR SELECT TO authenticated
  USING (auth.uid() = client_id OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'trainer'));

DROP POLICY IF EXISTS "esl_insert" ON exercise_set_logs;
CREATE POLICY "esl_insert" ON exercise_set_logs FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = client_id);

DROP POLICY IF EXISTS "esl_update" ON exercise_set_logs;
CREATE POLICY "esl_update" ON exercise_set_logs FOR UPDATE TO authenticated
  USING (auth.uid() = client_id) WITH CHECK (auth.uid() = client_id);

DROP POLICY IF EXISTS "esl_delete" ON exercise_set_logs;
CREATE POLICY "esl_delete" ON exercise_set_logs FOR DELETE TO authenticated
  USING (auth.uid() = client_id);

-- nutrition_principle_checkins policies
DROP POLICY IF EXISTS "npc_select" ON nutrition_principle_checkins;
CREATE POLICY "npc_select" ON nutrition_principle_checkins FOR SELECT TO authenticated
  USING (auth.uid() = client_id OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'trainer'));

DROP POLICY IF EXISTS "npc_insert" ON nutrition_principle_checkins;
CREATE POLICY "npc_insert" ON nutrition_principle_checkins FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = client_id);

DROP POLICY IF EXISTS "npc_update" ON nutrition_principle_checkins;
CREATE POLICY "npc_update" ON nutrition_principle_checkins FOR UPDATE TO authenticated
  USING (auth.uid() = client_id) WITH CHECK (auth.uid() = client_id);

DROP POLICY IF EXISTS "npc_delete" ON nutrition_principle_checkins;
CREATE POLICY "npc_delete" ON nutrition_principle_checkins FOR DELETE TO authenticated
  USING (auth.uid() = client_id);
