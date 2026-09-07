/*
# Fix get_trainer_id to always return Peter (peter@adlr.at)

## Problem
There are two trainer accounts in the database. The previous version of
get_trainer_id returned the oldest trainer (ORDER BY created_at LIMIT 1),
which picked the wrong trainer (autotdeizibe@gmail.com instead of
peter@adlr.at). New clients were linked to the wrong trainer and were
invisible to Peter.

## Fix
1. Update get_trainer_id to specifically return the trainer with email
   'peter@adlr.at'. This is the single trainer all clients should be
   linked to.
2. Re-link all existing clients to Peter's account.
*/

CREATE OR REPLACE FUNCTION public.get_trainer_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.profiles WHERE role = 'trainer' AND email = 'peter@adlr.at' LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_trainer_id() TO authenticated;

-- Re-link all clients to Peter (peter@adlr.at)
UPDATE public.profiles
SET trainer_id = (SELECT id FROM public.profiles WHERE email = 'peter@adlr.at' AND role = 'trainer' LIMIT 1)
WHERE role = 'client';
