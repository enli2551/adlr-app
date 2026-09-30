-- Daily health summary synced from Apple Health / Health Connect (read-only on the
-- phone side): steps, calories eaten (e.g. from YAZIO), sleep, weight, resting HR.
-- Pure ASCII, safe to copy/paste into the Supabase SQL Editor.
CREATE TABLE IF NOT EXISTS health_daily (
  client_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  day date NOT NULL,
  steps integer,
  kcal_in integer,
  sleep_min integer,
  weight_kg numeric,
  resting_hr integer,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (client_id, day)
);

ALTER TABLE health_daily ENABLE ROW LEVEL SECURITY;

-- Health data is sensitive: stricter than the other tables — a trainer only sees
-- the rows of HIS OWN clients (not every client of every trainer).
DROP POLICY IF EXISTS "hd_select" ON health_daily;
CREATE POLICY "hd_select" ON health_daily FOR SELECT TO authenticated
  USING (
    auth.uid() = client_id
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = health_daily.client_id AND p.trainer_id = auth.uid())
  );

DROP POLICY IF EXISTS "hd_insert" ON health_daily;
CREATE POLICY "hd_insert" ON health_daily FOR INSERT TO authenticated WITH CHECK (auth.uid() = client_id);

DROP POLICY IF EXISTS "hd_update" ON health_daily;
CREATE POLICY "hd_update" ON health_daily FOR UPDATE TO authenticated USING (auth.uid() = client_id) WITH CHECK (auth.uid() = client_id);

DROP POLICY IF EXISTS "hd_delete" ON health_daily;
CREATE POLICY "hd_delete" ON health_daily FOR DELETE TO authenticated USING (auth.uid() = client_id);
