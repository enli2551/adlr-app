-- Plan safety: no hard deletes of plans any more.
-- * Deleting a plan = moving it to the trash (plans.deleted_at). Hidden everywhere by RLS,
--   restorable by its owner — and by the master trainer (Peter) for every coach.
-- * A plan that is still ACTIVE for a client can't be deleted (assign another plan first).
-- * Nobody can DELETE rows from plans directly any more (no DELETE policy) — only through
--   trainer_delete_plan(), which checks ownership. Coaches never touch other coaches' plans
--   (that was already so: every write requires plans.trainer_id = auth.uid()).
-- * Clients may only assign themselves their own plans, the starter plan or their coach's
--   plans, and can't delete a coach's assignment.
-- Run in Supabase → SQL Editor (safe to run twice).

ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS deleted_by uuid;

-- ── plans ──
SELECT public._adlr_drop_policies('plans');
CREATE POLICY "plans_select" ON plans FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND (trainer_id = auth.uid()
      OR public.plan_assigned_to_client(id, auth.uid())
      OR COALESCE(is_starter, false)));
CREATE POLICY "plans_insert" ON plans FOR INSERT TO authenticated
  WITH CHECK (trainer_id = auth.uid() AND deleted_at IS NULL);
CREATE POLICY "plans_update" ON plans FOR UPDATE TO authenticated
  USING (trainer_id = auth.uid() AND deleted_at IS NULL)
  WITH CHECK (trainer_id = auth.uid() AND deleted_at IS NULL);
-- (no DELETE policy on purpose)

-- ── client_plans ──
SELECT public._adlr_drop_policies('client_plans');
CREATE POLICY "cp_select" ON client_plans FOR SELECT TO authenticated
  USING (client_id = auth.uid() OR public.is_trainer_of(client_id));
CREATE POLICY "cp_insert" ON client_plans FOR INSERT TO authenticated
  WITH CHECK (
    (public.is_trainer_of(client_id) AND public.plan_owned_by_trainer(plan_id, auth.uid()))
    OR (client_id = auth.uid() AND EXISTS (SELECT 1 FROM plans p WHERE p.id = plan_id AND p.deleted_at IS NULL
        AND (p.trainer_id = auth.uid() OR COALESCE(p.is_starter, false) OR p.trainer_id = public.my_trainer()))));
CREATE POLICY "cp_update" ON client_plans FOR UPDATE TO authenticated
  USING (client_id = auth.uid() OR public.is_trainer_of(client_id))
  WITH CHECK (
    -- switching a plan OFF is always fine (assigning a new plan retires the old ones)
    NOT is_active
    OR (public.is_trainer_of(client_id) AND public.plan_owned_by_trainer(plan_id, auth.uid()))
    OR (client_id = auth.uid() AND EXISTS (SELECT 1 FROM plans p WHERE p.id = plan_id
        AND (p.trainer_id = auth.uid() OR COALESCE(p.is_starter, false) OR p.trainer_id = public.my_trainer()))));
CREATE POLICY "cp_delete" ON client_plans FOR DELETE TO authenticated
  USING (public.is_trainer_of(client_id) AND public.plan_owned_by_trainer(plan_id, auth.uid()));

-- ── delete = trash ──
CREATE OR REPLACE FUNCTION public.trainer_delete_plan(p_plan uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_owner uuid;
BEGIN
  SELECT trainer_id INTO v_owner FROM plans WHERE id = p_plan AND deleted_at IS NULL;
  IF auth.uid() IS NULL OR v_owner IS NULL OR v_owner <> auth.uid() THEN
    RAISE EXCEPTION 'not_your_plan' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM client_plans WHERE plan_id = p_plan AND is_active AND client_id <> auth.uid()) THEN
    RAISE EXCEPTION 'plan_in_use' USING ERRCODE = 'P0001', HINT = 'The plan is active for a client — assign another plan first.';
  END IF;
  UPDATE client_plans SET is_active = false WHERE plan_id = p_plan;
  UPDATE plans SET deleted_at = now(), deleted_by = auth.uid() WHERE id = p_plan;
END $$;

CREATE OR REPLACE FUNCTION public.trainer_deleted_plans()
RETURNS TABLE (id uuid, name text, trainer_id uuid, trainer_name text, deleted_at timestamptz, exercises int)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_master boolean := COALESCE((SELECT pr.is_master FROM profiles pr WHERE pr.id = auth.uid() AND pr.role = 'trainer'), false);
BEGIN
  RETURN QUERY
  SELECT p.id, p.name, p.trainer_id, COALESCE(NULLIF(trim(concat_ws(' ', o.first_name, o.last_name)), ''), o.email)::text, p.deleted_at,
         COALESCE((SELECT sum(jsonb_array_length(COALESCE(d.exercises, '[]'::jsonb)))::int FROM plan_days d WHERE d.plan_id = p.id), 0)
  FROM plans p LEFT JOIN profiles o ON o.id = p.trainer_id
  WHERE p.deleted_at IS NOT NULL AND (p.trainer_id = auth.uid() OR v_master)
  ORDER BY p.deleted_at DESC
  LIMIT 200;
END $$;

CREATE OR REPLACE FUNCTION public.trainer_restore_plan(p_plan uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_master boolean := COALESCE((SELECT pr.is_master FROM profiles pr WHERE pr.id = auth.uid() AND pr.role = 'trainer'), false);
BEGIN
  UPDATE plans SET deleted_at = NULL, deleted_by = NULL
   WHERE id = p_plan AND deleted_at IS NOT NULL AND (trainer_id = auth.uid() OR v_master);
  IF NOT FOUND THEN RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501'; END IF;
END $$;

REVOKE ALL ON FUNCTION public.trainer_delete_plan(uuid), public.trainer_deleted_plans(), public.trainer_restore_plan(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.trainer_delete_plan(uuid), public.trainer_deleted_plans(), public.trainer_restore_plan(uuid) TO authenticated;

-- Free limit for personal plans: plans in the trash don't count.
CREATE OR REPLACE FUNCTION public._adlr_personal_plan_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_coach uuid;
  v_count int;
BEGIN
  IF v_uid IS NULL OR NEW.trainer_id IS DISTINCT FROM v_uid THEN RETURN NEW; END IF;
  SELECT role, trainer_id INTO v_role, v_coach FROM public.profiles WHERE id = v_uid;
  IF v_role IS DISTINCT FROM 'client' THEN RETURN NEW; END IF;

  -- a client's own plan is always personal, never a template or starter plan
  NEW.is_personal := true;
  NEW.is_template := false;
  IF to_jsonb(NEW) ? 'is_starter' THEN NEW.is_starter := false; END IF;

  IF TG_OP = 'INSERT' AND v_coach IS NULL AND NOT public.is_pro(v_uid) THEN
    SELECT count(*) INTO v_count FROM public.plans WHERE trainer_id = v_uid AND is_personal AND deleted_at IS NULL;
    IF v_count >= 3 THEN
      RAISE EXCEPTION 'plan_limit' USING ERRCODE = 'P0001', HINT = 'Free plan: max. 3 personal plans. ADLR Pro: unlimited.';
    END IF;
  END IF;
  RETURN NEW;
END $$;
