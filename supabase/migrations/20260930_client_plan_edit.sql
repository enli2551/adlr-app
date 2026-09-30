/*
# Clients may edit their own plan (per-client permission)

- profiles.can_edit_plan: the trainer switches this on per client (ClientDetail).
- plans.client_edited_at: set whenever a client changes a day, so the trainer sees
  "vom Klienten angepasst" on the plan.
- client_update_plan_day(day, exercises): the ONLY write path for clients (plan_days
  RLS stays trainer-only). SECURITY DEFINER, and it checks:
    * the caller has can_edit_plan,
    * the day belongs to the caller's ACTIVE plan,
    * every exercise comes from the exercise library (or was already in that day,
      so custom exercises the trainer added may stay).
  Plans can be shared (templates, the starter plan, one plan assigned to several
  clients). Editing a shared plan would change it for everybody, so on the first
  edit the function forks a personal copy for this client (same trainer, name +
  client first name), re-points the client's assignment to it, and edits the copy.
  Returns the id of the edited day (the copy's day after a fork).

Run in the Supabase SQL Editor.
*/

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS can_edit_plan boolean NOT NULL DEFAULT false;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS client_edited_at timestamptz;

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
    INSERT INTO plans (trainer_id, name, is_template)
    SELECT p.trainer_id,
           p.name || ' · ' || COALESCE((SELECT first_name FROM profiles WHERE id = v_uid), 'Klient'),
           false
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

REVOKE ALL ON FUNCTION public.client_update_plan_day(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.client_update_plan_day(uuid, jsonb) TO authenticated;
