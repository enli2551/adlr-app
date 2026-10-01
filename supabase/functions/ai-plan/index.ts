// AI plan builder (trainer only): drafts a weekly training plan for one of the
// trainer's clients from their intake, recent training history and records, in the
// trainer's own style (their templates as examples), using ONLY exercises from the
// ADLR library. The draft is saved as a normal (unassigned) plan flagged
// ai_generated; the trainer reviews/edits it in the Plan Builder and assigns it.
//
// Deploy:  npx supabase functions deploy ai-plan   (or Dashboard → Edge Functions → "Via Editor")
// Secret (Dashboard → Edge Functions → Secrets): ANTHROPIC_API_KEY
// Optional secret: AI_PLAN_MONTHLY_LIMIT (default 60 drafts per trainer and month)
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Anthropic from 'npm:@anthropic-ai/sdk';

const MODEL = 'claude-opus-5-5';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const LANGUAGE: Record<string, string> = { de: 'German (Austrian, informal "du")', en: 'English (informal)', hu: 'Hungarian (informal "te")' };
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// Structured output: the API guarantees this shape.
const nullable = (type: string) => ({ anyOf: [{ type }, { type: 'null' }] });
const PLAN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['plan_name', 'rationale', 'days'],
  properties: {
    plan_name: { type: 'string', description: 'Short plan name, e.g. "Ganzkörper 3x – Muskelaufbau"' },
    rationale: { type: 'string', description: 'For the TRAINER: 3-5 sentences why the plan looks like this (split, volume, progression, injury considerations).' },
    days: {
      type: 'array',
      description: 'Exactly 7 entries, day_index 0 = Monday … 6 = Sunday.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['day_index', 'is_rest_day', 'workout_name', 'focus', 'duration_min', 'notes', 'exercises'],
        properties: {
          day_index: { type: 'integer' },
          is_rest_day: { type: 'boolean' },
          workout_name: nullable('string'),
          focus: nullable('string'),
          duration_min: nullable('integer'),
          notes: nullable('string'),
          exercises: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['name', 'sets', 'reps', 'rest_sec', 'weight_kg', 'tempo', 'notes', 'alternatives'],
              properties: {
                name: { type: 'string', description: 'EXACT name from the exercise library' },
                sets: { type: 'integer' },
                reps: { type: 'integer' },
                rest_sec: { type: 'integer' },
                weight_kg: nullable('number'),
                tempo: nullable('string'),
                notes: nullable('string'),
                alternatives: { type: 'array', items: { type: 'string' }, description: '0-2 EXACT library names, same muscle group' },
              },
            },
          },
        },
      },
    },
  },
};

