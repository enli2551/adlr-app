/*
  Add 5 exercises missing from the shared library:
    Box Squat, Pec Fly (Maschine), Pallof Press,
    Gehen am Steigungslaufband, Iso-Lateral High Row.

  Run in Supabase Dashboard → SQL Editor (bypasses RLS; the exercises table
  has no INSERT policy and is managed via migrations only).

  Demo / animation notes (exercise_id drives the in-app demo lookup):
  - Box Squat → '0102' reuses the existing squat animation (back-squat) as a
    movement reference. Works immediately in the installed app.
  - Gehen am Steigungslaufband → '0685' reuses the "walk on treadmill" animation.
    Works immediately.
  - Pec Fly (Maschine) → '9051' is a fresh key mapped in the app to the bundled
    pec-deck animation (LOCAL_DEMO_VIDEOS['9051'] → '0051.mp4'); shows after the
    next app build.
  - Pallof Press, Iso-Lateral High Row → no matching asset yet (cues only).
  exercise_id is NOT unique in this table (many rows share ids), so reuse is safe.
*/

INSERT INTO exercises
  (name, muscle_group, equipment, tempo, default_sets, default_reps, default_rest_sec, exercise_id, cues)
VALUES
  (
    'Box Squat', 'Beine', 'Langhantel', '2-1-1', 3, 8, 90, '0102',
    ARRAY[
      'Eine Box/Bank hinter dich stellen (Höhe: Oberschenkel etwa parallel oder leicht höher).',
      'Langhantel im Nacken, Stand etwas breiter als schulterbreit, Zehen leicht nach außen.',
      'Hüfte nach hinten schieben und kontrolliert auf die Box absetzen — kurz halten, ohne ganz zu entspannen.',
      'Über die Fersen kraftvoll nach oben drücken, Rücken gerade, Knie in Linie mit den Zehen.'
    ]
  ),
  (
    'Pec Fly (Maschine)', 'Brust', 'Maschine', '2-1-2', 3, 12, 60, '9051',
    ARRAY[
      'Aufrecht sitzen, Rücken ans Polster, Griffe auf Brusthöhe fassen.',
      'Ellbogen leicht gebeugt und fixiert — die Bewegung kommt aus den Schultern, nicht den Armen.',
      'Griffe in einem weiten Bogen vor der Brust zusammenführen, Brust anspannen.',
      'Langsam kontrolliert öffnen, bis die Brust gedehnt ist, ohne die Gewichte abzusetzen.'
    ]
  ),
  (
    'Pallof Press', 'Core', 'Kabelzug', '2-2-2', 3, 12, 45, '',
    ARRAY[
      'Kabel/Band auf Brusthöhe einstellen, seitlich dazu stellen, Griff mit beiden Händen vor die Brust.',
      'Hüftbreiter, stabiler Stand, Rumpf fest angespannt, Becken neutral.',
      'Griff langsam gerade nach vorne strecken — der Zug will dich drehen, du hältst dagegen (Anti-Rotation).',
      'Kurz halten, kontrolliert zurückführen. Beide Seiten gleich trainieren.'
    ]
  ),
  (
    'Gehen am Steigungslaufband', 'Cardio', 'Maschine', 'Zone 2', 1, 20, 45, '0685',
    ARRAY[
      'Steigung am Laufband einstellen (z. B. 6–12 %).',
      'Aufrechte Haltung, Blick nach vorne — nicht an den Griffen festhalten oder lehnen.',
      'Zügiges, gleichmäßiges Gehtempo — du solltest dich noch unterhalten können (Zone 2).',
      'Ruhige Atmung, Rumpf leicht anspannen, Schritte gleichmäßig abrollen.'
    ]
  ),
  (
    'Iso-Lateral High Row', 'Rücken', 'Maschine', '2-1-2', 3, 10, 75, '',
    ARRAY[
      'Brust ans Polster, Griffe von oben fassen (etwas oberhalb der Schultern).',
      'Griffe nach hinten-unten zum Körper ziehen, Ellbogen dabei nah am Körper führen.',
      'Schulterblätter zusammenziehen, kurz halten — Fokus auf den oberen Rücken.',
      'Langsam und kontrolliert zurück in die Dehnung, Arme nicht ganz durchstrecken lassen.'
    ]
  );
