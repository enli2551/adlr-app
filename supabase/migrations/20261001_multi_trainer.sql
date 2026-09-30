/*
# Multi-trainer foundation (tenant isolation + invite codes)

ADLR is going to be used by several personal trainers. Until now most policies only
checked "is the caller a trainer?" (is_trainer), so a second trainer would see every
client of every trainer. This migration makes the CLIENT → TRAINER link
(profiles.trainer_id) the single source of access:

  * a client sees their own data;
  * a trainer sees ONLY their own clients (profiles.trainer_id = auth.uid()).

It also fixes three issues that exist even with a single trainer:
  1. Progress photos: any logged-in user could read/overwrite/delete any photo in the
     private `photos` bucket. Now: own folder (<uid>/…) + the client's trainer (read).
  2. session_notes are the trainer's PRIVATE notes but were readable by the client.
  3. A trainer could update ANY profile; a client could flip their own
     can_edit_plan / kcal_target.

Invite codes: every trainer gets profiles.invite_code; a client joins with
join_trainer(code). get_trainer_id() (used by older app builds at sign-up) now keeps
an existing link and only falls back to the first trainer (Peter) when the client
has none — so nothing changes for current clients.

Idempotent: every table's policies are dropped dynamically and recreated, so it is
correct even if the live DB drifted from the migration files. Run in the Supabase
SQL Editor (as one script).

DATA: this migration changes NO existing rows (clients, plans, assignments, logs,
photos, messages stay exactly as they are). It only adds an empty column
(invite_code), helper functions and replaces access policies. Run the pre-check
(20261001_multi_trainer_precheck.sql) first.
*/

-- All-or-nothing: if any statement fails, nothing is changed.
BEGIN;


-- ── Helpers (SECURITY DEFINER → no RLS recursion) ─────────────────────────────
CREATE OR REPLACE FUNCTION public.is_trainer_of(p_client uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_client AND trainer_id = auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.is_trainer_of_folder(p_folder text)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id::text = p_folder AND trainer_id = auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.my_trainer()
RETURNS uuid LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT trainer_id FROM public.profiles WHERE id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.is_trainer_of(uuid), public.is_trainer_of_folder(text), public.my_trainer() TO authenticated;

-- Drop every existing policy on a table (handles drift between files and live DB).
CREATE OR REPLACE FUNCTION public._adlr_drop_policies(p_table text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = p_table LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, p_table);
  END LOOP;
END $$;

-- ── Invite codes ─────────────────────────────────────────────────────────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS invite_code text;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_invite_code_idx ON profiles (invite_code) WHERE invite_code IS NOT NULL;

-- Returns the caller's (trainer's) invite code, creating one on first use.
CREATE OR REPLACE FUNCTION public.my_invite_code()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v text; alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'trainer') THEN
    RAISE EXCEPTION 'trainer_only';
  END IF;
  SELECT invite_code INTO v FROM profiles WHERE id = auth.uid();
  IF v IS NOT NULL THEN RETURN v; END IF;
  LOOP
    v := '';
    FOR i IN 1..6 LOOP
      v := v || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM profiles WHERE invite_code = v);
  END LOOP;
  UPDATE profiles SET invite_code = v WHERE id = auth.uid();
  RETURN v;
END $$;

-- A client joins a trainer by code. Returns the trainer's first name (or NULL if the
-- code is unknown). Deactivates the client's plan from a previous trainer.
CREATE OR REPLACE FUNCTION public.join_trainer(p_code text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_trainer uuid; v_name text; v_old uuid;
BEGIN
  SELECT id, first_name INTO v_trainer, v_name FROM profiles
   WHERE role = 'trainer' AND invite_code = upper(trim(p_code));
  IF v_trainer IS NULL THEN RETURN NULL; END IF;
  SELECT trainer_id INTO v_old FROM profiles WHERE id = auth.uid();
  UPDATE profiles SET trainer_id = v_trainer WHERE id = auth.uid() AND role = 'client';
  IF v_old IS DISTINCT FROM v_trainer AND v_old IS NOT NULL THEN
    UPDATE client_plans SET is_active = false WHERE client_id = auth.uid();
  END IF;
  RETURN COALESCE(v_name, '');
END $$;

-- Backwards compatible: keep an existing link; fall back to the first trainer.
CREATE OR REPLACE FUNCTION public.get_trainer_id()
RETURNS uuid LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT trainer_id FROM public.profiles WHERE id = auth.uid()),
    (SELECT id FROM public.profiles WHERE role = 'trainer' ORDER BY created_at LIMIT 1)
  );
