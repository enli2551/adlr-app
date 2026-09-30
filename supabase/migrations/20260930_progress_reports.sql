/*
# Personal progress report — coach summary with human approval

- profiles.lang: the client's app language (de/en/hu), synced by the app, so the
  AI draft is written in the language the client actually reads.
- progress_reports: one row per generated summary. The `coach-report` Edge Function
  (trainer-only) stores Claude's draft as status='draft'; Peter edits/approves it in
  the app (status='approved'); only APPROVED rows are visible to the client.

Run in the Supabase SQL Editor. Then deploy the `coach-report` Edge Function and set
its secret ANTHROPIC_API_KEY (Dashboard → Edge Functions → Secrets).
*/

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS lang text;

CREATE TABLE IF NOT EXISTS progress_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  trainer_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  lang text NOT NULL DEFAULT 'de',
  stats jsonb,
  draft text,
  body text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved')),
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz
);
CREATE INDEX IF NOT EXISTS progress_reports_client_idx ON progress_reports (client_id, created_at DESC);

ALTER TABLE progress_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "prr_select" ON progress_reports;
CREATE POLICY "prr_select" ON progress_reports FOR SELECT TO authenticated
  USING ((auth.uid() = client_id AND status = 'approved') OR public.is_trainer(auth.uid()));

DROP POLICY IF EXISTS "prr_insert_trainer" ON progress_reports;
CREATE POLICY "prr_insert_trainer" ON progress_reports FOR INSERT TO authenticated
  WITH CHECK (public.is_trainer(auth.uid()));

DROP POLICY IF EXISTS "prr_update_trainer" ON progress_reports;
CREATE POLICY "prr_update_trainer" ON progress_reports FOR UPDATE TO authenticated
  USING (public.is_trainer(auth.uid())) WITH CHECK (public.is_trainer(auth.uid()));

DROP POLICY IF EXISTS "prr_delete_trainer" ON progress_reports;
CREATE POLICY "prr_delete_trainer" ON progress_reports FOR DELETE TO authenticated
  USING (public.is_trainer(auth.uid()));
