-- 1) Personal records per Studio for machine/cable exercises (weights differ per gym).
--    NULL = gym-independent (free weights) or no gym chosen.
ALTER TABLE personal_records ADD COLUMN IF NOT EXISTS gym text;

-- 2) Fix double-encoded umlaut in the Hyperextension equipment (KÃ¶rpergewicht -> Körpergewicht).
--    chr(246) = 'ö', so this file stays pure ASCII and survives copy/paste.
UPDATE exercises
SET equipment = 'K' || chr(246) || 'rpergewicht'
WHERE equipment LIKE 'K%rpergewicht' AND equipment <> 'K' || chr(246) || 'rpergewicht';
