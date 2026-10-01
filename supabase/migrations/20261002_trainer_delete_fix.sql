-- Fix: trainers could not delete plans or remove clients.
-- Pure ASCII, safe to copy/paste into the Supabase SQL Editor. Idempotent.
--
-- Both actions touched rows the trainer can no longer reach through RLS halfway
-- through (e.g. client_plans of clients who are not linked to the trainer, or the
-- client row right after unlinking it), so parts silently failed. They now run as
-- one server-side function each that checks ownership itself.

-- Delete a plan the caller owns, with its days and every assignment of it.
-- Workout history stays (workout_completions.plan_day_id is set to NULL by the FK).
CREATE OR REPLACE FUNCTION public.trainer_delete_plan(p_plan uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM plans WHERE id = p_plan AND trainer_id = auth.uid()) THEN
    RAISE EXCEPTION 'not_your_plan';
  END IF;
  DELETE FROM client_plans WHERE plan_id = p_plan;
  DELETE FROM plan_days WHERE plan_id = p_plan;
  DELETE FROM plans WHERE id = p_plan;
END $$;

-- Unlink a client from the caller (account and data stay; the client can join
-- another coach with an invite code). Their plan assignments are deactivated.
CREATE OR REPLACE FUNCTION public.trainer_remove_client(p_client uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_client AND trainer_id = auth.uid()) THEN
    RAISE EXCEPTION 'not_your_client';
  END IF;
  UPDATE client_plans SET is_active = false WHERE client_id = p_client;
  UPDATE profiles SET trainer_id = NULL WHERE id = p_client;
END $$;

REVOKE ALL ON FUNCTION public.trainer_delete_plan(uuid), public.trainer_remove_client(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.trainer_delete_plan(uuid), public.trainer_remove_client(uuid) TO authenticated;
