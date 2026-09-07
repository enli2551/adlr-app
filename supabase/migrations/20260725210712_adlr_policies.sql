/*
# ADLR RLS policies

Enables RLS on all ADLR tables and adds ownership/role-scoped policies.
Clients access only their own rows; the trainer (role='trainer') accesses all client rows.
*/

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE progress_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE progress_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE personal_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE nutrition_tips ENABLE ROW LEVEL SECURITY;
ALTER TABLE hydration_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE upsell_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE exercise_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_revenue ENABLE ROW LEVEL SECURITY;

-- Helper: trainer check inline via EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'trainer')

-- profiles
DROP POLICY IF EXISTS "profiles_select_own_or_trainer" ON profiles;
CREATE POLICY "profiles_select_own_or_trainer" ON profiles FOR SELECT TO authenticated USING (auth.uid() = id OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'trainer'));
DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;
CREATE POLICY "profiles_insert_own" ON profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
DROP POLICY IF EXISTS "profiles_update_own_or_trainer" ON profiles;
CREATE POLICY "profiles_update_own_or_trainer" ON profiles FOR UPDATE TO authenticated USING (auth.uid() = id OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'trainer')) WITH CHECK (auth.uid() = id OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'trainer'));

-- plans
DROP POLICY IF EXISTS "plans_select" ON plans;
CREATE POLICY "plans_select" ON plans FOR SELECT TO authenticated USING (auth.uid() = trainer_id OR EXISTS (SELECT 1 FROM client_plans cp WHERE cp.plan_id = plans.id AND cp.client_id = auth.uid()));
DROP POLICY IF EXISTS "plans_insert_trainer" ON plans;
CREATE POLICY "plans_insert_trainer" ON plans FOR INSERT TO authenticated WITH CHECK (auth.uid() = trainer_id);
DROP POLICY IF EXISTS "plans_update_trainer" ON plans;
CREATE POLICY "plans_update_trainer" ON plans FOR UPDATE TO authenticated USING (auth.uid() = trainer_id) WITH CHECK (auth.uid() = trainer_id);
DROP POLICY IF EXISTS "plans_delete_trainer" ON plans;
CREATE POLICY "plans_delete_trainer" ON plans FOR DELETE TO authenticated USING (auth.uid() = trainer_id);

-- plan_days
DROP POLICY IF EXISTS "plan_days_select" ON plan_days;
CREATE POLICY "plan_days_select" ON plan_days FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM plans WHERE plans.id = plan_days.plan_id AND (plans.trainer_id = auth.uid() OR EXISTS (SELECT 1 FROM client_plans cp WHERE cp.plan_id = plans.id AND cp.client_id = auth.uid()))));
DROP POLICY IF EXISTS "plan_days_modify" ON plan_days;
CREATE POLICY "plan_days_modify" ON plan_days FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM plans WHERE plans.id = plan_days.plan_id AND plans.trainer_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM plans WHERE plans.id = plan_days.plan_id AND plans.trainer_id = auth.uid()));

-- client_plans
DROP POLICY IF EXISTS "client_plans_select" ON client_plans;
CREATE POLICY "client_plans_select" ON client_plans FOR SELECT TO authenticated USING (auth.uid() = client_id OR EXISTS (SELECT 1 FROM plans WHERE plans.id = client_plans.plan_id AND plans.trainer_id = auth.uid()));
DROP POLICY IF EXISTS "client_plans_insert" ON client_plans;
CREATE POLICY "client_plans_insert" ON client_plans FOR INSERT TO authenticated WITH CHECK (auth.uid() = client_id OR EXISTS (SELECT 1 FROM plans WHERE plans.id = client_plans.plan_id AND plans.trainer_id = auth.uid()));
DROP POLICY IF EXISTS "client_plans_update" ON client_plans;
CREATE POLICY "client_plans_update" ON client_plans FOR UPDATE TO authenticated USING (auth.uid() = client_id OR EXISTS (SELECT 1 FROM plans WHERE plans.id = client_plans.plan_id AND plans.trainer_id = auth.uid())) WITH CHECK (auth.uid() = client_id OR EXISTS (SELECT 1 FROM plans WHERE plans.id = client_plans.plan_id AND plans.trainer_id = auth.uid()));
DROP POLICY IF EXISTS "client_plans_delete" ON client_plans;
CREATE POLICY "client_plans_delete" ON client_plans FOR DELETE TO authenticated USING (auth.uid() = client_id OR EXISTS (SELECT 1 FROM plans WHERE plans.id = client_plans.plan_id AND plans.trainer_id = auth.uid()));

