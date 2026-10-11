-- Why does a coach have so many plans? — diagnosis + safe cleanup.
-- Plans are created by: "Neuer Plan" (empty 7-day plan), every "KI-Plan" generation
-- (saved immediately, also when it's not used), "Kopie", "Als Vorlage speichern",
-- "+ Plan" from a template, and automatically when a client edits a SHARED plan
-- (starter plan / template / plan of several clients → personal copy "Name · Client").
--
-- Run in Supabase → SQL Editor. STEP 1 and 2 only READ. STEP 3 deletes — run it only
-- after you looked at the list of STEP 2. Nothing a client uses or ever trained with is
-- touched: active plans, templates, the starter plan and every plan with a logged
-- workout stay (deleting those would erase workout names in the history).

-- ── STEP 1 — overview per coach: how many plans of which kind ──────────────────
with p as (
  select pl.*, concat_ws(' ', t.first_name, t.last_name) as coach,
         exists (select 1 from client_plans cp where cp.plan_id = pl.id and cp.is_active) as active,
         exists (select 1 from workout_completions wc join plan_days d on d.id = wc.plan_day_id where d.plan_id = pl.id) as trained,
         not exists (select 1 from plan_days d where d.plan_id = pl.id and jsonb_array_length(coalesce(d.exercises, '[]'::jsonb)) > 0) as empty
  from plans pl join profiles t on t.id = pl.trainer_id
)
select coach,
       count(*) as plans,
       count(*) filter (where active) as assigned_now,
       count(*) filter (where coalesce((to_jsonb(p)->>'is_template')::boolean, false)) as templates,
       count(*) filter (where coalesce((to_jsonb(p)->>'ai_generated')::boolean, false)) as ai_plans,
       count(*) filter (where name like '% · %') as client_copies,
       count(*) filter (where empty) as empty_plans,
       count(*) filter (where not active and not trained) as never_used
from p group by coach order by plans desc;

-- ── STEP 2 — the plans STEP 3 would delete (read only) ─────────────────────────
-- Kept: active, template, starter, trained. Listed: empty plans + unused leftovers
-- (old KI drafts, copies, plans nobody has or ever had a workout with).
with p as (
  select pl.id, pl.name, pl.created_at, concat_ws(' ', t.first_name, t.last_name) as coach,
         coalesce((to_jsonb(pl)->>'ai_generated')::boolean, false) as ai,
         not exists (select 1 from plan_days d where d.plan_id = pl.id and jsonb_array_length(coalesce(d.exercises, '[]'::jsonb)) > 0) as empty
  from plans pl join profiles t on t.id = pl.trainer_id
  where not coalesce((to_jsonb(pl)->>'is_template')::boolean, false)
    and not coalesce((to_jsonb(pl)->>'is_starter')::boolean, false)
    and not exists (select 1 from client_plans cp where cp.plan_id = pl.id and cp.is_active)
    and not exists (select 1 from workout_completions wc join plan_days d on d.id = wc.plan_day_id where d.plan_id = pl.id)
)
select coach, name, created_at::date as created, case when empty then 'leer' when ai then 'KI-Entwurf, nie benutzt' else 'nie benutzt' end as why
from p order by coach, name, created_at;

-- ── STEP 3 — delete the EMPTY ones (only after checking STEP 2) ─────────────────
-- Only plans without a single exercise ("leer" in STEP 2) — e.g. the empty plans named
-- after the login e-mail (autofill in the plan-name field). Unused plans WITH exercises
-- (a plan being prepared, an old draft) stay; delete those in the Plan Builder.
-- One statement on purpose: the SQL Editor commits statement by statement, so a temp
-- table didn't survive. plan_days and client_plans rows go with the plan (ON DELETE CASCADE).
-- Returns the deleted plans.
delete from plans pl
where not coalesce((to_jsonb(pl)->>'is_template')::boolean, false)
  and not coalesce((to_jsonb(pl)->>'is_starter')::boolean, false)
  and not exists (select 1 from client_plans cp where cp.plan_id = pl.id and cp.is_active)
  and not exists (select 1 from workout_completions wc join plan_days d on d.id = wc.plan_day_id where d.plan_id = pl.id)
  and not exists (select 1 from plan_days d where d.plan_id = pl.id and jsonb_array_length(coalesce(d.exercises, '[]'::jsonb)) > 0)
returning pl.name, pl.created_at::date as created;
