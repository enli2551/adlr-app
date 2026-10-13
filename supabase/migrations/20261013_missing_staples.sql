-- 6 common gym exercises that were missing (checked against a list of 106 staple gym exercises
-- and the open free-exercise-db): Nordic Curl, Sled Push, Smith bench press, Glute-Ham Raise,
-- assisted dip machine, close-grip (V-bar) lat pulldown. No animation clip exists for them in the
-- Vital pack — they come with cues only. Skips names that already exist, safe to run twice.
-- Run in Supabase -> SQL Editor. Umlauts as U&'' escapes so they survive copy/paste.

begin;

insert into exercises (name, muscle_group, equipment, tempo, default_sets, default_reps, default_rest_sec, exercise_id, cues)
select v.* from (values
  ('Nordic Hamstring Curl', 'Beine', U&'K\00F6rpergewicht', '4-1-1', 3, 6, 120, 'adlr001', ARRAY[U&'F\00FC\00DFe fixieren, Knie gepolstert', U&'H\00FCfte gestreckt halten', U&'So langsam wie m\00F6glich nach vorne absenken', U&'Mit den H\00E4nden abfangen und zur\00FCckdr\00FCcken']),
  ('Schlitten schieben', 'Beine', 'Schlitten', 'Schnell', 4, 20, 120, 'adlr002', ARRAY[U&'K\00F6rper etwa 45\00B0 nach vorne geneigt', 'Kurze, kraftvolle Schritte', U&'Rumpf fest, R\00FCcken gerade', 'Wiederholungen = Meter pro Bahn']),
  (U&'Bankdr\00FCcken (Smith Machine)', 'Brust', 'Smith Machine', '2-1-2', 4, 8, 120, 'adlr003', ARRAY[U&'Sicherheitshaken auf Brusth\00F6he einstellen', U&'Schulterbl\00E4tter zusammen', 'Stange zur unteren Brust', U&'Ellenbogen etwa 45\00B0 vom K\00F6rper']),
  ('Glute-Ham Raise', 'Beine', 'Maschine', '2-1-2', 3, 8, 90, 'adlr004', ARRAY[U&'Knie hinter dem Polster, F\00FC\00DFe fixiert', U&'Oberk\00F6rper gerade nach vorne absenken', 'Mit Beinbeuger und Po hochziehen', U&'H\00FCfte gestreckt lassen']),
  ('Assistierte Dips (Maschine)', 'Brust', 'Maschine', '2-1-2', 3, 10, 90, 'adlr005', ARRAY['Knie auf das Polster', 'Schultern tief, weg von den Ohren', 'Bis die Oberarme parallel sind absenken', U&'Mehr Gewicht = mehr Unterst\00FCtzung']),
  ('Latzug eng (V-Griff)', U&'R\00FCcken', 'Kabelzug', '2-1-2', 3, 10, 90, 'adlr006', ARRAY[U&'V-Griff, Handfl\00E4chen zueinander', U&'Brust raus, leicht zur\00FCcklehnen', 'Griff zur oberen Brust ziehen', U&'Langsam nach oben f\00FChren'])
) as v(name, muscle_group, equipment, tempo, default_sets, default_reps, default_rest_sec, exercise_id, cues)
where not exists (select 1 from exercises e where e.name = v.name);

commit;
