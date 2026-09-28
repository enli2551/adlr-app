import { createClient } from '@supabase/supabase-js';

// The Supabase URL and anon key are PUBLIC client credentials (they ship in
// every installed app and are protected by RLS — the secret service_role key is
// never here). Env vars are used when present (local/Android builds); the
// hardcoded fallbacks make cloud iOS builds work even if env injection fails.
const url = (import.meta.env.VITE_SUPABASE_URL as string) || 'https://gzcewdhjlykwqhtjludv.supabase.co';
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string) || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd6Y2V3ZGhqbHlrd3FodGpsdWR2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUwMDY5MTMsImV4cCI6MjEwMDU4MjkxM30.DbZ8NuNaFuOLRFaNvOonckyduEnbbXPMQSv_Vq-JhWw';

export const supabase = createClient(url, anonKey, {
  global: {
    // WKWebView (WebKit) throws "TypeError: Type error" when fetch is called
    // detached from window — which is how supabase-js stores its fetch ref.
    // Wrapping it guarantees fetch runs in the right context. This is why
    // login failed only on iOS (a raw fetch worked, supabase-js's did not).
    fetch: (...args: Parameters<typeof fetch>) => fetch(...args),
  },
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // Native app: there's no OAuth redirect URL to parse from capacitor://.
    detectSessionInUrl: false,
    // Bypass the Web Locks API (navigator.locks), which misbehaves in the iOS
    // WKWebView and can make auth calls fail. Run the operation without locking.
    lock: (_name: string, _acquireTimeout: number, fn: () => Promise<unknown>) => fn(),
  },
});
