-- 1) Missing exercises: weighted pull-ups, weighted dips, overhead cable triceps extension with a bar.
-- 2) Leg curl cues fixed: "Beinbeuger" is shown as the LYING leg curl (animation), but its cues said
--    "Po auf Sitz" (seated); "Beinbeuger sitzend (Maschine)" had a leg-extension cue ("Volle Streckung").
-- Skips names that already exist, safe to run twice.
-- Run in Supabase -> SQL Editor. Umlauts as U&'' escapes so they survive copy/paste.

begin;

insert into exercises (name, muscle_group, equipment, tempo, default_sets, default_reps, default_rest_sec, exercise_id, cues)
select v.* from (values
  (U&'Klimmz\00FCge mit Gewicht', U&'R\00FCcken', 'Klimmzugstange', '2-1-2', 4, 6, 150, 'adlr007', ARRAY[U&'Gewicht am Dipg\00FCrtel oder zwischen den F\00FC\00DFen', U&'Aus dem toten Hang starten, Schultern aktiv', U&'Brust zur Stange, Kinn \00FCber die Stange', U&'Kontrolliert ganz ablassen']),
  ('Dips mit Gewicht', 'Brust', U&'K\00F6rpergewicht', '2-1-2', 4, 6, 150, 'adlr008', ARRAY[U&'Gewicht am Dipg\00FCrtel, Beine ruhig', U&'Schultern tief, weg von den Ohren', U&'Bis die Oberarme parallel sind absenken', U&'Kraftvoll hochdr\00FCcken, Ellenbogen nicht ganz durchstrecken']),
  ('Kabel Overhead Trizeps Extension (Stange)', 'Arme', 'Kabelzug', '2-1-2', 3, 12, 60, 'adlr009', ARRAY[U&'Mit dem R\00FCcken zum Kabelzug, Stange hinter dem Kopf', 'Oberarme neben dem Kopf fixieren', U&'Nur die Unterarme strecken, bis die Arme gerade sind', U&'Langsam zur\00FCck in die Dehnung'])
) as v(name, muscle_group, equipment, tempo, default_sets, default_reps, default_rest_sec, exercise_id, cues)
where not exists (select 1 from exercises e where e.name = v.name);

update exercises set cues = ARRAY[
  U&'H\00FCfte fest aufs Polster dr\00FCcken',
  U&'Fersen kraftvoll Richtung Po ziehen',
  'Oben kurz halten',
  'Kontrolliert ablassen, nicht durchschwingen'
] where name = 'Beinbeuger';

update exercises set cues = ARRAY[
  'Oberschenkelpolster fest auf die Beine',
  U&'Fersen nach unten-hinten unter den Sitz ziehen',
  'Unten kurz halten',
  U&'Langsam zur\00FCck, Knie nicht ganz durchstrecken'
] where name = 'Beinbeuger sitzend (Maschine)';

commit;
