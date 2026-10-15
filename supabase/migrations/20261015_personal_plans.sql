/*
# Personal plans for athletes without a coach (+ free limit, Pro groundwork)

- plans.is_personal: a plan a client built for themselves. The client owns it
  (plans.trainer_id = the client), so the existing policies already let them read and
  write the plan and its days (plans_write / plan_days_write check trainer_id = auth.uid()).
- profiles.pro_until: ADLR Pro entitlement (set by the in-app purchase backend later).
  public.is_pro(uid) = pro_until in the future.
- Free limit: a client WITHOUT a coach and without Pro can own at most 3 personal plans.
  Clients with a coach have no limit ("mit Coach alles inklusive"). Enforced server-side.
- Hardening: a client-owned plan can never be a template or the global starter plan
  (previously any user could create a plan flagged is_starter, readable by everybody).
  Plans a coach owns are untouched (e.g. the personal copy client_update_plan_day forks
  keeps trainer_id = coach, so this trigger does not touch it).

Run once in the Supabase SQL Editor.
*/

ALTER TABLE public.plans    ADD COLUMN IF NOT EXISTS is_personal boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS pro_until  timestamptz;

CREATE OR REPLACE FUNCTION public.is_pro(p_uid uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((SELECT pro_until > now() FROM public.profiles WHERE id = p_uid), false);
$$;
GRANT EXECUTE ON FUNCTION public.is_pro(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public._adlr_personal_plan_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_coach uuid;
  v_count int;
BEGIN
  IF v_uid IS NULL OR NEW.trainer_id IS DISTINCT FROM v_uid THEN RETURN NEW; END IF;
  SELECT role, trainer_id INTO v_role, v_coach FROM public.profiles WHERE id = v_uid;
  IF v_role IS DISTINCT FROM 'client' THEN RETURN NEW; END IF;

  -- a client's own plan is always personal, never a template or starter plan
  NEW.is_personal := true;
  NEW.is_template := false;
  IF to_jsonb(NEW) ? 'is_starter' THEN NEW.is_starter := false; END IF;

  IF TG_OP = 'INSERT' AND v_coach IS NULL AND NOT public.is_pro(v_uid) THEN
    SELECT count(*) INTO v_count FROM public.plans WHERE trainer_id = v_uid AND is_personal;
    IF v_count >= 3 THEN
      RAISE EXCEPTION 'plan_limit' USING ERRCODE = 'P0001', HINT = 'Free plan: max. 3 personal plans. ADLR Pro: unlimited.';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS adlr_personal_plan_guard ON public.plans;
CREATE TRIGGER adlr_personal_plan_guard BEFORE INSERT OR UPDATE ON public.plans
  FOR EACH ROW EXECUTE FUNCTION public._adlr_personal_plan_guard();

-- clients must not grant themselves Pro by editing their profile row
CREATE OR REPLACE FUNCTION public._adlr_protect_pro()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND coalesce(current_setting('adlr.trusted', true), '') <> '1' THEN
    IF TG_OP = 'INSERT' THEN NEW.pro_until := NULL;
    ELSE NEW.pro_until := OLD.pro_until; END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS adlr_protect_pro ON public.profiles;
CREATE TRIGGER adlr_protect_pro BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public._adlr_protect_pro();
