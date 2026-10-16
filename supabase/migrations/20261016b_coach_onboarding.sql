/*
# Coach onboarding wizard + trainer sign-up hardening

1. `profiles.coach_onboarded_at`: set when a trainer finishes or skips the setup wizard.
   NULL = the wizard opens on the next trainer login.
   `profiles.coach_onboarding` (jsonb): wizard progress so it can be resumed
   ({ step, skipped, checklist_dismissed, done: {...} }).
   Trainers that already exist are marked as onboarded (they never see the wizard).

2. Hardening of the self-service trainer sign-up (/trainer-auth). A new account creates
   its own profile row with role = 'trainer' (allowed — the role is tenant-scoped: a coach
   only ever sees their own clients, plans, packages and questions). But the INSERT could
   also carry `trainer_id = <another coach>`, and `my_trainer()` would then give the new
   account read access to that coach's own exercises, videos and questions. The same was
   possible later by UPDATE-ing the own row (the protect trigger only locks trainer_id for
   clients). A trainer never has a coach: trainer_id is cleared on untrusted inserts and
   can't be changed by untrusted updates of a trainer row.

Run once in the Supabase SQL Editor (safe to run twice). Until then the app simply
never shows the wizard.
*/

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS coach_onboarded_at timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS coach_onboarding jsonb NOT NULL DEFAULT '{}'::jsonb;

-- existing coaches are set up already
UPDATE public.profiles
   SET coach_onboarded_at = now(),
       coach_onboarding = coach_onboarding || '{"checklist_dismissed": true}'::jsonb
 WHERE role = 'trainer' AND coach_onboarded_at IS NULL;

-- a self-created trainer profile can't attach itself to another coach
CREATE OR REPLACE FUNCTION public._adlr_protect_trainer_link()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND coalesce(current_setting('adlr.trusted', true), '') <> '1'
     AND NEW.role = 'trainer' THEN
    IF TG_OP = 'INSERT' THEN NEW.trainer_id := NULL;
    ELSE NEW.trainer_id := OLD.trainer_id; END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS adlr_protect_trainer_link ON public.profiles;
CREATE TRIGGER adlr_protect_trainer_link BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public._adlr_protect_trainer_link();
