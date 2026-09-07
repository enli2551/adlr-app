/*
# Fix infinite recursion between plans and client_plans RLS policies

## Problem
plans_select checks EXISTS on client_plans; client_plans_select checks EXISTS on plans.
Both tables have RLS enabled, so reading one inside the other's policy triggers the
other's policy, which reads the first again → infinite recursion.

## Fix
Create two SECURITY DEFINER functions that read the other table with RLS bypassed,
then replace the inline EXISTS subqueries in both policies with calls to these functions.
*/

-- Helper: is this plan owned by this trainer? (bypasses RLS)
CREATE OR REPLACE FUNCTION public.plan_owned_by_trainer(plan_uuid uuid, trainer_uuid uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (SELECT 1 FROM public.plans WHERE id = plan_uuid AND trainer_id = trainer_uuid);
$$;

-- Helper: is this plan assigned to this client? (bypasses RLS)
CREATE OR REPLACE FUNCTION public.plan_assigned_to_client(plan_uuid uuid, client_uuid uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (SELECT 1 FROM public.client_plans WHERE plan_id = plan_uuid AND client_id = client_uuid);
$$;

-- plans: break recursion by using the helper function instead of inline EXISTS on client_plans
DROP POLICY IF EXISTS "plans_select" ON plans;
CREATE POLICY "plans_select" ON plans FOR SELECT TO authenticated
  USING (auth.uid() = trainer_id OR public.plan_assigned_to_client(plans.id, auth.uid()));

-- client_plans: break recursion by using the helper function instead of inline EXISTS on plans
DROP POLICY IF EXISTS "client_plans_select" ON client_plans;
CREATE POLICY "client_plans_select" ON client_plans FOR SELECT TO authenticated
  USING (auth.uid() = client_id OR public.plan_owned_by_trainer(client_plans.plan_id, auth.uid()));

-- client_plans insert/update/delete also referenced plans inline — fix those too
DROP POLICY IF EXISTS "client_plans_insert" ON client_plans;
CREATE POLICY "client_plans_insert" ON client_plans FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = client_id OR public.plan_owned_by_trainer(client_plans.plan_id, auth.uid()));

DROP POLICY IF EXISTS "client_plans_update" ON client_plans;
CREATE POLICY "client_plans_update" ON client_plans FOR UPDATE TO authenticated
  USING (auth.uid() = client_id OR public.plan_owned_by_trainer(client_plans.plan_id, auth.uid()))
  WITH CHECK (auth.uid() = client_id OR public.plan_owned_by_trainer(client_plans.plan_id, auth.uid()));

DROP POLICY IF EXISTS "client_plans_delete" ON client_plans;
CREATE POLICY "client_plans_delete" ON client_plans FOR DELETE TO authenticated
  USING (auth.uid() = client_id OR public.plan_owned_by_trainer(client_plans.plan_id, auth.uid()));

-- plan_days select also referenced plans inline — that one is safe (plans → plan_days is one-directional)
-- but update it to use the helper for consistency and to avoid any future recursion risk
DROP POLICY IF EXISTS "plan_days_select" ON plan_days;
CREATE POLICY "plan_days_select" ON plan_days FOR SELECT TO authenticated
  USING (public.plan_owned_by_trainer(plan_days.plan_id, auth.uid()) OR public.plan_assigned_to_client(plan_days.plan_id, auth.uid()));

DROP POLICY IF EXISTS "plan_days_modify" ON plan_days;
CREATE POLICY "plan_days_modify" ON plan_days FOR ALL TO authenticated
  USING (public.plan_owned_by_trainer(plan_days.plan_id, auth.uid()))
  WITH CHECK (public.plan_owned_by_trainer(plan_days.plan_id, auth.uid()));