$$;

GRANT EXECUTE ON FUNCTION public.my_invite_code(), public.join_trainer(text), public.get_trainer_id() TO authenticated;

-- ── profiles ─────────────────────────────────────────────────────────────────
SELECT public._adlr_drop_policies('profiles');
CREATE POLICY "prof_select" ON profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_trainer_of(id) OR id = public.my_trainer());
CREATE POLICY "prof_insert" ON profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());
CREATE POLICY "prof_update" ON profiles FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.is_trainer_of(id))
  WITH CHECK (id = auth.uid() OR public.is_trainer_of(id));

-- Clients can't grant themselves coach-controlled settings.
CREATE OR REPLACE FUNCTION public._adlr_protect_profile()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() = NEW.id AND OLD.role = 'client' THEN
    NEW.can_edit_plan := OLD.can_edit_plan;
    NEW.kcal_target := OLD.kcal_target;
    NEW.invite_code := OLD.invite_code;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS adlr_protect_profile ON profiles;
CREATE TRIGGER adlr_protect_profile BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION public._adlr_protect_profile();

-- ── Client-owned data: client + their trainer (read & write) ─────────────────
DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'workout_completions', 'exercise_set_logs', 'progress_entries', 'progress_photos',
    'personal_records', 'daily_checkins', 'messages', 'hydration_logs',
    'nutrition_principle_checkins', 'health_daily'
  ] LOOP
    IF to_regclass('public.' || tbl) IS NULL THEN CONTINUE; END IF;
    PERFORM public._adlr_drop_policies(tbl);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format($p$CREATE POLICY "own_or_coach" ON public.%I FOR ALL TO authenticated
      USING (client_id = auth.uid() OR public.is_trainer_of(client_id))
      WITH CHECK (client_id = auth.uid() OR public.is_trainer_of(client_id))$p$, tbl);
  END LOOP;
END $$;

-- ── Coach writes, client reads ───────────────────────────────────────────────
DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['weekly_messages', 'nutrition_tips', 'sessions'] LOOP
    IF to_regclass('public.' || tbl) IS NULL THEN CONTINUE; END IF;
    PERFORM public._adlr_drop_policies(tbl);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format($p$CREATE POLICY "read_own_or_coach" ON public.%I FOR SELECT TO authenticated
      USING (client_id = auth.uid() OR public.is_trainer_of(client_id))$p$, tbl);
    EXECUTE format($p$CREATE POLICY "coach_write" ON public.%I FOR ALL TO authenticated
      USING (public.is_trainer_of(client_id)) WITH CHECK (public.is_trainer_of(client_id))$p$, tbl);
  END LOOP;
END $$;

-- ── Trainer-private notes ────────────────────────────────────────────────────
SELECT public._adlr_drop_policies('session_notes');
CREATE POLICY "coach_only" ON session_notes FOR ALL TO authenticated
  USING (public.is_trainer_of(client_id)) WITH CHECK (public.is_trainer_of(client_id));

-- ── Upsell requests: client creates, coach handles ───────────────────────────
SELECT public._adlr_drop_policies('upsell_requests');
CREATE POLICY "ur_select" ON upsell_requests FOR SELECT TO authenticated
  USING (client_id = auth.uid() OR public.is_trainer_of(client_id));
CREATE POLICY "ur_insert" ON upsell_requests FOR INSERT TO authenticated
  WITH CHECK (client_id = auth.uid());
