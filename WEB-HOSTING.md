# ADLR Coach on the web (trainer desktop)

The trainer side works in a desktop browser (≥1024px: sidebar + side-by-side panes).
Phones keep the app layout. Clients stay on the mobile app; the client UI is not
designed for desktop.

**Nothing is deployed yet.** Pick a host and domain first (see "Open decisions").

## Build

```
npm ci
npm run build        # → dist/
```

Environment variables (set them in the host's dashboard, same values as `.env`):

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- optional: `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_URL` for source-map upload (error tracking itself is built in and runs in production builds)
- after the URL exists: `VITE_INVITE_URL=https://<domain>/auth` (branch `feat/coach-onboarding`, `src/lib/invite.ts`) to turn on invite links

## SPA fallback (deep links like /trainer/plan-builder)

Already in the repo, one per host type:

| Host | File | Notes |
| --- | --- | --- |
| Cloudflare Pages / Netlify | `public/_redirects` (`/* /index.html 200`) | copied into `dist/` by Vite |
| Vercel | `vercel.json` | rewrite to `/index.html`, long cache for `/assets/*` |

`public/_redirects` also ends up in the native app bundle after `cap sync`; it is a
2-line text file and is ignored there.

## Supabase Auth settings (Dashboard → Authentication → URL Configuration)

- **Site URL**: leave as is if the app relies on it today; otherwise `https://<domain>`.
  Sign-up confirmation e-mails (if "Confirm email" is on) link to the Site URL.
- **Redirect URLs**: add `https://<domain>/**` (and the host's preview URL pattern if
  preview deployments should be able to log in, e.g. `https://*-<project>.vercel.app/**`).
- Password reset uses the 6-digit code (`{{ .Token }}`), not a link, so it works on the
  web without extra setup.
- `src/lib/supabase.ts` has `detectSessionInUrl: false` (native app). E-mail links that
  carry a session in the URL (magic link, confirm-and-login) will not log the user in on
  the web; they land on `/auth` and the trainer logs in with the password. Change this
  only if magic links are wanted on the web.

## Open decisions

1. Host: Cloudflare Pages, Vercel or Netlify (all work with the files above).
2. Domain: e.g. `app.<your-domain>` or `coach.<your-domain>`.
3. Whether clients may also use the web build (today: trainer side only).
