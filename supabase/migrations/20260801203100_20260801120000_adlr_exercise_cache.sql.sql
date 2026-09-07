/*
# Exercise Demo Cache Table

## Purpose
Stores cached ExerciseDB API responses so we don't exhaust the monthly
RapidAPI quota. The edge function `exercisedb` checks this table before
calling the external API. Once an exercise is fetched, it's stored here
and subsequent lookups return instantly from the cache.

## New Tables
- `exercise_cache`
  - `id` (uuid, primary key)
  - `exercise_name` (text, unique) — the German display name from the app
  - `exercisedb_id` (text) — ExerciseDB's internal ID
  - `gif_url` (text) — direct URL to the exercise demo GIF
  - `body_part` (text) — e.g. "chest", "back", "legs"
  - `equipment` (text) — e.g. "barbell", "dumbbell", "body weight"
  - `target` (text) — target muscle, e.g. "pectorals"
  - `secondary_muscles` (text[]) — secondary muscles worked
  - `instructions` (text[]) — step-by-step instructions from ExerciseDB
  - `updated_at` (timestamptz) — when this cache entry was last refreshed

## Security
- RLS enabled on `exercise_cache`.
- No policies added — the table is locked for direct frontend access.
- The edge function uses the service role key which bypasses RLS,
  so only the server-side proxy can read/write the cache.
- The frontend never touches this table directly; it always goes
  through the edge function.
*/

CREATE TABLE IF NOT EXISTS exercise_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exercise_name text UNIQUE NOT NULL,
  exercisedb_id text,
  gif_url text,
  body_part text,
  equipment text,
  target text,
  secondary_muscles text[] DEFAULT '{}',
  instructions text[] DEFAULT '{}',
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE exercise_cache ENABLE ROW LEVEL SECURITY;