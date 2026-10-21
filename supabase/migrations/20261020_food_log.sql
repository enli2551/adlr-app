-- Food log (calorie counter): what a client ate, from the built-in basic foods (USDA values),
-- Open Food Facts products (barcode / search) or their own foods. Totals are stored per entry,
-- per-100 g values too (so an entry can be re-weighed). The coach reads, the client writes.
-- Plus macro targets the coach sets (protein / carbs / fat in g; kcal_target already exists).
-- Run in Supabase → SQL Editor (safe to run twice).

CREATE TABLE IF NOT EXISTS food_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  log_date date NOT NULL,
  meal text NOT NULL CHECK (meal IN ('breakfast', 'lunch', 'dinner', 'snack')),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  brand text,
  source text NOT NULL DEFAULT 'custom' CHECK (source IN ('base', 'off', 'custom')),
  source_id text,                 -- base food id / barcode / custom_foods.id
  amount_g numeric NOT NULL CHECK (amount_g > 0 AND amount_g <= 5000),
  kcal numeric NOT NULL CHECK (kcal >= 0 AND kcal <= 20000),
  protein_g numeric NOT NULL DEFAULT 0 CHECK (protein_g >= 0),
  carbs_g numeric NOT NULL DEFAULT 0 CHECK (carbs_g >= 0),
  fat_g numeric NOT NULL DEFAULT 0 CHECK (fat_g >= 0),
  per100 jsonb,                   -- {kcal, protein, carbs, fat} per 100 g
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS food_logs_client_day_idx ON food_logs (client_id, log_date DESC);
ALTER TABLE food_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "fl_select" ON food_logs;
CREATE POLICY "fl_select" ON food_logs FOR SELECT TO authenticated
  USING (client_id = auth.uid() OR public.is_trainer_of(client_id));
DROP POLICY IF EXISTS "fl_write" ON food_logs;
CREATE POLICY "fl_write" ON food_logs FOR ALL TO authenticated
  USING (client_id = auth.uid()) WITH CHECK (client_id = auth.uid());

-- The client's own foods (e.g. "my porridge"), per 100 g + optional serving size.
CREATE TABLE IF NOT EXISTS custom_foods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  brand text,
  barcode text,
  kcal_100 numeric NOT NULL CHECK (kcal_100 >= 0 AND kcal_100 <= 1000),
  protein_100 numeric NOT NULL DEFAULT 0 CHECK (protein_100 >= 0 AND protein_100 <= 100),
  carbs_100 numeric NOT NULL DEFAULT 0 CHECK (carbs_100 >= 0 AND carbs_100 <= 100),
  fat_100 numeric NOT NULL DEFAULT 0 CHECK (fat_100 >= 0 AND fat_100 <= 100),
  serving_g numeric CHECK (serving_g IS NULL OR (serving_g > 0 AND serving_g <= 5000)),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS custom_foods_owner_idx ON custom_foods (owner_id, name);
ALTER TABLE custom_foods ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cf_own" ON custom_foods;
CREATE POLICY "cf_own" ON custom_foods FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- Macro targets set by the coach: {"protein_g": 160, "carbs_g": 250, "fat_g": 70}
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS macro_targets jsonb;

-- Same protect trigger as 20261019b_profile_privilege_fix.sql, plus: macro_targets are
-- coach-controlled like kcal_target — except for athletes without a coach (their own targets).
CREATE OR REPLACE FUNCTION public._adlr_protect_profile()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE trusted boolean := coalesce(current_setting('adlr.trusted', true), '') = '1';
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF auth.uid() IS NOT NULL AND NOT trusted THEN
      NEW.is_master := false;
      NEW.invite_code := NULL;
      IF NEW.role = 'client' THEN NEW.trainer_id := NULL; END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF auth.uid() IS NULL OR trusted THEN RETURN NEW; END IF;

  -- any logged-in, untrusted editor (the user themself or their coach)
  NEW.is_master := OLD.is_master;
  NEW.role := OLD.role;
  NEW.invite_code := OLD.invite_code;
  IF OLD.role = 'client' THEN
    IF NOT (NEW.trainer_id IS NULL AND OLD.trainer_id = auth.uid()) THEN
      NEW.trainer_id := OLD.trainer_id;
    END IF;
    IF auth.uid() = NEW.id THEN
      NEW.can_edit_plan := OLD.can_edit_plan;
      -- calorie / macro targets belong to the coach; athletes without a coach set their own
      IF OLD.trainer_id IS NOT NULL THEN
        NEW.kcal_target := OLD.kcal_target;
        NEW.macro_targets := OLD.macro_targets;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