-- workout_completions
DROP POLICY IF EXISTS "wc_select" ON workout_completions;
CREATE POLICY "wc_select" ON workout_completions FOR SELECT TO authenticated USING (auth.uid() = client_id OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'trainer'));
DROP POLICY IF EXISTS "wc_insert" ON workout_completions;
CREATE POLICY "wc_insert" ON workout_completions FOR INSERT TO authenticated WITH CHECK (auth.uid() = client_id);
DROP POLICY IF EXISTS "wc_delete" ON workout_completions;
CREATE POLICY "wc_delete" ON workout_completions FOR DELETE TO authenticated USING (auth.uid() = client_id);

-- progress_entries
DROP POLICY IF EXISTS "pe_select" ON progress_entries;
CREATE POLICY "pe_select" ON progress_entries FOR SELECT TO authenticated USING (auth.uid() = client_id OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'trainer'));
DROP POLICY IF EXISTS "pe_insert" ON progress_entries;
CREATE POLICY "pe_insert" ON progress_entries FOR INSERT TO authenticated WITH CHECK (auth.uid() = client_id);
DROP POLICY IF EXISTS "pe_update" ON progress_entries;
CREATE POLICY "pe_update" ON progress_entries FOR UPDATE TO authenticated USING (auth.uid() = client_id) WITH CHECK (auth.uid() = client_id);
DROP POLICY IF EXISTS "pe_delete" ON progress_entries;
CREATE POLICY "pe_delete" ON progress_entries FOR DELETE TO authenticated USING (auth.uid() = client_id);

-- progress_photos
DROP POLICY IF EXISTS "pp_select" ON progress_photos;
CREATE POLICY "pp_select" ON progress_photos FOR SELECT TO authenticated USING (auth.uid() = client_id OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'trainer'));
DROP POLICY IF EXISTS "pp_insert" ON progress_photos;
CREATE POLICY "pp_insert" ON progress_photos FOR INSERT TO authenticated WITH CHECK (auth.uid() = client_id);
DROP POLICY IF EXISTS "pp_delete" ON progress_photos;
CREATE POLICY "pp_delete" ON progress_photos FOR DELETE TO authenticated USING (auth.uid() = client_id);

-- personal_records
DROP POLICY IF EXISTS "pr_select" ON personal_records;
CREATE POLICY "pr_select" ON personal_records FOR SELECT TO authenticated USING (auth.uid() = client_id OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'trainer'));
DROP POLICY IF EXISTS "pr_insert" ON personal_records;
CREATE POLICY "pr_insert" ON personal_records FOR INSERT TO authenticated WITH CHECK (auth.uid() = client_id);
DROP POLICY IF EXISTS "pr_update" ON personal_records;
CREATE POLICY "pr_update" ON personal_records FOR UPDATE TO authenticated USING (auth.uid() = client_id) WITH CHECK (auth.uid() = client_id);
DROP POLICY IF EXISTS "pr_delete" ON personal_records;
CREATE POLICY "pr_delete" ON personal_records FOR DELETE TO authenticated USING (auth.uid() = client_id);

-- daily_checkins
DROP POLICY IF EXISTS "dc_select" ON daily_checkins;
CREATE POLICY "dc_select" ON daily_checkins FOR SELECT TO authenticated USING (auth.uid() = client_id OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'trainer'));
DROP POLICY IF EXISTS "dc_insert" ON daily_checkins;
CREATE POLICY "dc_insert" ON daily_checkins FOR INSERT TO authenticated WITH CHECK (auth.uid() = client_id);
DROP POLICY IF EXISTS "dc_update" ON daily_checkins;
CREATE POLICY "dc_update" ON daily_checkins FOR UPDATE TO authenticated USING (auth.uid() = client_id) WITH CHECK (auth.uid() = client_id);
DROP POLICY IF EXISTS "dc_delete" ON daily_checkins;
CREATE POLICY "dc_delete" ON daily_checkins FOR DELETE TO authenticated USING (auth.uid() = client_id);

