/*
# Security fix: no privilege escalation through a coach editing a client's profile

The protect trigger only locked role / is_master / trainer_id when a user edited their OWN
row. But `prof_update` lets a coach update their clients' rows, so a coach could:
  1. create a client account with their own invite code,
  2. set that client's row to role = 'trainer', is_master = true,
  3. as "master": list every sign-up without a coach (name, e-mail, goal) and, because
     master_assign_client did not check trainer_id IS NULL, move ANY client of ANY coach
     (with all their data and photos) to themselves.

Now, for every untrusted update by a logged-in user (own row OR a coach on a client row):
  * role, is_master and invite_code can't change (pro_until has its own trigger);
  * a client's trainer_id can't change, except that the CURRENT coach may release the
    client (trainer_id -> NULL, used by "Klient entfernen" in older builds too).
Trusted paths stay as they are: join_trainer(code), master_assign_client, service role
(edge functions, SQL editor: auth.uid() IS NULL).

master_assign_client only assigns clients that have no coach.

Coach-controlled settings (can_edit_plan, kcal_target) can still be set by the coach,
and clients still can't set them on their own row.

Run once in the Supabase SQL Editor (safe to run twice). Then run the check at the end.
*/

BEGIN;

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
      NEW.kcal_target := OLD.kcal_target;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS adlr_protect_profile ON public.profiles;
CREATE TRIGGER adlr_protect_profile BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public._adlr_protect_profile();

-- my_invite_code() writes invite_code for the caller: mark it as trusted.
CREATE OR REPLACE FUNCTION public.my_invite_code()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v text; alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'trainer') THEN
    RAISE EXCEPTION 'trainer_only';
  END IF;
  SELECT invite_code INTO v FROM profiles WHERE id = auth.uid();
  IF v IS NOT NULL THEN RETURN v; END IF;
  LOOP
    v := '';
    FOR i IN 1..6 LOOP
      v := v || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM profiles WHERE invite_code = v);
  END LOOP;
  PERFORM set_config('adlr.trusted', '1', true);
  UPDATE profiles SET invite_code = v WHERE id = auth.uid();
  PERFORM set_config('adlr.trusted', '', true);
  RETURN v;
END $$;

-- Master assigns only sign-ups WITHOUT a coach (never another coach's client).
CREATE OR REPLACE FUNCTION public.master_assign_client(p_client uuid, p_trainer uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_master() THEN RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_trainer AND role = 'trainer') THEN RETURN false; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_client AND role = 'client' AND trainer_id IS NULL) THEN
    RETURN false;
  END IF;
  PERFORM set_config('adlr.trusted', '1', true);
  UPDATE public.profiles SET trainer_id = p_trainer WHERE id = p_client AND trainer_id IS NULL;
  PERFORM set_config('adlr.trusted', '', true);
  RETURN true;
END $$;

REVOKE ALL ON FUNCTION public.master_assign_client(uuid, uuid), public.my_invite_code() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.master_assign_client(uuid, uuid), public.my_invite_code() TO authenticated;

COMMIT;

-- ── Check (read-only): who is master, and were any clients turned into trainers? ──
-- Expected: exactly one master (peter@adlr.at). Any other row → tell Claude/review it.
SELECT p.id, u.email, p.role, p.is_master, p.created_at
  FROM public.profiles p JOIN auth.users u ON u.id = p.id
 WHERE p.is_master OR (p.role = 'trainer' AND p.trainer_id IS NOT NULL)
 ORDER BY p.created_at;
