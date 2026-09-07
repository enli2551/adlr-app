/*
# Fix infinite recursion in profiles RLS policies

## Problem
The `profiles` SELECT/UPDATE policies used an inline subquery:
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'trainer')
This queries `profiles` from within a policy ON `profiles`, causing infinite recursion.

## Fix
Create a SECURITY DEFINER function `is_trainer(uid)` that reads the role
with RLS bypassed, then replace all inline trainer-check subqueries across
all policies with `public.is_trainer(auth.uid())`.

## Tables affected
profiles, workout_completions, progress_entries, progress_photos,
personal_records, daily_checkins, nutrition_tips, hydration_logs,
messages, weekly_messages, upsell_requests.
*/

CREATE OR REPLACE FUNCTION public.is_trainer(uid uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = uid AND role = 'trainer');
$$;

-- profiles
DROP POLICY IF EXISTS "profiles_select_own_or_trainer" ON profiles;
CREATE POLICY "profiles_select_own_or_trainer" ON profiles FOR SELECT TO authenticated USING (auth.uid() = id OR public.is_trainer(auth.uid()));
DROP POLICY IF EXISTS "profiles_update_own_or_trainer" ON profiles;
CREATE POLICY "profiles_update_own_or_trainer" ON profiles FOR UPDATE TO authenticated USING (auth.uid() = id OR public.is_trainer(auth.uid())) WITH CHECK (auth.uid() = id OR public.is_trainer(auth.uid()));

-- workout_completions
DROP POLICY IF EXISTS "wc_select" ON workout_completions;
CREATE POLICY "wc_select" ON workout_completions FOR SELECT TO authenticated USING (auth.uid() = client_id OR public.is_trainer(auth.uid()));

-- progress_entries
DROP POLICY IF EXISTS "pe_select" ON progress_entries;
CREATE POLICY "pe_select" ON progress_entries FOR SELECT TO authenticated USING (auth.uid() = client_id OR public.is_trainer(auth.uid()));

-- progress_photos
DROP POLICY IF EXISTS "pp_select" ON progress_photos;
CREATE POLICY "pp_select" ON progress_photos FOR SELECT TO authenticated USING (auth.uid() = client_id OR public.is_trainer(auth.uid()));

-- personal_records
DROP POLICY IF EXISTS "pr_select" ON personal_records;
CREATE POLICY "pr_select" ON personal_records FOR SELECT TO authenticated USING (auth.uid() = client_id OR public.is_trainer(auth.uid()));

-- daily_checkins
DROP POLICY IF EXISTS "dc_select" ON daily_checkins;
CREATE POLICY "dc_select" ON daily_checkins FOR SELECT TO authenticated USING (auth.uid() = client_id OR public.is_trainer(auth.uid()));

-- nutrition_tips
DROP POLICY IF EXISTS "nt_select" ON nutrition_tips;
CREATE POLICY "nt_select" ON nutrition_tips FOR SELECT TO authenticated USING (auth.uid() = client_id OR public.is_trainer(auth.uid()));

-- hydration_logs
DROP POLICY IF EXISTS "hl_select" ON hydration_logs;
CREATE POLICY "hl_select" ON hydration_logs FOR SELECT TO authenticated USING (auth.uid() = client_id OR public.is_trainer(auth.uid()));

-- messages
DROP POLICY IF EXISTS "msg_select" ON messages;
CREATE POLICY "msg_select" ON messages FOR SELECT TO authenticated USING (auth.uid() = client_id OR public.is_trainer(auth.uid()));
DROP POLICY IF EXISTS "msg_insert" ON messages;
CREATE POLICY "msg_insert" ON messages FOR INSERT TO authenticated WITH CHECK (auth.uid() = client_id OR public.is_trainer(auth.uid()));

-- weekly_messages
DROP POLICY IF EXISTS "wm_select" ON weekly_messages;
CREATE POLICY "wm_select" ON weekly_messages FOR SELECT TO authenticated USING (auth.uid() = client_id OR public.is_trainer(auth.uid()));

-- upsell_requests
DROP POLICY IF EXISTS "ur_select" ON upsell_requests;
CREATE POLICY "ur_select" ON upsell_requests FOR SELECT TO authenticated USING (auth.uid() = client_id OR public.is_trainer(auth.uid()));
