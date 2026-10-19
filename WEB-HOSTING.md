# ADLR Coach on the web (trainer desktop)

The trainer side works in a desktop browser (≥1024px: sidebar + side-by-side panes).
Phones keep the app layout. Clients stay on the mobile app; the client UI is not
designed for desktop.

**Host: Cloudflare Pages.** Nothing is deployed yet; the domain is still open.

## Prerequisite

`main` must be pushed to GitHub (`enli2551/adlr-app`), because Pages builds from the repo.

## Cloudflare Pages setup (one time)

1. Cloudflare dashboard → Workers & Pages → Create → Pages → Connect to Git →
   pick `enli2551/adlr-app`, production branch `main`.
2. Build settings:
   - Framework preset: Vite (or None)
   - Build command: `npm run build`
   - Build output directory: `dist`
3. Environment variables (Production, and Preview if previews should work):
   - `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (same values as `.env`)
   - `NODE_VERSION` = `22`
   - optional: `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_URL` for
     source-map upload (error tracking itself is built in)
4. Save and deploy. The first URL is `https://<project>.pages.dev`; test login there.
5. Custom domain: Pages project → Custom domains → add e.g. `app.<your-domain>`
   (easiest when the domain's DNS is already on Cloudflare).

Every push to `main` then redeploys automatically; other branches get preview URLs.

## SPA routing and caching

- Deep links like `/trainer/plan-builder` work without config: Pages serves
  `index.html` for unknown paths as long as the build has no top-level `404.html`.
  Do not add a `/* /index.html 200` rule to `_redirects`. Pages treats it as an
  infinite loop and ignores it.
- `public/_headers` gives the hashed files in `/assets/*` a one-year immutable cache.
- `vercel.json` is only a fallback in case the host changes later.
- `public/_headers` also ends up in the native app bundle after `cap sync`, where it is
  ignored.
- Limits are fine: ~420 files, the largest ~450 KB (Pages allows 20,000 files of up to
  25 MiB each).

## Supabase Auth settings (Dashboard → Authentication → URL Configuration)

- **Site URL**: leave as is if the app relies on it today; otherwise `https://<domain>`.
  Sign-up confirmation e-mails (if "Confirm email" is on) link to the Site URL.
- **Redirect URLs**: add `https://<domain>/**` and `https://*.<project>.pages.dev/**`
  (previews).
- Password reset uses the 6-digit code (`{{ .Token }}`), not a link, so it works on the
  web without extra setup.
- `src/lib/supabase.ts` has `detectSessionInUrl: false` (native app). E-mail links that
  carry a session in the URL (magic link, confirm-and-login) will not log the user in on
  the web. They land on `/auth` and the trainer logs in with the password. Change this
  only if magic links are wanted on the web.

## After the domain exists

- Set `VITE_INVITE_URL=https://<domain>/auth` in the Pages environment variables
  (`src/lib/invite.ts`) to turn on invite links, then redeploy.

## Open decisions

1. Domain: e.g. `app.<your-domain>` or `coach.<your-domain>`.
2. Whether clients may also use the web build (today: trainer side only).