CREATE POLICY "ur_update" ON upsell_requests FOR UPDATE TO authenticated
  USING (public.is_trainer_of(client_id)) WITH CHECK (public.is_trainer_of(client_id));

-- ── Progress reports (AI summary): client sees approved only ─────────────────
DO $$ BEGIN
  IF to_regclass('public.progress_reports') IS NOT NULL THEN
    PERFORM public._adlr_drop_policies('progress_reports');
    CREATE POLICY "prr_select" ON progress_reports FOR SELECT TO authenticated
      USING ((client_id = auth.uid() AND status = 'approved') OR public.is_trainer_of(client_id));
    CREATE POLICY "prr_coach_write" ON progress_reports FOR ALL TO authenticated
      USING (public.is_trainer_of(client_id)) WITH CHECK (public.is_trainer_of(client_id));
  END IF;
END $$;

-- ── Plans ────────────────────────────────────────────────────────────────────
SELECT public._adlr_drop_policies('plans');
CREATE POLICY "plans_select" ON plans FOR SELECT TO authenticated
  USING (trainer_id = auth.uid()
      OR public.plan_assigned_to_client(id, auth.uid())
      OR COALESCE(is_starter, false));
CREATE POLICY "plans_write" ON plans FOR ALL TO authenticated
  USING (trainer_id = auth.uid()) WITH CHECK (trainer_id = auth.uid());

SELECT public._adlr_drop_policies('plan_days');
CREATE POLICY "plan_days_select" ON plan_days FOR SELECT TO authenticated
  USING (public.plan_owned_by_trainer(plan_id, auth.uid())
      OR public.plan_assigned_to_client(plan_id, auth.uid())
      OR EXISTS (SELECT 1 FROM plans p WHERE p.id = plan_days.plan_id AND COALESCE(p.is_starter, false)));
CREATE POLICY "plan_days_write" ON plan_days FOR ALL TO authenticated
  USING (public.plan_owned_by_trainer(plan_id, auth.uid()))
  WITH CHECK (public.plan_owned_by_trainer(plan_id, auth.uid()));

SELECT public._adlr_drop_policies('client_plans');
CREATE POLICY "cp_select" ON client_plans FOR SELECT TO authenticated
  USING (client_id = auth.uid() OR public.is_trainer_of(client_id));
CREATE POLICY "cp_write" ON client_plans FOR ALL TO authenticated
  USING (client_id = auth.uid() OR public.is_trainer_of(client_id))
  WITH CHECK (client_id = auth.uid()
      OR (public.is_trainer_of(client_id) AND public.plan_owned_by_trainer(plan_id, auth.uid())));

-- ── Clients may read their own trainer's active offers (Coach tab / upgrades) ─
DO $$ BEGIN
  IF to_regclass('public.packages') IS NOT NULL THEN
    DROP POLICY IF EXISTS "pk_client_read" ON packages;
    CREATE POLICY "pk_client_read" ON packages FOR SELECT TO authenticated
      USING (trainer_id = public.my_trainer());
  END IF;
END $$;

-- ── Storage: progress photos ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "photos_access" ON storage.objects;
DROP POLICY IF EXISTS "photos_insert" ON storage.objects;
DROP POLICY IF EXISTS "photos_update" ON storage.objects;
DROP POLICY IF EXISTS "photos_delete" ON storage.objects;
DROP POLICY IF EXISTS "adlr_photos_read" ON storage.objects;
DROP POLICY IF EXISTS "adlr_photos_write" ON storage.objects;
DROP POLICY IF EXISTS "adlr_avatars" ON storage.objects;

CREATE POLICY "adlr_photos_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'photos' AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR public.is_trainer_of_folder((storage.foldername(name))[1])
  ));
CREATE POLICY "adlr_photos_write" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'photos' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'photos' AND (storage.foldername(name))[1] = auth.uid()::text);
-- avatars bucket is public-read; keep writes open to authenticated users as before
CREATE POLICY "adlr_avatars" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'avatars') WITH CHECK (bucket_id = 'avatars');

DROP FUNCTION public._adlr_drop_policies(text);

COMMIT;
