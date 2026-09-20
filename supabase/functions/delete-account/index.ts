// Deletes the authenticated user's account and data (Apple App Store 5.1.1(v)
// and Google Play both require in-app account deletion).
//
// Deploy:  npx supabase functions deploy delete-account
// The function receives SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY automatically.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Tables that reference the user via client_id (best-effort cleanup).
const CLIENT_TABLES = [
  'exercise_set_logs',
  'workout_completions',
  'personal_records',
  'progress_entries',
  'progress_photos',
  'daily_checkins',
  'messages',
  'sessions',
  'session_notes',
  'weekly_messages',
  'nutrition_tips',
  'hydration_logs',
  'nutrition_principle_checkins',
  'client_plans',
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const token = authHeader.replace('Bearer ', '');

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Identify the caller from their JWT.
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Invalid session' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const uid = userData.user.id;

    // Remove the user's progress photos from storage (folder = <uid>/...).
    try {
      const { data: files } = await admin.storage.from('photos').list(uid);
      if (files && files.length) {
        await admin.storage.from('photos').remove(files.map((f) => `${uid}/${f.name}`));
      }
    } catch (_) { /* ignore storage errors */ }

    // Delete the user's data rows (service role bypasses RLS).
    for (const table of CLIENT_TABLES) {
      await admin.from(table).delete().eq('client_id', uid);
    }
    await admin.from('profiles').delete().eq('id', uid);

    // Finally remove the auth account itself.
    const { error: delErr } = await admin.auth.admin.deleteUser(uid);
    if (delErr) {
      return new Response(JSON.stringify({ error: delErr.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
