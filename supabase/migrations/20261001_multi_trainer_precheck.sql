/*
# Pre-check for 20261001_multi_trainer.sql — READ-ONLY (changes nothing)

After the multi-trainer migration a trainer sees exactly the clients whose
profiles.trainer_id points to them. Run these queries first; all three result
lists should be empty (or look exactly as you expect). If not, fix the links
BEFORE running the migration.
*/

-- 1) Trainers in the system (normally just Peter)
SELECT id, first_name, last_name, email, created_at
FROM profiles WHERE role = 'trainer' ORDER BY created_at;

-- 2) Clients WITHOUT a trainer → would disappear from Peter's client list
--    (their data stays untouched; they just aren't linked to anyone)
SELECT id, first_name, last_name, email, intake_completed, created_at
FROM profiles WHERE role = 'client' AND trainer_id IS NULL
ORDER BY created_at;

-- 3) Active plan assignments where the plan belongs to a DIFFERENT trainer than the
--    client's trainer (the client would still see the plan, but the trainer couldn't
--    edit/reassign it). Starter plan rows are fine and excluded.
SELECT c.first_name, c.last_name, p.name AS plan, p.trainer_id AS plan_owner, c.trainer_id AS client_trainer
FROM client_plans cp
JOIN plans p ON p.id = cp.plan_id
JOIN profiles c ON c.id = cp.client_id
WHERE cp.is_active AND p.trainer_id IS DISTINCT FROM c.trainer_id AND NOT COALESCE(p.is_starter, false);

-- 4) For comparison after the migration: Peter's clients and their active plans
SELECT c.first_name, c.last_name, p.name AS active_plan
FROM profiles c
LEFT JOIN client_plans cp ON cp.client_id = c.id AND cp.is_active
LEFT JOIN plans p ON p.id = cp.plan_id
WHERE c.role = 'client' AND c.trainer_id IS NOT NULL
ORDER BY c.first_name;
