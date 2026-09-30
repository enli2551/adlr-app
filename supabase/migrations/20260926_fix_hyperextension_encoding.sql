-- Fix double-encoded umlaut (RÃ¼cken -> Rücken) on the Hyperextension row.
-- chr(252) = 'ü', so this file stays pure ASCII and survives copy/paste.
UPDATE exercises
SET name = 'Hyperextension (R' || chr(252) || 'ckenstrecker)',
    muscle_group = 'R' || chr(252) || 'cken'
WHERE name LIKE 'Hyperextension%';
