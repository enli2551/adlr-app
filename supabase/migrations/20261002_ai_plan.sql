-- AI plan builder: usage log (monthly quota per trainer) + plan provenance.
-- Pure ASCII, safe to copy/paste into the Supabase SQL Editor. Idempotent.

CREATE TABLE IF NOT EXISTS ai_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  client_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  kind text NOT NULL,                 -- 'plan' (later: 'nutrition', 'message', ...)
  model text,
  input_tokens integer,
  output_tokens integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_usage_trainer_idx ON ai_usage (trainer_id, created_at DESC);
ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;
-- Trainers read their own usage; rows are written only by Edge Functions (service role).
DROP POLICY IF EXISTS "ai_usage_read_own" ON ai_usage;
CREATE POLICY "ai_usage_read_own" ON ai_usage FOR SELECT TO authenticated
  USING (trainer_id = auth.uid());

-- Where a plan came from: shown as "KI-Entwurf" with the reasoning in the Plan Builder.
ALTER TABLE plans ADD COLUMN IF NOT EXISTS ai_generated boolean NOT NULL DEFAULT false;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS ai_rationale text;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS ai_client_id uuid REFERENCES profiles(id) ON DELETE SET NULL;
