-- Realtime chat + Coach-tab offers.
-- Pure ASCII, safe to copy/paste into the Supabase SQL Editor. Idempotent.

-- 1) Stream new chat messages over Supabase Realtime (RLS still applies per subscriber).
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;
END $$;

-- 2) Optional short description for a package, shown to clients on the Coach tab.
ALTER TABLE packages ADD COLUMN IF NOT EXISTS description text;
-- Whether the package is offered to clients in the app (price list can hold internal items too).
ALTER TABLE packages ADD COLUMN IF NOT EXISTS show_to_clients boolean NOT NULL DEFAULT true;

-- 3) Clients read their own trainer's packages (also created by 20261001_multi_trainer.sql).
DROP POLICY IF EXISTS "pk_client_read" ON packages;
CREATE POLICY "pk_client_read" ON packages FOR SELECT TO authenticated
  USING (trainer_id = public.my_trainer());

-- 4) Upsell requests may reference a package (upgrade_key keeps the readable name).
ALTER TABLE upsell_requests ADD COLUMN IF NOT EXISTS package_id uuid REFERENCES packages(id) ON DELETE SET NULL;
