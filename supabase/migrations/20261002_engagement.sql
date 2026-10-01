-- Engagement: monthly challenge + leaderboard, weekly check-in, streak freeze.
-- Pure ASCII, safe to copy/paste into the Supabase SQL Editor. Idempotent.
-- Needs 20261001_multi_trainer.sql (is_trainer_of, my_trainer) to be run first.

-- ── Monthly challenge (one per trainer and month) ───────────────────────────
CREATE TABLE IF NOT EXISTS monthly_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  month date NOT NULL,                       -- first day of the month
  metric text NOT NULL DEFAULT 'workouts' CHECK (metric IN ('workouts', 'volume', 'minutes')),
  goal numeric NOT NULL DEFAULT 12 CHECK (goal > 0),
  title text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trainer_id, month)
);
ALTER TABLE monthly_challenges ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "mc_trainer" ON monthly_challenges;
CREATE POLICY "mc_trainer" ON monthly_challenges FOR ALL TO authenticated
  USING (trainer_id = auth.uid()) WITH CHECK (trainer_id = auth.uid());
DROP POLICY IF EXISTS "mc_client_read" ON monthly_challenges;
CREATE POLICY "mc_client_read" ON monthly_challenges FOR SELECT TO authenticated
  USING (trainer_id = public.my_trainer());

-- Clients choose whether they appear (first name + initial) in their coach's ranking.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS leaderboard_opt_in boolean NOT NULL DEFAULT false;

-- Leaderboard of the caller's coach group for a month. Clients see opted-in clients
-- (plus themselves); the trainer sees all of their clients. Only aggregates leave the DB.
CREATE OR REPLACE FUNCTION public.challenge_board(p_month date)
RETURNS TABLE (client_id uuid, display_name text, value numeric, opted_in boolean, is_me boolean)
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_trainer boolean;
  v_coach uuid;
  v_metric text;
  v_from timestamptz := date_trunc('month', p_month::timestamp);
  v_to timestamptz := date_trunc('month', p_month::timestamp) + interval '1 month';
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;
  SELECT (role = 'trainer') INTO v_is_trainer FROM profiles WHERE id = v_uid;
  v_coach := CASE WHEN v_is_trainer THEN v_uid ELSE (SELECT trainer_id FROM profiles WHERE id = v_uid) END;
  IF v_coach IS NULL THEN RETURN; END IF;
  SELECT metric INTO v_metric FROM monthly_challenges WHERE trainer_id = v_coach AND month = date_trunc('month', p_month::timestamp)::date;
  v_metric := COALESCE(v_metric, 'workouts');

  RETURN QUERY
  SELECT p.id,
         trim(COALESCE(p.first_name, 'Klient') || ' ' || COALESCE(left(p.last_name, 1) || '.', '')),
         CASE v_metric
           WHEN 'workouts' THEN (SELECT count(*)::numeric FROM workout_completions w
                                 WHERE w.client_id = p.id AND w.completed_at >= v_from AND w.completed_at < v_to)
           WHEN 'minutes' THEN (SELECT COALESCE(round(sum(w.duration_sec) / 60.0), 0) FROM workout_completions w
                                WHERE w.client_id = p.id AND w.completed_at >= v_from AND w.completed_at < v_to)
           ELSE (SELECT COALESCE(round(sum(l.weight_kg * l.reps)), 0) FROM exercise_set_logs l
                 JOIN workout_completions w ON w.id = l.workout_completion_id
                 WHERE l.client_id = p.id AND w.completed_at >= v_from AND w.completed_at < v_to
                   AND COALESCE(l.set_type, 'working') <> 'warmup')
         END,
         p.leaderboard_opt_in,
         p.id = v_uid
  FROM profiles p
  WHERE p.trainer_id = v_coach AND p.role = 'client'
    AND (v_is_trainer OR p.leaderboard_opt_in OR p.id = v_uid);
END $$;
GRANT EXECUTE ON FUNCTION public.challenge_board(date) TO authenticated;

-- ── Weekly check-in ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS weekly_checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  week_start date NOT NULL,                  -- Monday of the week the check-in is about
  weight_kg numeric,
  energy smallint CHECK (energy BETWEEN 1 AND 5),
  sleep smallint CHECK (sleep BETWEEN 1 AND 5),
  stress smallint CHECK (stress BETWEEN 1 AND 5),
  nutrition smallint CHECK (nutrition BETWEEN 1 AND 5),
  wins text,
  struggles text,
  trainer_reply text,
  replied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, week_start)
);
CREATE INDEX IF NOT EXISTS weekly_checkins_client_idx ON weekly_checkins (client_id, week_start DESC);
ALTER TABLE weekly_checkins ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "wci_own_or_coach" ON weekly_checkins;
CREATE POLICY "wci_own_or_coach" ON weekly_checkins FOR ALL TO authenticated
  USING (client_id = auth.uid() OR public.is_trainer_of(client_id))
  WITH CHECK (client_id = auth.uid() OR public.is_trainer_of(client_id));

-- Clients can't write the coach's reply; the coach can't rewrite the client's answers.
CREATE OR REPLACE FUNCTION public._adlr_protect_checkin()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() = NEW.client_id THEN
    NEW.trainer_reply := CASE WHEN TG_OP = 'UPDATE' THEN OLD.trainer_reply ELSE NULL END;
    NEW.replied_at := CASE WHEN TG_OP = 'UPDATE' THEN OLD.replied_at ELSE NULL END;
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.weight_kg := OLD.weight_kg; NEW.energy := OLD.energy; NEW.sleep := OLD.sleep;
    NEW.stress := OLD.stress; NEW.nutrition := OLD.nutrition; NEW.wins := OLD.wins; NEW.struggles := OLD.struggles;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS adlr_protect_checkin ON weekly_checkins;
CREATE TRIGGER adlr_protect_checkin BEFORE INSERT OR UPDATE ON weekly_checkins
  FOR EACH ROW EXECUTE FUNCTION public._adlr_protect_checkin();

-- ── Streak freeze ("Serie schützen"): one protected week per calendar month ──
CREATE TABLE IF NOT EXISTS streak_freezes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, week_start)
);
ALTER TABLE streak_freezes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sf_read" ON streak_freezes;
CREATE POLICY "sf_read" ON streak_freezes FOR SELECT TO authenticated
  USING (client_id = auth.uid() OR public.is_trainer_of(client_id));
-- Writes only through use_streak_freeze() (enforces the monthly limit).

CREATE OR REPLACE FUNCTION public.use_streak_freeze(p_week_start date)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_allowed'; END IF;
  IF extract(isodow FROM p_week_start) <> 1 THEN RAISE EXCEPTION 'not_a_monday'; END IF;
  -- Only the current or the previous week.
  IF p_week_start < (date_trunc('week', now())::date - 7) OR p_week_start > date_trunc('week', now())::date THEN
    RAISE EXCEPTION 'week_out_of_range';
  END IF;
  IF EXISTS (SELECT 1 FROM streak_freezes WHERE client_id = v_uid
             AND date_trunc('month', created_at) = date_trunc('month', now())) THEN
    RAISE EXCEPTION 'already_used_this_month';
  END IF;
  INSERT INTO streak_freezes (client_id, week_start) VALUES (v_uid, p_week_start)
  ON CONFLICT (client_id, week_start) DO NOTHING;
END $$;
GRANT EXECUTE ON FUNCTION public.use_streak_freeze(date) TO authenticated;
