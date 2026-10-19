# ADLR Coach on the web (trainer desktop)

The trainer side works in a desktop browser (≥1024px: sidebar + side-by-side panes).
Phones keep the app layout. Clients stay on the mobile app; the client UI is not
designed for desktop.

**Live:** https://adlr-coach.pages.dev (Cloudflare Pages project `adlr-coach`, classic
Pages, direct upload; first deploy 2026-10-19). No custom domain yet.

## Deploy

```
npm run deploy:web
```

`scripts/deploy-web.mjs` builds with `VITE_INVITE_URL=https://adlr-coach.pages.dev/auth`
and uploads `dist/` with wrangler. It uses the local `.env` for the Supabase values,
so nothing is stored in Cloudflare. The invite URL is only set for the web build, and
the native app build is unchanged.

The first time on a machine, run `npx wrangler@4 login`. If the browser opens a
profile that is not logged in to Cloudflare, copy the printed URL into the right one.

Notes:
- The project was created with `wrangler pages project create --force`. Current wrangler
  versions otherwise redirect "Pages" to Workers, which gives a `workers.dev` address.
  Deploys to the existing project do not need `--force`.
- This is a direct-upload project, so it does not deploy on git push. Cloudflare cannot
  switch a direct-upload project to Git integration later. Automatic deploys from GitHub
  would need a new Pages project created from the dashboard with "Connect to Git"
  (build command `npm run build`, output `dist`, env `VITE_SUPABASE_URL`,
  `VITE_SUPABASE_ANON_KEY`, `VITE_INVITE_URL`, `NODE_VERSION=22`).

## SPA routing and caching

- Deep links like `/trainer/plan-builder` work without config: Pages serves
  `index.html` for unknown paths as long as the build has no top-level `404.html`.
  Do not add a `/* /index.html 200` rule to `_redirects`. Pages treats it as an
  infinite loop and ignores it.
- `public/_headers` gives the hashed files in `/assets/*` a one-year immutable cache.
  It also ends up in the native app bundle after `cap sync`, where it is ignored.
- `vercel.json` is only a fallback in case the host changes later.

## Supabase Auth settings (Dashboard → Authentication → URL Configuration)

- **Redirect URLs**: add `https://adlr-coach.pages.dev/**` (and later the custom domain).
- **Site URL**: leave as is if the app relies on it today. Sign-up confirmation e-mails
  (if "Confirm email" is on) link to the Site URL.
- Password reset uses the 6-digit code (`{{ .Token }}`), not a link, so it works on the
  web without extra setup.
- `src/lib/supabase.ts` has `detectSessionInUrl: false` (native app). E-mail links that
  carry a session in the URL (magic link, confirm-and-login) will not log the user in on
  the web. They land on `/auth` and the trainer logs in with the password.

## Custom domain later

Pages project → Custom domains → add e.g. `app.<your-domain>`. Then update `SITE` in
`scripts/deploy-web.mjs` and the Supabase redirect URLs, and redeploy. The
`pages.dev` address keeps working, so invite links that were already sent stay valid.
