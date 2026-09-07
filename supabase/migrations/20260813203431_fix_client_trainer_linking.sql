/*
# Fix client-to-trainer linking

## Problem
When a client signs up or completes onboarding, the frontend tries to find the
trainer by querying `profiles` WHERE `role = 'trainer'`. But RLS on `profiles`
only lets a client see their own row — the trainer's row is invisible to them.
So the query returns null and `trainer_id` stays null, meaning the trainer
never sees the new client in their list.

## Fix
1. Create a SECURITY DEFINER function `get_trainer_id()` that returns the
   single trainer's profile id. SECURITY DEFINER bypasses RLS, so any
   authenticated client can call it via RPC without needing SELECT access
   on other users' profiles.
2. Grant EXECUTE to `authenticated` so logged-in clients can call it.
3. Repair existing clients with null `trainer_id` by linking them to the
   known trainer.

## Security
- The function only returns an id — no profile data is leaked.
- Only authenticated users can call it.
*/

CREATE OR REPLACE FUNCTION public.get_trainer_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.profiles WHERE role = 'trainer' ORDER BY created_at LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_trainer_id() TO authenticated;

-- Repair existing clients that have null trainer_id
UPDATE public.profiles
SET trainer_id = (SELECT id FROM public.profiles WHERE role = 'trainer' ORDER BY created_at LIMIT 1)
WHERE role = 'client' AND trainer_id IS NULL;
