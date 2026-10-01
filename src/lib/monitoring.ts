import * as Sentry from '@sentry/react';

// Error tracking via the Sentry SDK, sent to Better Stack (Sentry-compatible ingest).
// The DSN is public by design (it can only submit events). Privacy: no default PII
// (no IP, no cookies/headers), no names/e-mails — only the random user id, the screen
// path and device/app info. Training/health data never goes into events.
const DSN = 'https://NG5frDGusFzgaDA5BURNPnjF@s2780884.us-west-2a.betterstackdata.com/2780884';

// Expected while offline / flaky network — the app handles these (offline outbox).
const IGNORE = [/Network request failed/i, /Network request timed out/i, /Failed to fetch/i, /Load failed/i, /ResizeObserver loop/i];

let enabled = false;

export function initMonitoring(): void {
  // Production builds only; `localStorage.adlr_monitoring = '1'` turns it on in dev for testing.
  let force = false;
  try { force = localStorage.getItem('adlr_monitoring') === '1'; } catch { /* ignore */ }
  if (!import.meta.env.PROD && !force) return;
  enabled = true;
  Sentry.init({
    dsn: DSN,
    release: `adlr@${__APP_VERSION__}`,
    environment: import.meta.env.PROD ? 'production' : 'development',
    sendDefaultPii: false,
    // Errors only — no performance tracing, no session replay (privacy + free tier).
    tracesSampleRate: 0,
    ignoreErrors: IGNORE,
    beforeSend(event) {
      if (event.request) {
        delete event.request.cookies;
        delete event.request.headers;
        // Keep the path (which screen), drop query strings (may hold invite codes etc.).
        if (event.request.url) event.request.url = event.request.url.split('?')[0];
      }
      if (event.user) event.user = { id: event.user.id };
      return event;
    },
    beforeBreadcrumb(crumb) {
      // Supabase request URLs carry filters (ids, dates) and the apikey param — keep only method+status.
      if (crumb.category === 'xhr' || crumb.category === 'fetch') {
        const url = String(crumb.data?.url ?? '');
        return { ...crumb, data: { method: crumb.data?.method, status_code: crumb.data?.status_code, url: url.split('?')[0] } };
      }
      // Console logs may contain user content.
      if (crumb.category === 'console') return null;
      return crumb;
    },
  });
}

/** Attach the (random, non-identifying) account id + role so errors can be grouped per user. */
export function setMonitoringUser(id: string | null, role?: string | null): void {
  if (!enabled) return;
  Sentry.setUser(id ? { id } : null);
  Sentry.setTag('role', role ?? 'unknown');
}

export function captureError(err: unknown, context?: Record<string, unknown>): void {
  if (!enabled) return;
  Sentry.captureException(err, context ? { extra: context } : undefined);
}

export const ErrorBoundary = Sentry.ErrorBoundary;
