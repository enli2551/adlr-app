/*
  Add the missing hip ADDUCTOR machine exercise (the library only had the
  abductor machine "Hüftabduktoren" and a cable variant "Kabel Hüftadduktion",
  which doesn't show up when searching "Adduktor").

  Run in Supabase Dashboard → SQL Editor (bypasses RLS; the exercises table
  has no INSERT policy and is managed via migrations only).

  Demo: no bundled adductor animation yet → exercise_id '9168' is a fresh key
  with no LOCAL_DEMO_VIDEOS entry (cues only). Map it once an asset exists.
  App side: CACHE_VERSION in src/lib/exercises.ts bumped so devices refetch.
*/

INSERT INTO exercises
  (name, muscle_group, equipment, tempo, default_sets, default_reps, default_rest_sec, exercise_id, cues)
SELECT
  'Adduktoren (Maschine)', 'Beine', 'Maschine', '2-1-2', 3, 15, 60, '9168',
  ARRAY[
    'Aufrecht sitzen, Rücken ans Polster, Beinpolster an der Innenseite der Knie/Oberschenkel.',
    'Startposition so wählen, dass die Innenseite der Oberschenkel angenehm gedehnt ist.',
    'Beine kraftvoll zusammendrücken, kurz halten und die Innenseite der Oberschenkel anspannen.',
    'Langsam und kontrolliert öffnen, ohne die Gewichte abzusetzen oder mit Schwung zu arbeiten.'
  ]
WHERE NOT EXISTS (SELECT 1 FROM exercises WHERE name = 'Adduktoren (Maschine)');
