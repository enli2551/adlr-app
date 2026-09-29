import { createClient } from '@supabase/supabase-js';

// The Supabase URL and anon key are PUBLIC client credentials (they ship in
// every installed app and are protected by RLS — the secret service_role key is
// never here). Env vars are used when present (local/Android builds); the
// hardcoded fallbacks make cloud iOS builds work even if env injection fails.
const url = (import.meta.env.VITE_SUPABASE_URL as string) || 'https://gzcewdhjlykwqhtjludv.supabase.co';
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string) || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd6Y2V3ZGhqbHlrd3FodGpsdWR2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUwMDY5MTMsImV4cCI6MjEwMDU4MjkxM30.DbZ8NuNaFuOLRFaNvOonckyduEnbbXPMQSv_Vq-JhWw';

// The iOS WKWebView's native fetch throws "TypeError: Type error" on supabase-js's
// requests — even though a byte-identical raw fetch (same method/url/headers/body)
// succeeds. It's an unexplained WKWebView quirk specific to how supabase-js calls
// fetch. Route every supabase-js request through XMLHttpRequest instead: a separate,
// reliable code path in WebKit. We return a real Response so supabase-js parses it
// exactly as it would a fetch Response.
function xhrFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return new Promise((resolve, reject) => {
    const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.href : String(input);
    const method = (init?.method ?? 'GET').toUpperCase();
    const xhr = new XMLHttpRequest();
    xhr.open(method, urlStr, true);

    const h = init?.headers;
    if (h) {
      const entries: [string, string][] = h instanceof Headers
        ? Array.from(h.entries())
        : Array.isArray(h)
          ? (h as [string, string][])
          : Object.entries(h as Record<string, string>);
      for (const [k, v] of entries) {
        if (v == null) continue;
        try { xhr.setRequestHeader(k, String(v)); } catch { /* forbidden header — skip */ }
      }
    }

    xhr.onload = () => {
      const respHeaders = new Headers();
      xhr.getAllResponseHeaders().trim().split(/[\r\n]+/).forEach((line) => {
        const i = line.indexOf(':');
        if (i > 0) {
          try { respHeaders.set(line.slice(0, i).trim(), line.slice(i + 1).trim()); } catch { /* ignore */ }
        }
      });
      // Response requires a status in 200–599; guard against XHR's 0.
      const status = xhr.status >= 200 && xhr.status <= 599 ? xhr.status : 500;
      resolve(new Response(xhr.responseText, { status, statusText: xhr.statusText, headers: respHeaders }));
    };
    xhr.onerror = () => reject(new TypeError('Network request failed'));
    xhr.ontimeout = () => reject(new TypeError('Network request timed out'));

    xhr.send((init?.body as XMLHttpRequestBodyInit | null | undefined) ?? null);
  });
}

export const supabase = createClient(url, anonKey, {
  global: { fetch: xhrFetch },
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // Native app: there's no OAuth redirect URL to parse from capacitor://.
    detectSessionInUrl: false,
    // Bypass the Web Locks API (navigator.locks), which misbehaves in the iOS WKWebView.
    lock: (_name: string, _acquireTimeout: number, fn: () => Promise<unknown>) => fn(),
  },
});
