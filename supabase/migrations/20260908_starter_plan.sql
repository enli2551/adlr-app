/*
  Starter-Plan: a shareable beginner full-body plan that any new client can
  self-activate before their trainer builds a personal plan.

  Run in Supabase Dashboard → SQL Editor.

  What it does:
   1. adds plans.is_starter flag
   2. broadens the SELECT policies so starter plans (+ their days) are readable
      by any authenticated user (needed so a fresh client can see/activate them)
   3. adds the "Low Row (Maschine)" exercise (reuses the Sitzrudern demo image)
   4. seeds one starter plan (3 training days + rest days) — Ganzkörper A/B/C

  Clients activate it via a client_plans insert (already allowed by RLS:
  client_plans_insert permits auth.uid() = client_id).
*/

-- 1) flag ------------------------------------------------------------------
ALTER TABLE plans ADD COLUMN IF NOT EXISTS is_starter boolean NOT NULL DEFAULT false;

-- 2) RLS: allow reading starter plans + their days ------------------------
DROP POLICY IF EXISTS "plans_select" ON plans;
CREATE POLICY "plans_select" ON plans FOR SELECT TO authenticated USING (
  auth.uid() = trainer_id
  OR plans.is_starter = true
  OR EXISTS (SELECT 1 FROM client_plans cp WHERE cp.plan_id = plans.id AND cp.client_id = auth.uid())
);

DROP POLICY IF EXISTS "plan_days_select" ON plan_days;
CREATE POLICY "plan_days_select" ON plan_days FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM plans WHERE plans.id = plan_days.plan_id AND (
      plans.trainer_id = auth.uid()
      OR plans.is_starter = true
      OR EXISTS (SELECT 1 FROM client_plans cp WHERE cp.plan_id = plans.id AND cp.client_id = auth.uid())
    )
  )
);

-- 3) missing exercise: Low Row (Maschine) --------------------------------
INSERT INTO exercises (name, muscle_group, equipment, tempo, default_sets, default_reps, default_rest_sec, exercise_id, cues)
SELECT 'Low Row (Maschine)', 'Rücken', 'Maschine', '2-1-2', 3, 12, 60, '0861',
  ARRAY[
    'Brust ans Polster, Griffe fassen, Arme lang nach vorne.',
    'Nach hinten-unten ziehen, Ellbogen nah am Körper führen.',
    'Schulterblätter zusammenziehen, kurz halten.',
    'Langsam kontrolliert zurück in die Dehnung.'
  ]
WHERE NOT EXISTS (SELECT 1 FROM exercises WHERE name = 'Low Row (Maschine)');

-- 4) seed the starter plan ------------------------------------------------
INSERT INTO plans (id, trainer_id, name, is_starter)
VALUES ('a0000000-0000-4000-8000-000000000001', 'd8915bc7-2d4a-4682-9a17-464254f096f5', 'Starter-Plan · Ganzkörper', true)
ON CONFLICT (id) DO UPDATE SET is_starter = true, name = EXCLUDED.name;

DELETE FROM plan_days WHERE plan_id = 'a0000000-0000-4000-8000-000000000001';
INSERT INTO plan_days (plan_id, day_of_week, workout_name, focus, difficulty, exercises, is_rest_day) VALUES
  ('a0000000-0000-4000-8000-000000000001', 0, 'Ganzkörper A', 'Ganzkörper', 1,
    '[{"name":"Hackenschmidt Kniebeuge","sets":3,"reps":10,"rest_sec":90},{"name":"Bankdrücken","sets":3,"reps":10,"rest_sec":90},{"name":"Latzug","sets":3,"reps":12,"rest_sec":60},{"name":"Low Row (Maschine)","sets":3,"reps":12,"rest_sec":60},{"name":"Reverse Fly","sets":3,"reps":15,"rest_sec":45},{"name":"Dead Bug","sets":3,"reps":12,"rest_sec":45}]'::jsonb, false),
  ('a0000000-0000-4000-8000-000000000001', 1, NULL, NULL, 1, '[]'::jsonb, true),
  ('a0000000-0000-4000-8000-000000000001', 2, 'Ganzkörper B', 'Ganzkörper', 1,
    '[{"name":"T-Bar Rudern","sets":3,"reps":10,"rest_sec":90},{"name":"Rumänisches Kreuzheben","sets":3,"reps":10,"rest_sec":90},{"name":"Beinbeuger","sets":3,"reps":12,"rest_sec":60},{"name":"Schulterdrücken","sets":3,"reps":10,"rest_sec":75},{"name":"Side Plank","sets":3,"reps":30,"rest_sec":45}]'::jsonb, false),
  ('a0000000-0000-4000-8000-000000000001', 3, NULL, NULL, 1, '[]'::jsonb, true),
  ('a0000000-0000-4000-8000-000000000001', 4, 'Ganzkörper C / Cardio', 'Ganzkörper + Cardio', 1,
    '[{"name":"Kelch-Kniebeuge","sets":3,"reps":12,"rest_sec":75},{"name":"Brustpresse (Maschine)","sets":3,"reps":12,"rest_sec":60},{"name":"Pec Fly (Maschine)","sets":3,"reps":12,"rest_sec":60},{"name":"Russian Twists","sets":3,"reps":20,"rest_sec":45},{"name":"Gehen am Steigungslaufband","sets":1,"reps":20,"rest_sec":0}]'::jsonb, false),
  ('a0000000-0000-4000-8000-000000000001', 5, NULL, NULL, 1, '[]'::jsonb, true),
  ('a0000000-0000-4000-8000-000000000001', 6, NULL, NULL, 1, '[]'::jsonb, true);
