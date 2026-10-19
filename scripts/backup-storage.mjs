// Backup / restore of the Supabase Storage buckets (progress photos, coach feedback,
// exercise videos, avatars). Database dumps do NOT contain these files.
//
//   backup:  SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/backup-storage.mjs backup <dir>
//   restore: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/backup-storage.mjs restore <dir>
//
// The service-role key bypasses RLS: only pass it via env, never commit it, and keep
// <dir> outside the repo (it contains clients' health photos). See BACKUP-RESTORE.md.
import { createClient } from '@supabase/supabase-js';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';

const BUCKETS = ['photos', 'feedback', 'exercise-videos', 'avatars'];
const [mode, dir] = process.argv.slice(2);
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!['backup', 'restore'].includes(mode) || !dir || !url || !key) {
  console.error('Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/backup-storage.mjs backup|restore <dir>');
  process.exit(1);
}
const admin = createClient(url, key, { auth: { persistSession: false } });

async function listAll(bucket, prefix = '') {
  const files = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await admin.storage.from(bucket).list(prefix, { limit: 1000, offset });
    if (error) throw new Error(`${bucket}/${prefix}: ${error.message}`);
    for (const item of data ?? []) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id === null) files.push(...await listAll(bucket, path)); // folder
      else files.push({ path, type: item.metadata?.mimetype });
    }
    if (!data || data.length < 1000) break;
  }
  return files;
}

async function walk(root) {
  const out = [];
  for (const e of await readdir(root, { withFileTypes: true }).catch(() => [])) {
    const p = join(root, e.name);
    if (e.isDirectory()) out.push(...await walk(p)); else out.push(p);
  }
  return out;
}

let failed = 0;
for (const bucket of BUCKETS) {
  const base = join(dir, bucket);
  if (mode === 'backup') {
    let files;
    try { files = await listAll(bucket); } catch (e) { console.warn(`skip ${bucket}: ${e.message}`); continue; }
    for (const f of files) {
      const { data, error } = await admin.storage.from(bucket).download(f.path);
      if (error) { failed++; console.error(`✗ ${bucket}/${f.path}: ${error.message}`); continue; }
      const target = join(base, ...f.path.split('/'));
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, Buffer.from(await data.arrayBuffer()));
    }
    console.log(`${bucket}: ${files.length} files`);
  } else {
    const files = await walk(base);
    if (files.length && (await admin.storage.getBucket(bucket)).error) {
      // fresh project: avatars is the only public bucket
      await admin.storage.createBucket(bucket, { public: bucket === 'avatars' });
    }
    for (const file of files) {
      const path = relative(base, file).split(sep).join('/');
      const { error } = await admin.storage.from(bucket).upload(path, await readFile(file), { upsert: true });
      if (error) { failed++; console.error(`✗ ${bucket}/${path}: ${error.message}`); }
    }
    console.log(`${bucket}: ${files.length} files uploaded`);
  }
}
if (failed) { console.error(`${failed} file(s) failed`); process.exit(1); }
