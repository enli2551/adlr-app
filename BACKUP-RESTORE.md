# Backup & Restore (Supabase project `gzcewdhjlykwqhtjludv`)

Coaches store their clients' training, health data and photos in ADLR. Losing it is not
an option, so there are two independent layers:

| Layer | What | Where | Kept |
|---|---|---|---|
| 1. Supabase backups | whole database (not Storage files) | Supabase | Pro: 7 daily backups; with PITR any second of the last 7+ days |
| 2. Own weekly backup | DB dump (roles, schema, data) + all Storage files, AES-256 encrypted | GitHub Actions artifact (`.github/workflows/backup.yml`) | 90 days |

## One-time setup

1. **Supabase plan:** Dashboard → Organization → Billing → **Pro**. The free plan has no
   downloadable backups. Optional but recommended once coaches pay: Database → Backups →
   **Point in Time Recovery** add-on.
2. **GitHub secrets** (repo → Settings → Secrets and variables → Actions):
   `SUPABASE_DB_URL` (Dashboard → Connect → *Session pooler* URI incl. password),
   `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `BACKUP_PASSPHRASE` (long random string).
   **Save the passphrase in your password manager** — without it no backup can be decrypted.
3. Push the workflow, then GitHub → Actions → *backup* → **Run workflow** once and check
   that it is green and an artifact `adlr-backup-YYYY-MM-DD` exists.

## Restore

### A) Small mistake, project still alive (deleted plan, wrong update)
1. Plans: the Plan Builder trash (`trainer_restore_plan`) restores deleted plans.
2. Otherwise with PITR: Database → Backups → Point in time → pick the minute *before* the
   mistake. **This rewinds the WHOLE database** (all coaches) — everything after that point
   is lost. For a single row prefer B) into a staging project and copy that row back.

### B) Restore from the own backup (project lost, or to recover single rows)
1. Download the artifact from GitHub Actions, then decrypt and unpack:
   ```bash
   gpg --decrypt adlr-backup-YYYY-MM-DD.tar.gz.gpg > backup.tar.gz
   tar -xzf backup.tar.gz
   ```
2. Create a new Supabase project (for a drill or single rows: a separate *staging* project,
   never the live one). Get its *Session pooler* URI.
3. Database (needs `psql`, e.g. from the Supabase CLI docker image or a Postgres install):
   ```bash
   psql --single-transaction --variable ON_ERROR_STOP=1 \
     --file backup/db/roles.sql --file backup/db/schema.sql \
     --command 'SET session_replication_role = replica' \
     --file backup/db/data.sql --dbname "<NEW_DB_URL>"
   ```
4. Storage files:
   ```bash
   SUPABASE_URL=<new url> SUPABASE_SERVICE_ROLE_KEY=<new key> node scripts/backup-storage.mjs restore backup/storage
   ```
5. Things a dump does not contain — redo by hand on a new project:
   - Edge Functions: deploy `ai-plan`, `coach-report`, `delete-account`, `send-push`
     (`send-push` with Verify JWT **off**).
   - Edge Function secrets: `ANTHROPIC_API_KEY`, `PUSH_WEBHOOK_SECRET`, `FCM_SERVICE_ACCOUNT`,
     `APNS_KEY_P8`, `APNS_KEY_ID`, `APNS_TEAM_ID`.
   - Vault secrets `push_function_url`, `push_webhook_secret` (see `20261017_push.sql`).
   - Auth: SMTP settings, e-mail templates (`{{ .Token }}` for the reset code), redirect URLs.
   - Extensions: `pg_net` (push trigger).
6. Moving the live app to a new project means a new URL + anon key in `src/lib/supabase.ts`
   → new app build. Restoring into the *same* project needs no app change.

### Check after a restore
```sql
SELECT (SELECT count(*) FROM profiles) AS profiles,
       (SELECT count(*) FROM workout_completions) AS workouts,
       (SELECT count(*) FROM exercise_set_logs) AS sets,
       (SELECT count(*) FROM storage.objects) AS files;
```
Compare with the same query on the live project, then log in as a test coach and a test
client and open a client's history and a progress photo.

## Restore drill — every 3 months
Do B) into a staging project with the latest artifact, run the check above, write the date
and the numbers here. A backup nobody has restored is not a backup.

| Date | Artifact | profiles / workouts / sets / files | OK? |
|---|---|---|---|
| | | | |
