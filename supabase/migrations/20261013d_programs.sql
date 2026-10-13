-- Multi-week programs (rule based): a plan can run N weeks; each week may change the
-- volume (sets %), reps (±), load (weight %), RPE (±) or be a deload week. The client's
-- current week is counted from client_plans.assigned_at (reset when the plan is re-assigned).
-- Run in Supabase → SQL Editor (safe to run twice). Until then plans behave as before.

ALTER TABLE plans ADD COLUMN IF NOT EXISTS weeks smallint CHECK (weeks IS NULL OR (weeks BETWEEN 1 AND 52));
ALTER TABLE plans ADD COLUMN IF NOT EXISTS week_rules jsonb;

-- A client editing a shared plan gets a personal copy — it now keeps the program settings.
CREATE OR REPLACE FUNCTION public.client_update_plan_day(p_day_id uuid, p_exercises jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_plan uuid;
  v_dow int;
  v_shared boolean;
  v_new_plan uuid;
  v_day uuid := p_day_id;
  v_bad text;
BEGIN
  IF v_uid IS NULL OR NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_uid AND can_edit_plan) THEN
    RAISE EXCEPTION 'not_allowed';
  END IF;

  SELECT plan_id, day_of_week INTO v_plan, v_dow FROM plan_days WHERE id = p_day_id;
  IF v_plan IS NULL OR NOT EXISTS (
    SELECT 1 FROM client_plans WHERE plan_id = v_plan AND client_id = v_uid AND is_active
  ) THEN
    RAISE EXCEPTION 'not_your_plan';
  END IF;

  IF p_exercises IS NULL OR jsonb_typeof(p_exercises) <> 'array' THEN
    RAISE EXCEPTION 'invalid_exercises';
  END IF;

  -- Only exercises from the library (or ones the trainer already put into this day).
  SELECT e->>'name' INTO v_bad
  FROM jsonb_array_elements(p_exercises) AS e
  WHERE NOT EXISTS (SELECT 1 FROM exercises x WHERE x.name = e->>'name')
    AND NOT EXISTS (
      SELECT 1 FROM plan_days d, jsonb_array_elements(d.exercises) AS o
      WHERE d.id = p_day_id AND o->>'name' = e->>'name'
    )
  LIMIT 1;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'unknown_exercise: %', v_bad;
  END IF;

  -- Shared plan? (other clients on it, template or starter plan) → fork a personal copy.
  SELECT EXISTS (SELECT 1 FROM client_plans WHERE plan_id = v_plan AND client_id <> v_uid)
      OR COALESCE((SELECT (to_jsonb(p)->>'is_template')::boolean
                       OR COALESCE((to_jsonb(p)->>'is_starter')::boolean, false)
                   FROM plans p WHERE p.id = v_plan), false)
    INTO v_shared;

  IF v_shared THEN
    INSERT INTO plans (trainer_id, name, is_template, weeks, week_rules)
    SELECT p.trainer_id,
           p.name || ' · ' || COALESCE((SELECT first_name FROM profiles WHERE id = v_uid), 'Klient'),
           false, p.weeks, p.week_rules
    FROM plans p WHERE p.id = v_plan
    RETURNING id INTO v_new_plan;

    INSERT INTO plan_days (plan_id, day_of_week, workout_name, focus, difficulty, duration_min, notes, exercises, is_rest_day)
    SELECT v_new_plan, day_of_week, workout_name, focus, difficulty, duration_min, notes, exercises, is_rest_day
    FROM plan_days WHERE plan_id = v_plan;

    UPDATE client_plans SET plan_id = v_new_plan
    WHERE client_id = v_uid AND plan_id = v_plan;

    SELECT id INTO v_day FROM plan_days WHERE plan_id = v_new_plan AND day_of_week = v_dow LIMIT 1;
    v_plan := v_new_plan;
  END IF;

  UPDATE plan_days SET exercises = p_exercises WHERE id = v_day;
  UPDATE plans SET client_edited_at = now() WHERE id = v_plan;
  RETURN v_day;
END;
$$;