-- nutrition_tips
DROP POLICY IF EXISTS "nt_select" ON nutrition_tips;
CREATE POLICY "nt_select" ON nutrition_tips FOR SELECT TO authenticated USING (auth.uid() = client_id OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'trainer'));
DROP POLICY IF EXISTS "nt_insert_trainer" ON nutrition_tips;
CREATE POLICY "nt_insert_trainer" ON nutrition_tips FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'trainer'));
DROP POLICY IF EXISTS "nt_update_trainer" ON nutrition_tips;
CREATE POLICY "nt_update_trainer" ON nutrition_tips FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'trainer')) WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'trainer'));
DROP POLICY IF EXISTS "nt_delete_trainer" ON nutrition_tips;
CREATE POLICY "nt_delete_trainer" ON nutrition_tips FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'trainer'));

-- hydration_logs
DROP POLICY IF EXISTS "hl_select" ON hydration_logs;
CREATE POLICY "hl_select" ON hydration_logs FOR SELECT TO authenticated USING (auth.uid() = client_id OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'trainer'));
DROP POLICY IF EXISTS "hl_insert" ON hydration_logs;
CREATE POLICY "hl_insert" ON hydration_logs FOR INSERT TO authenticated WITH CHECK (auth.uid() = client_id);
DROP POLICY IF EXISTS "hl_update" ON hydration_logs;
CREATE POLICY "hl_update" ON hydration_logs FOR UPDATE TO authenticated USING (auth.uid() = client_id) WITH CHECK (auth.uid() = client_id);
DROP POLICY IF EXISTS "hl_delete" ON hydration_logs;
CREATE POLICY "hl_delete" ON hydration_logs FOR DELETE TO authenticated USING (auth.uid() = client_id);

-- messages
DROP POLICY IF EXISTS "msg_select" ON messages;
CREATE POLICY "msg_select" ON messages FOR SELECT TO authenticated USING (auth.uid() = client_id OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'trainer'));
DROP POLICY IF EXISTS "msg_insert" ON messages;
CREATE POLICY "msg_insert" ON messages FOR INSERT TO authenticated WITH CHECK (auth.uid() = client_id OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'trainer'));

-- weekly_messages
DROP POLICY IF EXISTS "wm_select" ON weekly_messages;
CREATE POLICY "wm_select" ON weekly_messages FOR SELECT TO authenticated USING (auth.uid() = client_id OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'trainer'));
DROP POLICY IF EXISTS "wm_insert_trainer" ON weekly_messages;
CREATE POLICY "wm_insert_trainer" ON weekly_messages FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'trainer'));
DROP POLICY IF EXISTS "wm_update_trainer" ON weekly_messages;
CREATE POLICY "wm_update_trainer" ON weekly_messages FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'trainer')) WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'trainer'));
DROP POLICY IF EXISTS "wm_delete_trainer" ON weekly_messages;
CREATE POLICY "wm_delete_trainer" ON weekly_messages FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'trainer'));

-- sessions
DROP POLICY IF EXISTS "sess_select" ON sessions;
CREATE POLICY "sess_select" ON sessions FOR SELECT TO authenticated USING (auth.uid() = client_id OR auth.uid() = trainer_id);
DROP POLICY IF EXISTS "sess_insert_trainer" ON sessions;
CREATE POLICY "sess_insert_trainer" ON sessions FOR INSERT TO authenticated WITH CHECK (auth.uid() = trainer_id);
DROP POLICY IF EXISTS "sess_update_trainer" ON sessions;
CREATE POLICY "sess_update_trainer" ON sessions FOR UPDATE TO authenticated USING (auth.uid() = trainer_id) WITH CHECK (auth.uid() = trainer_id);
DROP POLICY IF EXISTS "sess_delete_trainer" ON sessions;
CREATE POLICY "sess_delete_trainer" ON sessions FOR DELETE TO authenticated USING (auth.uid() = trainer_id);

