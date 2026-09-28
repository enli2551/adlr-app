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
      // WKWebView's fetch throws "TypeError: Type error" if any header value is
      // not a valid string (undefined/null/non-string). supabase-js adds several
      // headers, one of which trips this on iOS. Coerce values to strings and
      // drop empty ones before calling fetch.
      let safeInit = init;
      const h = init?.headers;
      if (h && !(h instanceof Headers) && !Array.isArray(h)) {
        const clean: Record<string, string> = {};
        for (const [k, v] of Object.entries(h as Record<string, unknown>)) {
          if (v !== undefined && v !== null) clean[k] = String(v);
        }
        safeInit = { ...init, headers: clean };
      }
      try {
        return await fetch(input, safeInit);
      } catch (e) {
        try {
          (globalThis as Record<string, unknown>).__adlrFetchDiag =
            `hdrs=${JSON.stringify(init?.headers)} err=${e instanceof Error ? `${e.name}:${e.message}` : String(e)}`;
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
