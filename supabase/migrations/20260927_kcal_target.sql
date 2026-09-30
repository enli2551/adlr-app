-- Daily calorie target per client, set by the trainer (or accepted from the app's
-- suggestion). Compared against calories eaten from Apple Health / Health Connect
-- (e.g. logged in YAZIO). The existing profiles UPDATE policy already lets the
-- client and the trainer write it. Pure ASCII.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS kcal_target integer;
