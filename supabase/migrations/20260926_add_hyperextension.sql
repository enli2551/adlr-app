/*
  Add the missing Hyperextension (back extension on the 45°/90° bench).

  Run in Supabase Dashboard → SQL Editor (bypasses RLS; the exercises table
  has no INSERT policy and is managed via migrations only).

  Demo: no hyperextension clip in the Vital pack → exercise_id '9170' is a
  fresh key with no LOCAL_DEMO_VIDEOS entry (cues only).
  App side: CACHE_VERSION in src/lib/exercises.ts bumped so devices refetch.
*/

INSERT INTO exercises
  (name, muscle_group, equipment, tempo, default_sets, default_reps, default_rest_sec, exercise_id, cues)
SELECT
  'Hyperextension (Rückenstrecker)', 'Rücken', 'Körpergewicht', '2-1-2', 3, 12, 60, '9170',
  ARRAY[
    'Hüfte knapp über dem Polster positionieren, Fersen fest unter die Fußpolster.',
    'Arme vor der Brust verschränken (für mehr Last eine Hantelscheibe halten).',
    'Oberkörper kontrolliert absenken, Rücken dabei gerade halten — kein Rundrücken.',
    'Über Po und unteren Rücken hochkommen, bis der Körper eine Linie bildet — nicht überstrecken.'
  ]
WHERE NOT EXISTS (SELECT 1 FROM exercises WHERE name = 'Hyperextension (Rückenstrecker)');
