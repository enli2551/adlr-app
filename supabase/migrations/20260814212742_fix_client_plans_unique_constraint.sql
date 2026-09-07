/*
# Fix client_plans assignment — add unique constraint for upsert

## Problem
The PlanBuilder's assignPlan function uses upsert with
onConflict: 'client_id,plan_id', but the client_plans table has no unique
constraint on those columns. Without a unique constraint, PostgreSQL cannot
detect conflicts, so the upsert silently inserts nothing (or inserts duplicates).
As a result, plans assigned by the trainer never appear in the client's app.

## Fix
1. Add a unique constraint on (client_id, plan_id) to client_plans so the
   upsert conflict target is valid.
2. Deactivate any existing active plans for the client when assigning a new one,
   so only one plan is active at a time (the client screen loads the single
   active plan).
*/

CREATE UNIQUE INDEX IF NOT EXISTS client_plans_client_plan_unique
  ON public.client_plans (client_id, plan_id);
