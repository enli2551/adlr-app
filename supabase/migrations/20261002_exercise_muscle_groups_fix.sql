-- Muscle-group review of the exercise library (442 exercises, checked one by one).
-- Only exercises.muscle_group changes — names stay the same, so plans, logs and
-- records are untouched; charts (weekly muscle groups, monthly report) get more accurate.
-- The app caches the library per device: CACHE_VERSION in src/lib/exercises.ts was bumped
-- to 8 in the same commit, so the next build picks the new groups up.

begin;

-- 1) Plain errors
update exercises set muscle_group = 'Brust'     where name = 'Liegestütze';                 -- was Beine
update exercises set muscle_group = 'Rücken'    where name = 'Rudern';                      -- was Beine (barbell row)
update exercises set muscle_group = 'Cardio'    where name = 'Handbike';                    -- was Brust
update exercises set muscle_group = 'Unterarme' where name = 'Wrist Curls';                 -- was Arme (all other wrist curls are Unterarme)
update exercises set muscle_group = 'Core'      where name in ('Flutter Kicks', 'Balance Board', 'Kabel Twist Zug');
update exercises set muscle_group = 'Cardio'    where name in ('Burpees', 'Battle Ropes');  -- were Core
update exercises set muscle_group = 'Beine'     where name = 'Halbe Kniebeugen';            -- was Cardio
update exercises set muscle_group = 'Po'        where name in ('Kettlebell Swings', 'Smith Hüftheben', 'Gerade-Bein Hüftbrücke');
update exercises set muscle_group = 'Rücken'    where name = 'Langhantel Rack Pull';        -- was Po

-- 2) Same movement, different group → made consistent
-- rear delts: like "Kabel Rear Delt Rudern" (Schultern)
update exercises set muscle_group = 'Schultern' where name in ('Face Pulls', 'Rear Delt Row');
-- shrugs (trapezius): four variants were Rücken, "Shrugs" itself Schultern
update exercises set muscle_group = 'Rücken'    where name = 'Shrugs';
-- squats, lunges, step-ups and deadlift variants: "Kniebeugen", "Frontkniebeugen",
-- "Ausfallschritte", "Kreuzheben", "Rumänisches Kreuzheben" are Beine, their
-- dumbbell/barbell variants were Po. Po keeps the glute-isolation moves
-- (bridges, hip thrusts, kickbacks, pull-throughs, hip extensions, monster walk).
update exercises set muscle_group = 'Beine' where muscle_group = 'Po' and name in (
  'Band Step-ups', 'Jump Squat (V2)', 'Kettlebell Ausfallschritt Durchreichen',
  'Kurzhantel Ausfallschritte', 'Kurzhantel Bank Kniebeuge', 'Kurzhantel Clean', 'Kurzhantel Einbein Kniebeuge',
  'Kurzhantel Gerade-Bein Kreuzheben', 'Kurzhantel Hintere Ausfallschritte', 'Kurzhantel Kniebeuge',
  'Kurzhantel Kreuzheben', 'Kurzhantel Plyo Kniebeuge', 'Kurzhantel Rumänisches Kreuzheben',
  'Kurzhantel Steifbein Kreuzheben', 'Kurzhantel Step-ups', 'Kabel Kreuzheben',
  'Langhantel Clean-Grip Front Kniebeuge', 'Langhantel Einarmig Side Deadlift', 'Langhantel Enge Stand Kniebeuge',
  'Langhantel Front Brust Kniebeuge', 'Langhantel Front Kniebeuge', 'Langhantel Hintere Ausfallschritte',
  'Langhantel Hintere Ausfallschritte (V2)', 'Langhantel Jefferson Kniebeuge', 'Langhantel Jump Squat',
  'Langhantel Seitliche Ausfallschritte', 'Langhantel Sitz Good Morning', 'Langhantel Speed Kniebeuge',
  'Langhantel Steifbein Good Morning', 'Langhantel Step-ups', 'Langhantel Tiefe Kniebeuge',
  'Langhantel Zercher Kniebeuge', 'Smith Sprint Ausfallschritt', 'Sumo-Kniebeuge'
);

commit;

-- Check: count per group (before: Arme 62, Beine 69, Brust 49, Cardio 28, Core 58,
-- Nacken 10, Po 52, Rücken 56, Schultern 43, Unterarme 15)
select muscle_group, count(*) from exercises group by muscle_group order by muscle_group;
