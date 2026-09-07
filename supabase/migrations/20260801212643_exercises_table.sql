/*
# Exercise Library Table

1. New Tables
- `exercises` — stores the full exercise catalog (430 exercises)
  - `id` (serial, primary key)
  - `name` (text, not null) — German exercise name
  - `muscle_group` (text, not null) — e.g. 'Brust', 'Rücken', 'Beine', etc.
  - `equipment` (text, not null) — e.g. 'Langhantel', 'Kurzhantel', 'Körpergewicht'
  - `tempo` (text, not null) — e.g. '2-1-2-0', 'Explosiv', 'Halten'
  - `default_sets` (int, not null, default 3)
  - `default_reps` (int, not null, default 10)
  - `default_rest_sec` (int, not null, default 90)
  - `exercise_id` (text, not null) — ExerciseDB GIF ID (e.g. '0025')
  - `cues` (text[], not null, default '{}') — German coaching cues array
  - `created_at` (timestamptz, default now())

2. Indexes
- Index on `muscle_group` for fast filtering
- Index on `name` for fast searching
- Index on `equipment` for filtering

3. Security
- Enable RLS on `exercises`.
- This is a shared reference catalog (read-only for all app users, writable by no one via the API).
- SELECT only, TO anon, authenticated — the data is intentionally public.
- No INSERT/UPDATE/DELETE policies — data is managed via migrations only.
*/

CREATE TABLE IF NOT EXISTS exercises (
  id serial PRIMARY KEY,
  name text NOT NULL,
  muscle_group text NOT NULL,
  equipment text NOT NULL,
  tempo text NOT NULL DEFAULT '2-1-2-0',
  default_sets int NOT NULL DEFAULT 3,
  default_reps int NOT NULL DEFAULT 10,
  default_rest_sec int NOT NULL DEFAULT 90,
  exercise_id text NOT NULL,
  cues text[] NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_exercises_muscle_group ON exercises(muscle_group);
CREATE INDEX IF NOT EXISTS idx_exercises_name ON exercises(name);
CREATE INDEX IF NOT EXISTS idx_exercises_equipment ON exercises(equipment);

ALTER TABLE exercises ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_exercises" ON exercises;
CREATE POLICY "read_exercises" ON exercises FOR SELECT
  TO anon, authenticated USING (true);