-- session_notes
DROP POLICY IF EXISTS "sn_select" ON session_notes;
CREATE POLICY "sn_select" ON session_notes FOR SELECT TO authenticated USING (auth.uid() = client_id OR auth.uid() = trainer_id);
DROP POLICY IF EXISTS "sn_insert_trainer" ON session_notes;
CREATE POLICY "sn_insert_trainer" ON session_notes FOR INSERT TO authenticated WITH CHECK (auth.uid() = trainer_id);
DROP POLICY IF EXISTS "sn_delete_trainer" ON session_notes;
CREATE POLICY "sn_delete_trainer" ON session_notes FOR DELETE TO authenticated USING (auth.uid() = trainer_id);

-- upsell_requests
DROP POLICY IF EXISTS "ur_select" ON upsell_requests;
CREATE POLICY "ur_select" ON upsell_requests FOR SELECT TO authenticated USING (auth.uid() = client_id OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'trainer'));
DROP POLICY IF EXISTS "ur_insert" ON upsell_requests;
CREATE POLICY "ur_insert" ON upsell_requests FOR INSERT TO authenticated WITH CHECK (auth.uid() = client_id);
DROP POLICY IF EXISTS "ur_update_trainer" ON upsell_requests;
CREATE POLICY "ur_update_trainer" ON upsell_requests FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'trainer')) WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'trainer'));

-- exercise_library
DROP POLICY IF EXISTS "el_select" ON exercise_library;
CREATE POLICY "el_select" ON exercise_library FOR SELECT TO authenticated USING (auth.uid() = trainer_id);
DROP POLICY IF EXISTS "el_insert" ON exercise_library;
CREATE POLICY "el_insert" ON exercise_library FOR INSERT TO authenticated WITH CHECK (auth.uid() = trainer_id);
DROP POLICY IF EXISTS "el_update" ON exercise_library;
CREATE POLICY "el_update" ON exercise_library FOR UPDATE TO authenticated USING (auth.uid() = trainer_id) WITH CHECK (auth.uid() = trainer_id);
DROP POLICY IF EXISTS "el_delete" ON exercise_library;
CREATE POLICY "el_delete" ON exercise_library FOR DELETE TO authenticated USING (auth.uid() = trainer_id);

-- business_revenue
DROP POLICY IF EXISTS "br_select" ON business_revenue;
CREATE POLICY "br_select" ON business_revenue FOR SELECT TO authenticated USING (auth.uid() = trainer_id);
DROP POLICY IF EXISTS "br_insert" ON business_revenue;
CREATE POLICY "br_insert" ON business_revenue FOR INSERT TO authenticated WITH CHECK (auth.uid() = trainer_id);
DROP POLICY IF EXISTS "br_update" ON business_revenue;
CREATE POLICY "br_update" ON business_revenue FOR UPDATE TO authenticated USING (auth.uid() = trainer_id) WITH CHECK (auth.uid() = trainer_id);
DROP POLICY IF EXISTS "br_delete" ON business_revenue;
CREATE POLICY "br_delete" ON business_revenue FOR DELETE TO authenticated USING (auth.uid() = trainer_id);

-- Storage policies
DROP POLICY IF EXISTS "photos_access" ON storage.objects;
CREATE POLICY "photos_access" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'avatars' OR bucket_id = 'photos');
DROP POLICY IF EXISTS "photos_insert" ON storage.objects;
CREATE POLICY "photos_insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id IN ('photos','avatars'));
DROP POLICY IF EXISTS "photos_update" ON storage.objects;
CREATE POLICY "photos_update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id IN ('photos','avatars')) WITH CHECK (bucket_id IN ('photos','avatars'));
DROP POLICY IF EXISTS "photos_delete" ON storage.objects;
CREATE POLICY "photos_delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id IN ('photos','avatars'));