const systemPrompt = (coach: string, library: string, styleExamples: string) => `You are the planning assistant of ${coach}, a premium personal trainer using the ADLR coaching app.
You draft ONE weekly training plan for one of ${coach}'s clients. ${coach} reviews and edits every draft before the client sees it, so be concrete and practical.

Principles:
- Fit the plan to the client's goal, experience, available days, session length, equipment and injuries. Never program exercises that load a listed injury in a risky way; prefer joint-friendly alternatives.
- Sensible weekly volume per muscle group for the experience level (beginners: fewer exercises, machines/basic movements, 2-3 working sets; advanced: more volume and specificity).
- Order: compound lifts first, isolation later. Rest seconds realistic for the rep range.
- weight_kg: only when the training history shows the exercise (use ~2.5-5% progression from recent top sets, rounded to 2.5 kg); otherwise null.
- Use ONLY exercise names that appear in the library below, copied exactly. Alternatives too.
- The number of training days must match the client's available days (or the trainer's instruction); all other days are rest days with an empty exercise list and null names.
- workout_name, focus and notes are read by the client: write them in the requested language, short and motivating. rationale is for the trainer.
- Trainer instructions override everything else.
${styleExamples ? `\nThis is how ${coach} usually structures plans — match this style (split, naming, volume, rep ranges):\n${styleExamples}\n` : ''}
EXERCISE LIBRARY (name | muscle group | equipment):
${library}`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
    if (!token) return json({ error: 'Missing authorization' }, 401);
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData?.user) return json({ error: 'Invalid session' }, 401);
    const { data: me } = await admin.from('profiles').select('id, role, first_name').eq('id', userData.user.id).maybeSingle();
    if (me?.role !== 'trainer') return json({ error: 'Trainer only' }, 403);

    const { client_id, instructions = '', days_per_week = null } = await req.json();
    if (!client_id) return json({ error: 'client_id required' }, 400);
    const { data: client } = await admin.from('profiles')
      .select('id, trainer_id, first_name, gender, age, height_cm, weight_kg, intake, lang').eq('id', client_id).maybeSingle();
    if (!client || client.trainer_id !== me.id) return json({ error: 'Not your client' }, 403);

    // Monthly quota (cost control).
    const limit = Number(Deno.env.get('AI_PLAN_MONTHLY_LIMIT') ?? 60);
    const monthStart = new Date(); monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0);
    const { count } = await admin.from('ai_usage').select('id', { count: 'exact', head: true })
      .eq('trainer_id', me.id).eq('kind', 'plan').gte('created_at', monthStart.toISOString());
    if ((count ?? 0) >= limit) return json({ error: 'quota', limit }, 429);

    // Library, history, records, style examples.
    const since = new Date(); since.setDate(since.getDate() - 70);
    const [lib, logs, prs, templates] = await Promise.all([
      admin.from('exercises').select('name, muscle_group, equipment').order('muscle_group').order('name'),
      admin.from('exercise_set_logs').select('exercise_name, weight_kg, reps, set_type, created_at')
        .eq('client_id', client_id).gte('created_at', since.toISOString()).order('created_at', { ascending: false }).limit(1500),
      admin.from('personal_records').select('exercise_name, weight_kg, reps').eq('client_id', client_id),
      admin.from('plans').select('id, name').eq('trainer_id', me.id).eq('is_template', true).order('created_at', { ascending: false }).limit(2),
    ]);
    const libraryRows = (lib.data ?? []) as { name: string; muscle_group: string; equipment: string }[];
    const library = libraryRows.map((e) => `${e.name} | ${e.muscle_group} | ${e.equipment}`).join('\n');
    const byLower = new Map(libraryRows.map((e) => [e.name.toLowerCase(), e.name]));

    // Recent top set per exercise (working sets only) + how often it was trained.
    const history = new Map<string, { top: string; sessions: Set<string> }>();
    for (const l of (logs.data ?? []) as { exercise_name: string; weight_kg: number | null; reps: number | null; set_type: string | null; created_at: string }[]) {
      if (l.set_type === 'warmup') continue;
      const h = history.get(l.exercise_name) ?? { top: '', sessions: new Set<string>() };
      h.sessions.add(l.created_at.slice(0, 10));
      if (!h.top && l.weight_kg) h.top = `${l.weight_kg} kg x ${l.reps ?? '?'} (${l.created_at.slice(0, 10)})`;
      history.set(l.exercise_name, h);
    }
    const historyText = [...history.entries()].slice(0, 40)
      .map(([n, h]) => `- ${n}: latest top set ${h.top || 'bodyweight/cardio'}, trained ${h.sessions.size}x in 10 weeks`).join('\n');
    const prText = ((prs.data ?? []) as { exercise_name: string; weight_kg: number; reps: number }[])
      .map((p) => `- ${p.exercise_name}: ${p.weight_kg} kg x ${p.reps}`).join('\n');

    let styleExamples = '';
    const tpl = (templates.data ?? []) as { id: string; name: string }[];
    if (tpl.length) {
      const { data: tdays } = await admin.from('plan_days').select('plan_id, day_of_week, workout_name, is_rest_day, exercises')
        .in('plan_id', tpl.map((p) => p.id)).order('day_of_week');
      styleExamples = tpl.map((p) => `Template "${p.name}":\n` + ((tdays ?? []) as { plan_id: string; day_of_week: number; workout_name: string | null; is_rest_day: boolean; exercises: { name: string; sets?: number; reps?: number; rest_sec?: number }[] }[])
        .filter((d) => d.plan_id === p.id && !d.is_rest_day)
        .map((d) => `  ${WEEKDAYS[d.day_of_week]} – ${d.workout_name ?? ''}: ${(d.exercises ?? []).map((e) => `${e.name} ${e.sets ?? '?'}x${e.reps ?? '?'}`).join(', ')}`).join('\n')).join('\n');
    }

    const intake = client.intake ?? {};
    const lang = (client.lang as string) || 'de';
    const clientText = [
      `First name: ${client.first_name ?? '-'}; gender: ${client.gender ?? '-'}; age: ${client.age ?? '-'}; height: ${client.height_cm ?? '-'} cm; weight: ${client.weight_kg ?? '-'} kg`,
      `Goals: ${(intake.goals ?? []).join(', ') || '-'}${intake.customGoal ? ` (own words: ${intake.customGoal})` : ''}`,
      `Experience: ${intake.experience ?? '-'}; trains at: ${intake.equipment ?? '-'}; job: ${intake.jobType ?? '-'}`,
      `Available days: ${(intake.trainingDays ?? []).map((d: number) => WEEKDAYS[d]).join(', ') || 'not specified'}${intake.trainingTime ? `; preferred time: ${intake.trainingTime}` : ''}`,
      `Injuries/complaints: ${(intake.injuries ?? []).join(', ') || 'none stated'}`,
      intake.whyNow ? `Motivation: ${intake.whyNow}` : '',
    ].filter(Boolean).join('\n');

    const userText = `Draft the plan. Client-facing texts in ${LANGUAGE[lang] ?? LANGUAGE.de}; rationale in ${LANGUAGE[lang] ?? LANGUAGE.de} too.
${days_per_week ? `Training days per week: ${days_per_week}.\n` : ''}${instructions.trim() ? `Trainer instructions (highest priority): ${instructions.trim()}\n` : ''}
CLIENT
${clientText}

TRAINING HISTORY (last 10 weeks)
${historyText || '- none yet'}

PERSONAL RECORDS
${prText || '- none yet'}`;

    const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') });
    // deno-lint-ignore no-explicit-any
    const response: any = await anthropic.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: PLAN_SCHEMA } },
      // Library + style are stable per trainer → cached across drafts.
      system: [{ type: 'text', text: systemPrompt(me.first_name?.trim() || 'the coach', library, styleExamples), cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: userText }],
    // deno-lint-ignore no-explicit-any
    } as any);

    await admin.from('ai_usage').insert({
      trainer_id: me.id, client_id, kind: 'plan', model: response.model ?? MODEL,
      input_tokens: (response.usage?.input_tokens ?? 0) + (response.usage?.cache_read_input_tokens ?? 0) + (response.usage?.cache_creation_input_tokens ?? 0),
      output_tokens: response.usage?.output_tokens ?? 0,
    });
    if (response.stop_reason === 'refusal') return json({ error: 'refused' }, 422);
    if (response.stop_reason === 'max_tokens') return json({ error: 'truncated' }, 502);
    const text = (response.content ?? []).filter((b: { type: string }) => b.type === 'text').map((b: { text: string }) => b.text).join('');
    const plan = JSON.parse(text);

    // Keep only library exercises (exact name, case-insensitive repair); report the rest.
    const unknown: string[] = [];
    const fix = (n: string) => byLower.get(String(n).trim().toLowerCase()) ?? null;
    const days = Array.from({ length: 7 }, (_, i) => {
      // deno-lint-ignore no-explicit-any
      const d = (plan.days ?? []).find((x: any) => x.day_index === i);
      // deno-lint-ignore no-explicit-any
      const exercises = (d?.exercises ?? []).flatMap((e: any) => {
        const name = fix(e.name);
        if (!name) { unknown.push(e.name); return []; }
        return [{
          name, sets: e.sets, reps: e.reps, rest_sec: e.rest_sec,
          ...(e.weight_kg ? { weight_kg: e.weight_kg } : {}),
          ...(e.tempo ? { tempo: e.tempo } : {}),
          ...(e.notes ? { notes: e.notes } : {}),
          alternatives: (e.alternatives ?? []).map(fix).filter(Boolean).slice(0, 2),
        }];
      });
      const rest = !d || d.is_rest_day || exercises.length === 0;
      return {
        day_of_week: i, is_rest_day: rest,
        workout_name: rest ? null : d.workout_name, focus: rest ? null : d.focus,
        duration_min: rest ? null : d.duration_min, notes: rest ? null : d.notes,
        exercises: rest ? [] : exercises,
      };
    });

    const { data: row, error: pErr } = await admin.from('plans').insert({
      trainer_id: me.id, name: plan.plan_name || `KI-Plan ${client.first_name ?? ''}`.trim(),
      ai_generated: true, ai_rationale: plan.rationale ?? null, ai_client_id: client_id,
    }).select('id, name').single();
    if (pErr || !row) return json({ error: pErr?.message ?? 'plan insert failed' }, 500);
    const { error: dErr } = await admin.from('plan_days').insert(days.map((d) => ({ ...d, plan_id: row.id })));
    if (dErr) return json({ error: dErr.message }, 500);

    return json({ plan_id: row.id, name: row.name, rationale: plan.rationale ?? null, unknown, used: (count ?? 0) + 1, limit });
  } catch (e) {
    const status = e instanceof Anthropic.APIError ? (e.status ?? 502) : 500;
    return json({ error: e instanceof Error ? e.message : String(e) }, status);
  }
});
