/*
# ADLR Schema — tables only (no policies yet)

Creates all tables and storage buckets. Policies applied in a follow-up migration
to avoid forward-reference errors (e.g. plans policy referencing client_plans).
*/

-- Profiles
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'client' CHECK (role IN ('trainer','client')),
  trainer_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  intake_completed boolean NOT NULL DEFAULT false,
  first_name text, last_name text, age int, height_cm numeric, weight_kg numeric,
  gender text, email text, phone text, avatar_url text,
  intake jsonb NOT NULL DEFAULT '{}'::jsonb,
  streak int NOT NULL DEFAULT 0,
  last_active timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Plans
CREATE TABLE IF NOT EXISTS plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_template boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Plan days
CREATE TABLE IF NOT EXISTS plan_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  day_of_week int NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  workout_name text, focus text,
  difficulty int NOT NULL DEFAULT 1 CHECK (difficulty >= 1 AND difficulty <= 3),
  duration_min int, notes text,
  exercises jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_rest_day boolean NOT NULL DEFAULT false
);

-- Client plan assignment
CREATE TABLE IF NOT EXISTS client_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  is_active boolean NOT NULL DEFAULT true
);

-- Workout completions
CREATE TABLE IF NOT EXISTS workout_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  plan_day_id uuid REFERENCES plan_days(id) ON DELETE SET NULL,
  completed_at timestamptz NOT NULL DEFAULT now()
);

-- Progress entries
CREATE TABLE IF NOT EXISTS progress_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  weight_kg numeric, waist_cm numeric, chest_cm numeric, hips_cm numeric, arm_cm numeric, thigh_cm numeric,
  logged_at date NOT NULL DEFAULT CURRENT_DATE
);

-- Progress photos
CREATE TABLE IF NOT EXISTS progress_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  photo_date date NOT NULL DEFAULT CURRENT_DATE,
  label text
);

-- Personal records
CREATE TABLE IF NOT EXISTS personal_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  exercise_name text NOT NULL,
  weight_kg numeric NOT NULL,
  reps int NOT NULL DEFAULT 1,
  achieved_at date NOT NULL DEFAULT CURRENT_DATE
);

-- Daily check-ins
CREATE TABLE IF NOT EXISTS daily_checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  energy int NOT NULL CHECK (energy >= 1 AND energy <= 5),
  mood int NOT NULL CHECK (mood >= 1 AND mood <= 5),
  note text,
  logged_at date NOT NULL DEFAULT CURRENT_DATE
);

-- Nutrition tips
CREATE TABLE IF NOT EXISTS nutrition_tips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  tip text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id)
);

-- Hydration logs
CREATE TABLE IF NOT EXISTS hydration_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  glasses int NOT NULL DEFAULT 0,
  log_date date NOT NULL DEFAULT CURRENT_DATE,
  UNIQUE (client_id, log_date)
);

-- Messages
CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  sender text NOT NULL CHECK (sender IN ('client','trainer')),
  body text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now()
);

-- Weekly messages
CREATE TABLE IF NOT EXISTS weekly_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id)
);

-- Sessions
CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  trainer_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  scheduled_at timestamptz NOT NULL,
  duration_min int NOT NULL DEFAULT 60,
  location text NOT NULL DEFAULT 'Powergym Kottingbrunn',
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','completed','cancelled'))
);

-- Session notes
CREATE TABLE IF NOT EXISTS session_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  trainer_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Upsell requests
CREATE TABLE IF NOT EXISTS upsell_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  upgrade_key text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','declined')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Exercise library
CREATE TABLE IF NOT EXISTS exercise_library (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  muscle_group text,
  sets int, reps int, rest_sec int, tempo text, description text
);

-- Business revenue
CREATE TABLE IF NOT EXISTS business_revenue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  source text,
  month_date date NOT NULL DEFAULT CURRENT_DATE,
  note text
);

-- Storage buckets
INSERT INTO storage.buckets (id, name, public) VALUES ('photos','photos', false) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars','avatars', true) ON CONFLICT DO NOTHING;
