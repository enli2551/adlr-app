-- Library cleanup after the full review (run AFTER 20261003_vital_new_exercises.sql).
-- - 50 duplicates are NOT deleted: they get alias_of = <kept exercise>. The app and the AI
--   plan builder hide them from pickers; existing plans, logs and records keep working unchanged.
-- - 6 category/equipment corrections.
-- Unicode escapes (U&'...') keep umlauts intact when pasted into the SQL editor. Safe to run twice.

begin;

alter table exercises add column if not exists alias_of text;

update exercises e set alias_of = v.keep
from (values
  ('Push-ups', U&'Liegest\00FCtze'),
  ('Rudern', 'Rudern (Langhantel)'),
  ('Kurzhantel Bizeps Curls', 'Bizeps Curls'),
  ('Kurzhantel Concentration Curl', 'Concentration Curls'),
  ('Elliptical Crosstrainer', 'Crosstrainer'),
  ('Kabel Latzug', 'Latzug'),
  ('Kabel Latzug (Stange)', 'Latzug'),
  ('Kabel Pushdown', U&'Trizepsdr\00FCcken'),
  ('Kurzhantel Seitheben', 'Seitheben'),
  ('Kurzhantel Frontheben', 'Frontheben'),
  ('Kurzhantel Frontheben (V2)', 'Frontheben'),
  ('Langhantel Upright Row', 'Upright Row'),
  ('Langhantel Upright Row (V3)', 'Upright Row'),
  ('Kurzhantel Step-ups', 'Step-ups'),
  (U&'H\00E4ngen Gestreckt Bein-H\00FCft Heben', 'Hanging Leg Raises'),
  ('Jump Squat (V2)', 'Jump Squats'),
  (U&'Langhantel Close-Grip Bankdr\00FCcken', U&'Close Grip Bankdr\00FCcken'),
  ('Langhantel Liegend Trizeps Extension', 'Skull Crusher'),
  ('Langhantel Front Kniebeuge', 'Frontkniebeugen'),
  ('Kurzhantel Ausfallschritte', 'Ausfallschritte'),
  ('Maschine Stehend Wadenheben', 'Wadenheben'),
  ('Einbein Wadenheben (Kurzhantel)', 'Kurzhantel Einbein Wadenheben'),
  (U&'Bizeps Klimmz\00FCge', 'Chin-ups'),
  ('Langhantel Glute Bridge (Bank, beide Beine)', 'Hip Thrusts'),
  ('Tiefer Glute Bridge am Boden', 'Glute Bridges'),
  (U&'H\00FCftheben (Knie gebeugt)', 'Glute Bridges'),
  (U&'Station\00E4res Fahrrad Laufen (V3)', U&'Station\00E4res Fahrrad'),
  ('Kabel Tief Sitz Rudern', 'Sitzrudern (Kabel)'),
  ('Kabel Boden Sitz Rudern (breit)', 'Kabel Sitz Rudern (breiter Griff)'),
  ('Kurzhantel Gerade-Bein Kreuzheben', 'Kurzhantel Steifbein Kreuzheben'),
  ('Kabel Stehender Fly', 'Cable Fly'),
  ('Kabel Crossover Variante', 'Cable Crossover'),
  ('Langhantel Preacher Curl', 'Preacher Curls'),
  ('Kabel Stehend Crossover Reverse Fly', 'Reverse Fly'),
  ('Kabel Rear Delt Rudern (Seil)', 'Kabel Stehend Rear Delt Rudern (Seil)'),
  ('Kabel Vorheben', 'Kabel Frontheben'),
  ('Kabel Gerade-Arm Latzug', 'Straight Arm Pulldown'),
  ('Langhantel Wrist Curl', 'Wrist Curls'),
  ('Langhantel Wrist Curl (V2)', 'Wrist Curls'),
  (U&'Kurzhantel \00DCber Bank Einarmig Wrist Curl', 'Kurzhantel Einarmig Wrist Curl'),
  ('Langhantel Bank Kniebeuge', 'Box Squat'),
  ('Langhantel Steifbein Good Morning', 'Good Mornings'),
  ('Kurzhantel Gerade-Arm Pullover', 'Kurzhantel Pullover'),
  ('Kurzhantel Step-up Ausfallschritt (V2)', 'Kurzhantel Step-up Ausfallschritt'),
  ('Langhantel Hintere Ausfallschritte (V2)', 'Langhantel Hintere Ausfallschritte'),
  ('Langhantel Kniebeuge-Sprung Ausfallschritt (V2)', 'Langhantel Kniebeuge-Sprung Ausfallschritt'),
  ('Langhantel Side Split Kniebeuge (V2)', 'Langhantel Side Split Kniebeuge'),
  (U&'Kurzhantel Liegend Einarmig Dr\00FCcken (V2)', U&'Kurzhantel Liegend Einarmig Dr\00FCcken'),
  ('Kurzhantel Sumo Pull Through (V2)', 'Kurzhantel Sumo Pull Through'),
  ('Kurzhantel Decline Schulterheben (V2)', 'Kurzhantel Decline Schulterheben')
) as v(name, keep)
where e.name = v.name;

update exercises set muscle_group = 'Schultern' where name = 'Kabel Einarmig Seitlich Vorgebeugt'; -- bent-over lateral raise = rear delts, was Brust
update exercises set muscle_group = U&'R\00FCcken' where name = 'Kabel Stehend Pulldown (Seil)'; -- straight-arm rope pulldown = lats, was Arme
update exercises set equipment = 'Maschine' where name = 'Hackenschmidt Kniebeuge'; -- hack squat is a machine, was Langhantel
update exercises set equipment = 'Maschine' where name = U&'Laufen (mit Ger\00E4t)'; -- treadmill, was K?rpergewicht
update exercises set equipment = 'Kurzhantel' where name = U&'Overhead Trizepsdr\00FCcken'; -- matches its animation; the barbell version exists separately
update exercises set equipment = 'Kurzhantel' where name = 'Russian Twists'; -- 'Hantel' was a one-off equipment value

commit;

-- Check: 50 hidden, rest active
select count(*) filter (where alias_of is not null) as hidden, count(*) filter (where alias_of is null) as active from exercises;
