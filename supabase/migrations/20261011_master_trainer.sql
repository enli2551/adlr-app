/*
# Sign-ups without an invite code stay unassigned; a master trainer allocates them

1. `get_trainer_id()` no longer falls back to the first trainer. It only returns an
   existing link, so a client who registers without a code has `trainer_id = NULL`.
   (Older app builds call it at sign-up too, so they get the new behaviour without an update.)
2. `profiles.is_master`: trainers with this flag see clients without a coach and can
   assign them to any trainer (`master_unassigned_clients`, `master_trainers`,
   `master_assign_client`).
3. Hardening: users can no longer change their own `trainer_id`, `role` or `is_master`
   by updating their profile row directly. A coach link is only set through
   `join_trainer(code)` or by a master trainer (both mark the change as trusted).

Run once in the Supabase SQL Editor, then the last statement makes Peter master.
*/

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_master boolean NOT NULL DEFAULT false;

-- 1) no implicit fallback trainer any more
CREATE OR REPLACE FUNCTION public.get_trainer_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT trainer_id FROM public.profiles WHERE id = auth.uid();
$$;

-- 3) protect coach link, role and master flag against self-edits
CREATE OR REPLACE FUNCTION public._adlr_protect_profile()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE trusted boolean := coalesce(current_setting('adlr.trusted', true), '') = '1';
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF auth.uid() IS NOT NULL AND NOT trusted THEN
      NEW.is_master := false;
      IF NEW.role = 'client' THEN NEW.trainer_id := NULL; END IF;
    END IF;
    RETURN NEW;
  END IF;
  IF auth.uid() = NEW.id AND NOT trusted THEN
    NEW.is_master := OLD.is_master;
    NEW.role := OLD.role;
    IF OLD.role = 'client' THEN
      NEW.trainer_id := OLD.trainer_id;
      NEW.can_edit_plan := OLD.can_edit_plan;
      NEW.kcal_target := OLD.kcal_target;
      NEW.invite_code := OLD.invite_code;
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS adlr_protect_profile ON profiles;
CREATE TRIGGER adlr_protect_profile BEFORE INSERT OR UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION public._adlr_protect_profile();

-- join by code: the one client-side way to set a coach link
CREATE OR REPLACE FUNCTION public.join_trainer(p_code text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_trainer uuid; v_name text; v_old uuid;
BEGIN
  SELECT id, first_name INTO v_trainer, v_name FROM profiles
   WHERE role = 'trainer' AND invite_code = upper(trim(p_code));
  IF v_trainer IS NULL THEN RETURN NULL; END IF;
  SELECT trainer_id INTO v_old FROM profiles WHERE id = auth.uid();
  PERFORM set_config('adlr.trusted', '1', true);
  UPDATE profiles SET trainer_id = v_trainer WHERE id = auth.uid() AND role = 'client';
  PERFORM set_config('adlr.trusted', '', true);
  IF v_old IS DISTINCT FROM v_trainer AND v_old IS NOT NULL THEN
    UPDATE client_plans SET is_active = false WHERE client_id = auth.uid();
  END IF;
  RETURN COALESCE(v_name, '');
END $$;

-- 2) master trainer
CREATE OR REPLACE FUNCTION public.is_master()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((SELECT is_master FROM public.profiles WHERE id = auth.uid() AND role = 'trainer'), false);
$$;

CREATE OR REPLACE FUNCTION public.master_unassigned_clients()
RETURNS TABLE (id uuid, first_name text, last_name text, email text, created_at timestamptz, intake_completed boolean, goal text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_master() THEN RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
    SELECT p.id, p.first_name::text, p.last_name::text, p.email::text, p.created_at::timestamptz, coalesce(p.intake_completed, false),
           coalesce(p.intake -> 'goals' ->> 0, p.intake ->> 'goal')::text
      FROM public.profiles p
     WHERE p.role = 'client' AND p.trainer_id IS NULL
     ORDER BY p.created_at DESC;
END $$;

CREATE OR REPLACE FUNCTION public.master_trainers()
RETURNS TABLE (id uuid, first_name text, last_name text, email text, clients bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_master() THEN RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
    SELECT t.id, t.first_name::text, t.last_name::text, t.email::text,
           (SELECT count(*) FROM public.profiles c WHERE c.trainer_id = t.id AND c.role = 'client')
      FROM public.profiles t
     WHERE t.role = 'trainer'
     ORDER BY t.created_at;
END $$;

CREATE OR REPLACE FUNCTION public.master_assign_client(p_client uuid, p_trainer uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_old uuid;
BEGIN
  IF NOT public.is_master() THEN RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_trainer AND role = 'trainer') THEN RETURN false; END IF;
  SELECT trainer_id INTO v_old FROM public.profiles WHERE id = p_client AND role = 'client';
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM set_config('adlr.trusted', '1', true);
  UPDATE public.profiles SET trainer_id = p_trainer WHERE id = p_client;
  PERFORM set_config('adlr.trusted', '', true);
  IF v_old IS DISTINCT FROM p_trainer AND v_old IS NOT NULL THEN
    UPDATE public.client_plans SET is_active = false WHERE client_id = p_client;
  END IF;
  RETURN true;
END $$;

GRANT EXECUTE ON FUNCTION public.get_trainer_id(), public.join_trainer(text), public.is_master(),
  public.master_unassigned_clients(), public.master_trainers(), public.master_assign_client(uuid, uuid) TO authenticated;

-- Peter is the master trainer
UPDATE public.profiles SET is_master = true
 WHERE role = 'trainer' AND id = (SELECT id FROM auth.users WHERE lower(email) = 'peter@adlr.at');
