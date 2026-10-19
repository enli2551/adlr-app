-- Remote push notifications (Android FCM + iOS APNs).
-- Pure ASCII, safe to copy/paste into the Supabase SQL Editor. Idempotent.
--
-- Design: AFTER triggers on messages / sessions / weekly_checkins call the Edge Function
-- `send-push` through pg_net (the same mechanism a Supabase "Database Webhook" uses, but in
-- code, so it is versioned here and can never break the insert). The function URL and a
-- shared secret are read from Supabase Vault; while they are missing the triggers do
-- nothing. See PUSH-SETUP.md, step "Vault secrets".
--
--   select vault.create_secret('https://gzcewdhjlykwqhtjludv.supabase.co/functions/v1/send-push', 'push_function_url');
--   select vault.create_secret('<same random string as the PUSH_WEBHOOK_SECRET function secret>', 'push_webhook_secret');

CREATE EXTENSION IF NOT EXISTS pg_net;

-- 1) Device tokens: FCM registration token (Android) or APNs device token (iOS).
CREATE TABLE IF NOT EXISTS push_tokens (
  token text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('android', 'ios')),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS push_tokens_user_idx ON push_tokens (user_id);
ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pt_own" ON push_tokens;
CREATE POLICY "pt_own" ON push_tokens FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- A device token belongs to the device, not the account: when someone else logs in on the
-- same phone the token moves to them (a plain upsert would hit the other user's row via RLS).
CREATE OR REPLACE FUNCTION public.register_push_token(p_token text, p_platform text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR coalesce(p_token, '') = '' OR p_platform NOT IN ('android', 'ios') THEN RETURN; END IF;
  INSERT INTO push_tokens (token, user_id, platform, updated_at)
  VALUES (p_token, auth.uid(), p_platform, now())
  ON CONFLICT (token) DO UPDATE SET user_id = EXCLUDED.user_id, platform = EXCLUDED.platform, updated_at = now();
END $$;
GRANT EXECUTE ON FUNCTION public.register_push_token(text, text) TO authenticated;

-- 2) Trigger -> Edge Function. Never raises: a push problem must not block a chat message.
CREATE OR REPLACE FUNCTION public._adlr_push_notify()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_url text;
  v_secret text;
BEGIN
  BEGIN
    SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'push_function_url' LIMIT 1;
    SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'push_webhook_secret' LIMIT 1;
    IF v_url IS NULL OR v_secret IS NULL THEN RETURN NEW; END IF;
    PERFORM net.http_post(
      url := v_url,
      body := jsonb_build_object(
        'table', TG_TABLE_NAME,
        'type', TG_OP,
        'actor', auth.uid(),
        'record', to_jsonb(NEW),
        'old_record', CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END
      ),
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
      timeout_milliseconds := 5000
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE LOG 'adlr push notify failed: %', SQLERRM;
  END;
  RETURN NEW;
END $$;

-- Chat (client <-> coach). Weekly check-ins and the coach's replies are covered here too:
-- the app always posts a chat message with both, and send-push recognises them (a check-in
-- created / replied_at set in the last 2 minutes) — so there is no separate check-in trigger
-- and nobody gets two pushes.
DROP TRIGGER IF EXISTS adlr_push_messages ON messages;
CREATE TRIGGER adlr_push_messages AFTER INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION public._adlr_push_notify();

-- Sessions: new upcoming appointment, moved, or cancelled.
DROP TRIGGER IF EXISTS adlr_push_sessions_ins ON sessions;
CREATE TRIGGER adlr_push_sessions_ins AFTER INSERT ON sessions
  FOR EACH ROW WHEN (NEW.scheduled_at > now() AND NEW.status = 'scheduled')
  EXECUTE FUNCTION public._adlr_push_notify();
DROP TRIGGER IF EXISTS adlr_push_sessions_upd ON sessions;
CREATE TRIGGER adlr_push_sessions_upd AFTER UPDATE ON sessions
  FOR EACH ROW WHEN (
    NEW.scheduled_at > now() AND (
      (OLD.scheduled_at IS DISTINCT FROM NEW.scheduled_at AND NEW.status = 'scheduled')
      OR (NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled')
    )
  )
  EXECUTE FUNCTION public._adlr_push_notify();
