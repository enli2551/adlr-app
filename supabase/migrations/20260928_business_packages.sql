-- Business: price list (packages), what each client bought, and payments.
-- Pure ASCII, safe to copy/paste into the Supabase SQL Editor.
--
-- kind:
--   'single'       = Einzeltraining, price per session (due = sessions attended x price)
--   'pack'         = session pack, e.g. 10 sessions for 700 EUR (due = price, once)
--   'subscription' = monthly, e.g. online coaching 149 EUR/month (due = price x months started)

CREATE TABLE IF NOT EXISTS packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('single', 'pack', 'subscription')),
  price numeric NOT NULL CHECK (price >= 0),
  sessions_included integer,
  validity_weeks integer,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS client_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  trainer_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  package_id uuid REFERENCES packages(id) ON DELETE SET NULL,
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('single', 'pack', 'subscription')),
  price numeric NOT NULL CHECK (price >= 0),
  sessions_total integer,
  start_date date NOT NULL DEFAULT current_date,
  end_date date,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'finished', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  client_package_id uuid REFERENCES client_packages(id) ON DELETE SET NULL,
  amount numeric NOT NULL,
  paid_at date NOT NULL DEFAULT current_date,
  method text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS client_packages_client_idx ON client_packages (client_id);
CREATE INDEX IF NOT EXISTS payments_client_idx ON payments (client_id);

ALTER TABLE packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- Price list: only the owning trainer
DROP POLICY IF EXISTS "pk_all" ON packages;
CREATE POLICY "pk_all" ON packages FOR ALL TO authenticated
  USING (auth.uid() = trainer_id) WITH CHECK (auth.uid() = trainer_id);

-- Client packages: trainer manages; the client may READ his own (e.g. "3 of 10 sessions left")
DROP POLICY IF EXISTS "cp2_select" ON client_packages;
CREATE POLICY "cp2_select" ON client_packages FOR SELECT TO authenticated
  USING (auth.uid() = trainer_id OR auth.uid() = client_id);
DROP POLICY IF EXISTS "cp2_write" ON client_packages;
CREATE POLICY "cp2_write" ON client_packages FOR ALL TO authenticated
  USING (auth.uid() = trainer_id) WITH CHECK (auth.uid() = trainer_id);

-- Payments: trainer only
DROP POLICY IF EXISTS "pay_all" ON payments;
CREATE POLICY "pay_all" ON payments FOR ALL TO authenticated
  USING (auth.uid() = trainer_id) WITH CHECK (auth.uid() = trainer_id);
