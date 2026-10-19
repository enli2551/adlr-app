// Build the web app and upload it to Cloudflare Pages (project "adlr-coach").
// Usage: npm run deploy:web   (needs `npx wrangler@4 login` once on this machine)
// The invite URL is set here only, so the native app build is unaffected.
import { execSync } from 'node:child_process';

const SITE = 'https://adlr-coach.pages.dev';
const run = (cmd, env = {}) => execSync(cmd, { stdio: 'inherit', env: { ...process.env, ...env } });

run('npx vite build', { VITE_INVITE_URL: `${SITE}/auth` });
const sha = execSync('git rev-parse HEAD').toString().trim();
const branch = execSync('git rev-parse --abbrev-ref HEAD').toString().trim();
run(`npx --yes wrangler@4 pages deploy dist --project-name adlr-coach --branch main --commit-hash ${sha} --commit-message "${branch} ${sha.slice(0, 7)}"`);
