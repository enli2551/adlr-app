/*
  Add Goblet Squat + Spanish Squat to the shared exercise library.
  Run in Supabase Dashboard → SQL Editor (bypasses RLS; the exercises table
  has no INSERT policy and is managed via migrations only).

  Animation note:
  - Goblet Squat uses exercise_id '0534' — the REAL goblet-squat GIF already used
    by the existing German entry "Kelch-Kniebeuge" (verified in the live DB).
  - Spanish Squat has no ExerciseDB match → exercise_id '' (cues only, no demo GIF).
*/

INSERT INTO exercises
  (name, muscle_group, equipment, tempo, default_sets, default_reps, default_rest_sec, exercise_id, cues)
VALUES
  (
    'Goblet Squat', 'Beine', 'Kurzhantel', '3-1-1', 3, 12, 90, '0534',
    ARRAY[
      'Kurzhantel oder Kettlebell senkrecht vor der Brust halten, Ellbogen zeigen nach unten.',
      'Füße schulterbreit aufstellen, Zehen leicht nach außen drehen.',
      'Kontrolliert tief absitzen — die Ellbogen wandern zwischen die Knie, Rücken bleibt gerade.',
      'Über die Fersen nach oben drücken, Knie bleiben in Linie mit den Zehen.'
    ]
  ),
  (
    'Spanish Squat', 'Beine', 'Widerstandsband', '3-1-3', 3, 15, 60, '',
    ARRAY[
      'Widerstandsband auf Kniehöhe an einem festen Punkt fixieren und hinter die Knie legen.',
      'Aufrechter Oberkörper, das Gewicht bleibt in den Fersen.',
      'Knie beugen und leicht zurücklehnen — das Band hält die Spannung nach hinten.',
      'Langsam und kontrolliert nach oben drücken, Fokus auf den Quadrizeps.'
    ]
  );
