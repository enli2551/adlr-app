-- Master trainer: hide sign-ups without a coach from the "Ohne Coach" list (test accounts,
-- people who never came back). Hidden, not deleted — they can be shown and assigned again.
-- Run in Supabase → SQL Editor (safe to run twice).

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS master_hidden boolean NOT NULL DEFAULT false;

-- The list now also says whether an entry is hidden (return type changes → drop first).
DROP FUNCTION IF EXISTS public.master_unassigned_clients();
CREATE FUNCTION public.master_unassigned_clients()
RETURNS TABLE (id uuid, first_name text, last_name text, email text, created_at timestamptz, intake_completed boolean, goal text, hidden boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_master() THEN RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
    SELECT p.id, p.first_name::text, p.last_name::text, p.email::text, p.created_at::timestamptz, coalesce(p.intake_completed, false),
           coalesce(p.intake -> 'goals' ->> 0, p.intake ->> 'goal')::text, p.master_hidden
      FROM public.profiles p
     WHERE p.role = 'client' AND p.trainer_id IS NULL
     ORDER BY p.created_at DESC;
END $$;

CREATE OR REPLACE FUNCTION public.master_set_hidden(p_client uuid, p_hidden boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_master() THEN RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501'; END IF;
  UPDATE public.profiles SET master_hidden = p_hidden WHERE id = p_client AND role = 'client' AND trainer_id IS NULL;
END $$;

REVOKE ALL ON FUNCTION public.master_unassigned_clients(), public.master_set_hidden(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.master_unassigned_clients(), public.master_set_hidden(uuid, boolean) TO authenticated;
