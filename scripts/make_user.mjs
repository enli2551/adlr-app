import { createClient } from '@supabase/supabase-js';
const url = 'https://gzcewdhjlykwqhtjludv.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd6Y2V3ZGhqbHlrd3FodGpsdWR2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUwMDY5MTMsImV4cCI6MjEwMDU4MjkxM30.DbZ8NuNaFuOLRFaNvOonckyduEnbbXPMQSv_Vq-JhWw';
const supabase = createClient(url, key);
// Usage: ADLR_EMAIL=... ADLR_PASSWORD=... node scripts/make_user.mjs  (never commit a password)
const email = process.env.ADLR_EMAIL;
const password = process.env.ADLR_PASSWORD;
if (!email || !password) { console.error('Set ADLR_EMAIL and ADLR_PASSWORD'); process.exit(1); }
const { data, error } = await supabase.auth.signUp({ email, password });
console.log('signup:', error ? error.message : 'ok', data?.user?.id ?? '');
if (data?.user?.id) {
  const { error: pErr } = await supabase.from('profiles').upsert({
    id: data.user.id, email, role: 'trainer', first_name: 'Peter'
  }, { onConflict: 'id' });
  console.log('profile:', pErr ? pErr.message : 'ok');
}
