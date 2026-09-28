import { createClient } from '@supabase/supabase-js';

// The Supabase URL and anon key are PUBLIC client credentials (they ship in
// every installed app and are protected by RLS — the secret service_role key is
// never here). Env vars are used when present (local/Android builds); the
// hardcoded fallbacks make cloud iOS builds work even if env injection fails.
const url = (import.meta.env.VITE_SUPABASE_URL as string) || 'https://gzcewdhjlykwqhtjludv.supabase.co';
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string) || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd6Y2V3ZGhqbHlrd3FodGpsdWR2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUwMDY5MTMsImV4cCI6MjEwMDU4MjkxM30.DbZ8NuNaFuOLRFaNvOonckyduEnbbXPMQSv_Vq-JhWw';

export const supabase = createClient(url, anonKey, {
  global: {
    // Wrapped fetch that also captures the exact failing call (arguments +
    // error) into a global, so the AuthScreen DIAG line can show what
    // supabase-js passes that trips the iOS WKWebView.
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      try {
        return await fetch(input, init);
      } catch (e) {
        try {
          const h = init?.headers;
          (globalThis as Record<string, unknown>).__adlrFetchDiag =
            `in=${input instanceof Request ? 'Request' : typeof input} keys=${init ? Object.keys(init).join('|') : '-'} hdr=${h ? (h instanceof Headers ? 'Headers' : Array.isArray(h) ? 'array' : typeof h) : '-'} err=${e instanceof Error ? `${e.name}:${e.message}` : String(e)}`;
        } catch { /* ignore */ }
        throw e;
      }
    },
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
