// Writes a short, motivating progress summary in the TRAINER's voice (their own
// first name) from the client's computed progress stats, and stores it as a DRAFT in
// progress_reports. The trainer reviews/edits and approves it in the app; only then
// does the client see it.
//
// Trainer-only (checked via profiles.role). Deploy:
//   npx supabase functions deploy coach-report
// Secret (Dashboard → Edge Functions → Secrets): ANTHROPIC_API_KEY
// Optional secrets: AI_REPORT_MONTHLY_LIMIT (default 200 per trainer), AI_GLOBAL_MONTHLY_LIMIT
// (default 1000 AI calls per month for all trainers together — cost ceiling).
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Anthropic from 'npm:@anthropic-ai/sdk';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const LANGUAGE: Record<string, string> = { de: 'German (Austrian, informal "du")', en: 'English (informal)', hu: 'Hungarian (informal "te")' };

const systemPrompt = (coach: string) => `You are ${coach}, a premium personal trainer who coaches clients through the ADLR app ("Steig auf. Bleib stark." — rise up, stay strong).
You write a short personal progress summary to one of your clients, based ONLY on the stats you are given.

Voice: warm, direct, confident, like a coach who knows the client well. Motivating without hype. Speak to the client directly.
Content:
- Lead with the client's main goal (the "focus") and the most meaningful concrete win, using real numbers from the stats.
- Mention one or two further highlights (consistency, strength, health habits, measurements) if the data supports it.
- If something stalled or went backwards, frame it honestly but constructively (plateaus are normal) and give ONE concrete, simple focus for the next weeks.
- Never invent numbers, exercises, events or medical claims. Skip anything the stats don't contain.
Format: plain text, 4–6 sentences, no headings, no bullet points, no emojis except at most one at the very end. Sign off with "– ${coach}".`;

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

    const body = await req.json();
    const { client_id, stats } = body;
    const lang = typeof body.lang === 'string' ? body.lang : 'de';
    const first_name = String(body.first_name ?? '').slice(0, 60);
    if (!client_id || !stats) return json({ error: 'client_id and stats required' }, 400);
    // The stats go into the prompt as JSON: a real report is a few KB — refuse anything huge.
    if (JSON.stringify(stats).length > 30_000) return json({ error: 'stats too large' }, 413);
    // Only for the trainer's OWN clients (service role bypasses RLS, so check explicitly).
    const { data: target } = await admin.from('profiles').select('trainer_id').eq('id', client_id).maybeSingle();
    if (target?.trainer_id !== me.id) return json({ error: 'Not your client' }, 403);
    const language = LANGUAGE[lang] ?? LANGUAGE.de;

    // Monthly quotas (cost control): per coach, and for all coaches together.
    const monthStart = new Date(); monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0);
    const limit = Number(Deno.env.get('AI_REPORT_MONTHLY_LIMIT') ?? 200);
    const { count: mine } = await admin.from('ai_usage').select('id', { count: 'exact', head: true })
      .eq('trainer_id', me.id).eq('kind', 'report').gte('created_at', monthStart.toISOString());
    if ((mine ?? 0) >= limit) return json({ error: 'quota', limit }, 429);
    const globalLimit = Number(Deno.env.get('AI_GLOBAL_MONTHLY_LIMIT') ?? 1000);
    const { count: all } = await admin.from('ai_usage').select('id', { count: 'exact', head: true }).gte('created_at', monthStart.toISOString());
    if ((all ?? 0) >= globalLimit) return json({ error: 'quota', limit: globalLimit }, 429);

    const client = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') });
    // Server-side fallback: if a safety classifier declines, the API re-runs the
    // request on Anthropic's recommended fallback model inside the same call.
    // deno-lint-ignore no-explicit-any
    const response: any = await client.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 4000, // a 4–6 sentence text; caps the worst-case cost of one call
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium' },
      system: systemPrompt(me.first_name?.trim() || 'your coach'),
      messages: [{
        role: 'user',
        content: `Write the summary in ${language}. Client first name: ${first_name || '(unknown)'}.\n\nProgress stats (JSON):\n${JSON.stringify(stats)}`,
      }],
    // deno-lint-ignore no-explicit-any
    } as any);

    await admin.from('ai_usage').insert({
      trainer_id: me.id, client_id, kind: 'report', model: response.model ?? 'claude-opus-5-5',
      input_tokens: response.usage?.input_tokens ?? 0, output_tokens: response.usage?.output_tokens ?? 0,
    });
    if (response.stop_reason === 'refusal') return json({ error: 'refused' }, 422);
    const draft = (response.content ?? [])
      .filter((b: { type: string }) => b.type === 'text')
      .map((b: { text: string }) => b.text)
      .join('\n')
      .trim();
    if (!draft) return json({ error: 'empty draft' }, 502);

    const { data: row, error: insErr } = await admin.from('progress_reports')
      .insert({ client_id, trainer_id: me.id, lang, stats, draft, status: 'draft' })
      .select('id, draft')
      .single();
    if (insErr) return json({ error: insErr.message }, 500);

    return json(row);
  } catch (e) {
    const status = e instanceof Anthropic.APIError ? (e.status ?? 502) : 500;
    return json({ error: e instanceof Error ? e.message : String(e) }, status);
  }
});
