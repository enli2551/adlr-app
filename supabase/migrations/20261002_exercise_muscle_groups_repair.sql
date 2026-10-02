-- REPAIR for 20261002_exercise_muscle_groups_fix.sql: the umlauts arrived garbled in the SQL
-- editor (Ruecken showed up as "RA14cken"), so 3 rows got a broken group name and the exercises with umlauts in
-- their name were not matched. Every non-ASCII text here is a Unicode escape (U&'...'), so it
-- works however the file/clipboard is encoded. Safe to run more than once.

begin;

-- broken group name -> Ruecken
update exercises set muscle_group = U&'R\00FCcken' where muscle_group = U&'R\00C3\00BCcken';

update exercises set muscle_group = 'Brust'     where name = U&'Liegest\00FCtze';
update exercises set muscle_group = U&'R\00FCcken'    where name = 'Rudern';
update exercises set muscle_group = 'Cardio'    where name = 'Handbike';
update exercises set muscle_group = 'Unterarme' where name = 'Wrist Curls';
update exercises set muscle_group = 'Core'      where name in ('Flutter Kicks', 'Balance Board', 'Kabel Twist Zug');
update exercises set muscle_group = 'Cardio'    where name in ('Burpees', 'Battle Ropes');
update exercises set muscle_group = 'Beine'     where name = 'Halbe Kniebeugen';
update exercises set muscle_group = 'Po'        where name in ('Kettlebell Swings', U&'Smith H\00FCftheben', U&'Gerade-Bein H\00FCftbr\00FCcke');
update exercises set muscle_group = U&'R\00FCcken'    where name = 'Langhantel Rack Pull';

update exercises set muscle_group = 'Schultern' where name in ('Face Pulls', 'Rear Delt Row');
update exercises set muscle_group = U&'R\00FCcken'    where name = 'Shrugs';
update exercises set muscle_group = 'Beine' where muscle_group = 'Po' and name in (
  'Band Step-ups', 'Jump Squat (V2)', 'Kettlebell Ausfallschritt Durchreichen',
  'Kurzhantel Ausfallschritte', 'Kurzhantel Bank Kniebeuge', 'Kurzhantel Clean', 'Kurzhantel Einbein Kniebeuge',
  'Kurzhantel Gerade-Bein Kreuzheben', 'Kurzhantel Hintere Ausfallschritte', 'Kurzhantel Kniebeuge',
  'Kurzhantel Kreuzheben', 'Kurzhantel Plyo Kniebeuge', U&'Kurzhantel Rum\00E4nisches Kreuzheben',
  'Kurzhantel Steifbein Kreuzheben', 'Kurzhantel Step-ups', 'Kabel Kreuzheben',
  'Langhantel Clean-Grip Front Kniebeuge', 'Langhantel Einarmig Side Deadlift', 'Langhantel Enge Stand Kniebeuge',
  'Langhantel Front Brust Kniebeuge', 'Langhantel Front Kniebeuge', 'Langhantel Hintere Ausfallschritte',
  'Langhantel Hintere Ausfallschritte (V2)', 'Langhantel Jefferson Kniebeuge', 'Langhantel Jump Squat',
  'Langhantel Seitliche Ausfallschritte', 'Langhantel Sitz Good Morning', 'Langhantel Speed Kniebeuge',
  'Langhantel Steifbein Good Morning', 'Langhantel Step-ups', 'Langhantel Tiefe Kniebeuge',
  'Langhantel Zercher Kniebeuge', 'Smith Sprint Ausfallschritt', 'Sumo-Kniebeuge'
);

commit;

-- Expected: Arme 61, Beine 100, Brust 49, Cardio 30, Core 57, Nacken 10, Po 19, Ruecken 56, Schultern 44, Unterarme 16
select muscle_group, count(*) from exercises group by muscle_group order by muscle_group;
