-- 70 new library exercises with Vital Animations demos (movements the library did not have).
-- Only INSERTs into the shared exercise library: existing exercises, plans, logs and accounts are untouched.
-- Skips any name that already exists, so it is safe to run twice.
-- Non-ASCII text is written as Unicode escapes (U&'...') so umlauts survive copy/paste into the SQL editor.
-- exercise_id 'va<clip>' is informational; the app finds the animation by exercise name (src/lib/demoVideos.ts).

begin;

insert into exercises (name, muscle_group, equipment, tempo, default_sets, default_reps, default_rest_sec, exercise_id, cues)
select v.* from (values
  ('Kurzhantel Spider Curl', 'Arme', 'Kurzhantel', '2-1-2', 3, 12, 60, 'va0018', ARRAY['Oberarme still', 'Bizeps anspannen', 'Kontrolliert absenken']),
  (U&'Kurzhantel Schr\00E4gbank Curl', 'Arme', 'Kurzhantel', '2-1-2', 3, 12, 60, 'va0019', ARRAY['Oberarme still', 'Kein Schwung', 'Volle Streckung unten']),
  ('Zottman Curl (Kurzhantel)', 'Arme', 'Kurzhantel', '2-1-3', 3, 10, 60, 'va0183', ARRAY[U&'Ellenbogen fest am K\00F6rper', 'Kontrolliert absenken', 'Kein Schwung']),
  ('Bizepscurl (EZ-Hantel)', 'Arme', 'Langhantel', '2-1-2', 3, 10, 60, 'va0155', ARRAY[U&'Ellenbogen fest am K\00F6rper', 'Kein Schwung', 'Bizeps anspannen']),
  ('Preacher Curl (Maschine)', 'Arme', 'Maschine', '2-1-2', 3, 12, 60, 'va0159', ARRAY['Oberarme auf Polster', 'Volle Streckung unten', 'Kontrolliert absenken']),
  ('Kurzhantel Trizeps Kickback', 'Arme', 'Kurzhantel', '2-1-2', 3, 12, 45, 'va0146', ARRAY[U&'Oberk\00F6rper vorgebeugt', 'Ellenbogen fixiert', 'Volle Streckung']),
  (U&'Stirndr\00FCcken (Kurzhantel)', 'Arme', 'Kurzhantel', '3-1-1', 3, 12, 60, 'va0150', ARRAY['Oberarme still', 'Kontrolliert absenken', 'Ellenbogen fixiert']),
  ('Tate Press', 'Arme', 'Kurzhantel', '2-1-2', 3, 12, 60, 'va0176', ARRAY[U&'Ellenbogen nach au\00DFen', 'Kontrolliert absenken', 'Volle Streckung']),
  ('Dip-Maschine sitzend', 'Arme', 'Maschine', '2-1-2', 3, 12, 60, 'va0167', ARRAY['Aufrechter Sitz', U&'Ellenbogen nah am K\00F6rper', 'Volle Streckung unten']),
  ('Widerstandsband Bizeps Curl', 'Arme', 'Widerstandsband', '2-1-2', 3, 15, 45, 'va0161', ARRAY[U&'Ellenbogen fest am K\00F6rper', 'Kein Schwung', 'Bizeps anspannen']),
  ('Widerstandsband Overhead Trizeps Extension', 'Arme', 'Widerstandsband', '2-1-2', 3, 15, 45, 'va0162', ARRAY[U&'\00DCber Kopf strecken', 'Ellenbogen fixiert', 'Kontrolliert absenken']),
  ('Svend Press', 'Brust', 'Zusatzgewicht', '2-1-2', 3, 12, 45, 'va0052', ARRAY['Brust zusammenziehen', 'Arme gestreckt', U&'Kontrolliert zur\00FCck']),
  (U&'Decline Liegest\00FCtze', 'Brust', U&'K\00F6rpergewicht', '2-1-1', 3, 12, 60, 'va1126', ARRAY[U&'Gerader K\00F6rper', 'Brust fast zum Boden', U&'Explosiv dr\00FCcken']),
  (U&'Breite Liegest\00FCtze', 'Brust', U&'K\00F6rpergewicht', '2-1-1', 3, 12, 60, 'va1208', ARRAY[U&'Gerader K\00F6rper', 'Brust fast zum Boden', 'Bauch anspannen']),
  (U&'Archer Liegest\00FCtze', 'Brust', U&'K\00F6rpergewicht', '2-1-1', 3, 8, 60, 'va0130', ARRAY[U&'Gerader K\00F6rper', 'Seiten abwechseln', 'Kontrolliert absenken']),
  (U&'Liegest\00FCtze mit Gewicht', 'Brust', 'Zusatzgewicht', '2-1-1', 3, 10, 75, 'va0026', ARRAY[U&'Gerader K\00F6rper', 'Bauch anspannen', U&'Explosiv dr\00FCcken']),
  ('Widerstandsband Brustpresse', 'Brust', 'Widerstandsband', '2-1-2', 3, 15, 45, 'va0235', ARRAY[U&'Brust nach oben dr\00FCcken', 'Volle Streckung', U&'Kontrolliert zur\00FCck']),
  ('Pendlay Row', U&'R\00FCcken', 'Langhantel', '1-0-2', 4, 6, 120, 'va0195', ARRAY[U&'R\00FCcken gerade', 'Explosiv nach oben', U&'Schulterbl\00E4tter zusammen']),
  ('Umgekehrtes Rudern', U&'R\00FCcken', U&'K\00F6rpergewicht', '2-1-2', 3, 10, 60, 'va0194', ARRAY[U&'Gerader K\00F6rper', 'Stange zur Brust', U&'Schulterbl\00E4tter zusammen']),
  ('Renegade Row', U&'R\00FCcken', 'Kurzhantel', '2-1-2', 3, 10, 60, 'va0199', ARRAY['Hohe Brettstellung', U&'H\00FCfte stabil', 'Seiten abwechseln']),
  (U&'Klimmz\00FCge (breiter Griff)', U&'R\00FCcken', 'Klimmzugstange', '2-1-2', 4, 8, 120, 'va0208', ARRAY[U&'Schulterbl\00E4tter nach unten', U&'Kinn \00FCber Stange', 'Kein Schwung']),
  (U&'Negative Klimmz\00FCge', U&'R\00FCcken', 'Klimmzugstange', '1-0-5', 3, 5, 90, 'va1169', ARRAY[U&'Kinn \00FCber Stange', U&'Langsam ausf\00FChren', 'Spannung halten']),
  ('Kurzhantel Shrugs', U&'R\00FCcken', 'Kurzhantel', '1-2-2', 3, 12, 60, 'va0034', ARRAY['Schultern hochziehen', 'Kurz halten oben', 'Arme gestreckt']),
  ('Superman', U&'R\00FCcken', U&'K\00F6rpergewicht', 'Halten', 3, 30, 45, 'va0205', ARRAY[U&'R\00FCcken anspannen', 'Beine gestreckt', 'Spannung halten']),
  ('Widerstandsband Latzug', U&'R\00FCcken', 'Widerstandsband', '2-1-2', 3, 15, 45, 'va0201', ARRAY[U&'Schulterbl\00E4tter nach unten', 'Ellenbogen nach hinten', U&'Kontrolliert zur\00FCck']),
  ('Widerstandsband Sitzrudern', U&'R\00FCcken', 'Widerstandsband', '2-1-2', 3, 15, 45, 'va0187', ARRAY['Aufrechter Sitz', U&'Schulterbl\00E4tter zusammen', U&'Kontrolliert zur\00FCck']),
  ('Seitheben (Maschine)', 'Schultern', 'Maschine', '2-1-2', 3, 15, 45, 'va0097', ARRAY[U&'Bis Schulterh\00F6he heben', 'Kein Schwung', 'Kontrolliert absenken']),
  ('Schulterpresse (Maschine)', 'Schultern', 'Maschine', '2-1-2', 3, 10, 90, 'va0166', ARRAY[U&'R\00FCcken fest an Lehne', U&'\00DCber Kopf strecken', 'Kontrolliert absenken']),
  (U&'Kettlebell Schulterdr\00FCcken', 'Schultern', 'Kettlebell', '2-1-2', 3, 10, 60, 'va0094', ARRAY['Rumpf anspannen', U&'\00DCber Kopf strecken', U&'Gleichm\00E4\00DFig beide Seiten']),
  ('Landminen-Press einarmig', 'Schultern', 'Langhantel', '2-1-2', 3, 10, 60, 'va0020', ARRAY['Rumpf anspannen', U&'Kontrolliert dr\00FCcken', U&'Gleichm\00E4\00DFig beide Seiten']),
  ('Kurzhantel Upright Row', 'Schultern', 'Kurzhantel', '2-1-2', 3, 12, 60, 'va0091', ARRAY['Ellenbogen hoch', U&'Gewicht nah am K\00F6rper', 'Kontrolliert absenken']),
  ('Kurzhantel Reverse Fly', 'Schultern', 'Kurzhantel', '2-1-2', 3, 15, 45, 'va0198', ARRAY[U&'Oberk\00F6rper vorgebeugt', 'Leicht gebeugte Ellenbogen', U&'Schulterbl\00E4tter zusammen']),
  ('Frontheben mit Hantelscheibe', 'Schultern', 'Zusatzgewicht', '2-1-2', 3, 12, 45, 'va0093', ARRAY['Arme gestreckt', U&'Bis Schulterh\00F6he heben', 'Kein Schwung']),
  ('Kurzhantel Y-Raise', 'Schultern', 'Kurzhantel', '2-1-2', 3, 12, 45, 'va0290', ARRAY['Leichtes Gewicht', 'Arme gestreckt', U&'Schulterbl\00E4tter nach unten']),
  (U&'Pike Liegest\00FCtze', 'Schultern', U&'K\00F6rpergewicht', '2-1-1', 3, 10, 60, 'va1172', ARRAY[U&'H\00FCfte nach oben', 'Kontrolliert absenken', U&'Explosiv dr\00FCcken']),
  (U&'Handstand Liegest\00FCtze', 'Schultern', U&'K\00F6rpergewicht', '2-1-1', 3, 5, 120, 'va0228', ARRAY[U&'K\00F6rper anspannen', 'Kontrolliert absenken', U&'Explosiv dr\00FCcken']),
  ('Widerstandsband Pull-Apart', 'Schultern', 'Widerstandsband', '2-1-2', 3, 15, 30, 'va0186', ARRAY['Arme gestreckt', U&'Schulterbl\00E4tter zusammen', U&'Kontrolliert zur\00FCck']),
  ('Widerstandsband Seitheben', 'Schultern', 'Widerstandsband', '2-1-2', 3, 15, 45, 'va0285', ARRAY[U&'Bis Schulterh\00F6he heben', 'Kein Schwung', 'Kontrolliert absenken']),
  (U&'Widerstandsband Schulterdr\00FCcken', 'Schultern', 'Widerstandsband', '2-1-2', 3, 15, 45, 'va0185', ARRAY['Rumpf anspannen', U&'\00DCber Kopf strecken', 'Kontrolliert absenken']),
  ('Beinbeuger sitzend (Maschine)', 'Beine', 'Maschine', '2-1-2', 3, 12, 60, 'va0079', ARRAY[U&'R\00FCcken fest an Lehne', 'Volle Streckung', U&'Kontrolliert zur\00FCck']),
  ('Kniebeuge (Smith Machine)', 'Beine', 'Smith Machine', '2-1-1', 4, 10, 90, 'va0279', ARRAY[U&'F\00FC\00DFe schulterbreit', 'Tiefe: Oberschenkel parallel', 'Knie in Linie']),
  ('Kniebeuge (Maschine)', 'Beine', 'Maschine', '2-1-1', 4, 10, 90, 'va0280', ARRAY[U&'R\00FCcken fest an Lehne', 'Tiefe: Oberschenkel parallel', 'Knie in Linie']),
  ('Bulgarische Kniebeuge', 'Beine', U&'K\00F6rpergewicht', '2-1-1', 3, 10, 60, 'va1113', ARRAY[U&'Oberk\00F6rper aufrecht', 'Hinteres Knie zum Boden', U&'Gleichm\00E4\00DFig beide Seiten']),
  ('Pistol Squat', 'Beine', U&'K\00F6rpergewicht', '3-1-1', 3, 6, 90, 'va1173', ARRAY['Gleichgewicht halten', 'Kontrolliert absenken', U&'Gleichm\00E4\00DFig beide Seiten']),
  ('Seitliche Ausfallschritte', 'Beine', U&'K\00F6rpergewicht', '2-1-1', 3, 12, 60, 'va0216', ARRAY[U&'Gro\00DFer Schritt', U&'H\00FCfte nach hinten', U&'Gleichm\00E4\00DFig beide Seiten']),
  ('Curtsy Lunges', 'Beine', U&'K\00F6rpergewicht', '2-1-1', 3, 12, 60, 'va0252', ARRAY[U&'Oberk\00F6rper aufrecht', 'Knie in Linie', U&'Gleichm\00E4\00DFig beide Seiten']),
  ('Kurzhantel Sumo-Kreuzheben', 'Beine', 'Kurzhantel', '2-1-2', 3, 10, 90, 'va0258', ARRAY['Weite Sumo-Stellung', U&'R\00FCcken gerade', U&'H\00FCfte durchdr\00FCcken']),
  (U&'Einbeiniges Rum\00E4nisches Kreuzheben (Kurzhantel)', 'Beine', 'Kurzhantel', '3-1-1', 3, 10, 60, 'va0204', ARRAY['Gleichgewicht halten', U&'R\00FCcken gerade', U&'H\00FCfte nach hinten schieben']),
  ('Widerstandsband Kniebeuge', 'Beine', 'Widerstandsband', '2-1-1', 3, 15, 45, 'va0277', ARRAY[U&'F\00FC\00DFe schulterbreit', 'Knie in Linie', 'Brust aufrecht']),
  (U&'Kabel H\00FCftabduktion', 'Po', 'Kabelzug', '2-1-2', 3, 15, 45, 'va0251', ARRAY['Bein zur Seite heben', U&'H\00FCfte stabil', U&'Gleichm\00E4\00DFig beide Seiten']),
  ('Donkey Kicks', 'Po', U&'K\00F6rpergewicht', '2-1-2', 3, 15, 45, 'va0253', ARRAY['Po anspannen', U&'R\00FCcken gerade', U&'Gleichm\00E4\00DFig beide Seiten']),
  ('Fire Hydrant', 'Po', U&'K\00F6rpergewicht', '2-1-2', 3, 15, 45, 'va0260', ARRAY['Bein zur Seite heben', U&'H\00FCfte stabil', U&'Gleichm\00E4\00DFig beide Seiten']),
  ('Einbeinige Glute Bridge', 'Po', U&'K\00F6rpergewicht', '2-1-2', 3, 12, 45, 'va0124', ARRAY[U&'H\00FCfte anheben', 'Po anspannen oben', U&'Gleichm\00E4\00DFig beide Seiten']),
  ('Widerstandsband Abduktion sitzend', 'Po', 'Widerstandsband', '2-1-2', 3, 20, 45, 'va0242', ARRAY['Aufrechter Sitz', 'Knie aufhalten', 'Spannung halten']),
  (U&'H\00E4ngendes Knieheben', 'Core', 'Klimmzugstange', '2-1-2', 3, 12, 60, 'va0114', ARRAY['Kein Schwung', 'Bauch anspannen', 'Kontrolliert absenken']),
  ('Hollow Body Hold', 'Core', U&'K\00F6rpergewicht', 'Halten', 3, 30, 45, 'va0116', ARRAY['Lendenwirbel am Boden', 'Beine gestreckt', 'Spannung halten']),
  ('V-Up', 'Core', U&'K\00F6rpergewicht', '2-1-2', 3, 12, 45, 'va0128', ARRAY['Bauch anspannen', 'Arme gestreckt', 'Kontrolliert absenken']),
  ('L-Sit', 'Core', U&'K\00F6rpergewicht', 'Halten', 3, 20, 60, 'va1158', ARRAY['Beine gestreckt', 'Schultern unten', 'Spannung halten']),
  ('Dragon Flag', 'Core', U&'K\00F6rpergewicht', '3-1-1', 3, 6, 90, 'va1131', ARRAY[U&'K\00F6rper anspannen', 'Gerade Linie', U&'Langsam ausf\00FChren']),
  ('Reverse Crunch', 'Core', U&'K\00F6rpergewicht', '2-1-2', 3, 15, 45, 'va0112', ARRAY['Lendenwirbel am Boden', 'Bauch anspannen', 'Kontrolliert absenken']),
  ('Toe Touch Crunch', 'Core', U&'K\00F6rpergewicht', '2-1-2', 3, 15, 45, 'va0127', ARRAY['Beine gestreckt', 'Bauch anspannen', 'Kontrolliert absenken']),
  ('Plank Hip Dips', 'Core', U&'K\00F6rpergewicht', '2-1-2', 3, 20, 45, 'va0120', ARRAY['Ellenbogen unter Schultern', 'Seiten abwechseln', 'Rumpf stabil']),
  ('Scissor Kicks', 'Core', U&'K\00F6rpergewicht', 'Schnell', 3, 30, 45, 'va0123', ARRAY['Lendenwirbel am Boden', 'Beine gestreckt', 'Rhythmus halten']),
  ('Bird Dog', 'Core', U&'K\00F6rpergewicht', '2-2-2', 3, 12, 45, 'va1111', ARRAY[U&'R\00FCcken gerade', 'Rumpf stabil', 'Seiten abwechseln']),
  ('Kurzhantel Holzhacker', 'Core', 'Kurzhantel', '2-1-2', 3, 12, 45, 'va0108', ARRAY['Rumpf anspannen', 'Kontrolliert drehen', U&'Gleichm\00E4\00DFig beide Seiten']),
  (U&'Ruderger\00E4t', 'Cardio', 'Maschine', 'Zone 2', 1, 15, 60, 'va0077', ARRAY['Rhythmus finden', U&'R\00FCcken gerade', U&'Gleichm\00E4\00DFiges Tempo']),
  ('Assault Bike', 'Cardio', 'Maschine', 'Schnell', 1, 10, 60, 'va0053', ARRAY['Rhythmus finden', 'Atmung kontrollieren', U&'Gleichm\00E4\00DFiges Tempo']),
  ('Anfersen', 'Cardio', U&'K\00F6rpergewicht', 'Schnell', 3, 30, 30, 'va0212', ARRAY['Rhythmus halten', U&'Oberk\00F6rper aufrecht', 'Atmung kontrollieren']),
  (U&'Hockspr\00FCnge', 'Cardio', U&'K\00F6rpergewicht', 'Explosiv', 3, 10, 60, 'va0221', ARRAY['Explosiv springen', 'Weich landen', 'Rumpf anspannen']),
  ('Medizinball Slam', 'Cardio', 'Medizinball', 'Explosiv', 3, 12, 60, 'va0217', ARRAY[U&'Explosiv ausf\00FChren', 'Rumpf anspannen', U&'R\00FCcken gerade'])
) as v(name, muscle_group, equipment, tempo, default_sets, default_reps, default_rest_sec, exercise_id, cues)
where not exists (select 1 from exercises e where e.name = v.name);

commit;

-- Check: should print 70
select count(*) from exercises where exercise_id like 'va%';
