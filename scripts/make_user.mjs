import { createClient } from '@supabase/supabase-js';
const url = 'https://gzcewdhjlykwqhtjludv.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd6Y2V3ZGhqbHlrd3FodGpsdWR2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUwMDY5MTMsImV4cCI6MjEwMDU4MjkxM30.DbZ8NuNaFuOLRFaNvOonckyduEnbbXPMQSv_Vq-JhWw';
const supabase = createClient(url, key);
const email = 'peter@adlr.at';
const password = 'SteigAuf2026!';
const { data, error } = await supabase.auth.signUp({ email, password });
console.log('signup:', error ? error.message : 'ok', data?.user?.id ?? '');
if (data?.user?.id) {
  const { error: pErr } = await supabase.from('profiles').upsert({
    id: data.user.id, email, role: 'trainer', first_name: 'Peter'
  }, { onConflict: 'id' });
  console.log('profile:', pErr ? pErr.message : 'ok');
}
