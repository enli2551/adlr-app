// Mocked test of the push registration path (src/lib/push.ts) — no device, no network.
//   node scripts/test-push.mjs
// Each scenario runs in its own process with a fake Capacitor native bridge
// (window.androidBridge / webkit.messageHandlers.bridge + PluginHeaders, like the native
// runtime injects) and a recording Supabase mock, then loads push.ts through Vite SSR.
//   web             → everything is a silent no-op
//   android-nofb    → no google-services.json: PushSupport says unavailable → register() never called
//   android-old     → older build without the PushSupport plugin → treated as unavailable
//   android         → Firebase present: permission asked once, register(), token saved via RPC, tap → link
//   ios             → APNs token saved, logout removes it
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCENARIOS = ['web', 'android-nofb', 'android-old', 'android', 'ios'];

if (!process.env.PUSH_SCENARIO) {
  let failed = 0;
  for (const s of SCENARIOS) {
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], { cwd: root, env: { ...process.env, PUSH_SCENARIO: s }, encoding: 'utf8' });
    const ok = r.status === 0;
    if (!ok) failed++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${s}${ok ? '' : `\n${r.stdout}\n${r.stderr}`}`);
  }
  process.exit(failed ? 1 : 0);
}

// ── one scenario ─────────────────────────────────────────────────────────────
const scenario = process.env.PUSH_SCENARIO;
const assert = (cond, msg) => { if (!cond) { console.error('ASSERT', msg, JSON.stringify(log, null, 1)); process.exit(1); } };
const log = { native: [], db: [] };

const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
globalThis.window = globalThis;

const listeners = new Map(); // `${plugin}.${event}` -> callback
let perm = 'prompt';
const P = (name) => ({ name, rtype: 'promise' });
const headers = [
  { name: 'PushNotifications', methods: [P('register'), P('unregister'), P('checkPermissions'), P('requestPermissions'), P('createChannel'), P('removeListener'), P('removeAllListeners'), { name: 'addListener', rtype: 'callback' }] },
];
if (scenario === 'android-nofb' || scenario === 'android') headers.push({ name: 'PushSupport', methods: [P('isAvailable')] });

if (scenario !== 'web') {
  if (scenario.startsWith('android')) globalThis.androidBridge = { postMessage() {} };
  else globalThis.webkit = { messageHandlers: { bridge: { postMessage() {} } } };
  let cb = 0;
  globalThis.Capacitor = {
    PluginHeaders: headers,
    async nativePromise(plugin, method, opts) {
      log.native.push(`${plugin}.${method}`);
      if (plugin === 'PushSupport' && method === 'isAvailable') return { available: scenario === 'android' };
      if (method === 'checkPermissions') return { receive: perm };
      if (method === 'requestPermissions') { perm = 'granted'; return { receive: perm }; }
      if (method === 'register') {
        // Native answers asynchronously with the token event.
        setTimeout(() => listeners.get('PushNotifications.registration')?.({ value: `tok-${scenario}` }), 5);
        return undefined;
      }
      return undefined;
    },
    nativeCallback(plugin, method, opts, fn) {
      log.native.push(`${plugin}.${method}:${opts?.eventName}`);
      listeners.set(`${plugin}.${opts.eventName}`, fn);
      return String(++cb);
    },
  };
}

const { createServer } = await import('vite');
const server = await createServer({
  root,
  configFile: path.join(root, 'vite.config.ts'),
  logLevel: 'silent',
  server: { middlewareMode: true, hmr: false },
  appType: 'custom',
  plugins: [{
    name: 'mock-supabase',
    enforce: 'pre',
    // Runs after the '@' alias, so match the resolved path too.
    resolveId(id) { return /(^@|[\\/]src)[\\/]lib[\\/]supabase(\.ts)?$/.test(id) ? '\0mock-supabase' : null; },
    load(id) {
      if (id !== '\0mock-supabase') return null;
      return `const log = globalThis.__pushLog;
        const q = (table) => { const b = { _t: table, update(v) { log.db.push(['update', table, v]); return b; }, delete() { log.db.push(['delete', table]); return b; },
          eq(c, v) { log.db.push(['eq', table, c, v]); return b; }, then(res) { res({ data: null, error: null }); } }; return b; };
        export const supabase = { from: q, rpc: async (fn, args) => { log.db.push(['rpc', fn, args]); return { data: null, error: null }; } };`;
    },
  }],
});
globalThis.__pushLog = log;
try {
  const push = await server.ssrLoadModule('/src/lib/push.ts');
  const links = [];
  await push.listenForPushTaps((l) => links.push(l));
  await push.ensurePush('user-1');
  await new Promise((r) => setTimeout(r, 30));
  const rpc = log.db.filter((d) => d[0] === 'rpc');

  if (scenario === 'web' || scenario === 'android-nofb' || scenario === 'android-old') {
    assert(!log.native.some((n) => /register|requestPermissions/.test(n)), 'must not ask/register without push support');
    assert(rpc.length === 0, 'no token write');
    await push.removePushToken();
    assert(!log.db.some((d) => d[0] === 'delete'), 'nothing to delete');
  } else {
    assert(log.native.includes('PushNotifications.requestPermissions'), 'permission asked');
    assert(log.native.includes('PushNotifications.register'), 'registered');
    assert(rpc.length === 1 && rpc[0][1] === 'register_push_token' && rpc[0][2].p_token === `tok-${scenario}` && rpc[0][2].p_platform === (scenario === 'ios' ? 'ios' : 'android'), 'token saved via RPC');
    assert(log.native.includes('PushNotifications.createChannel') === (scenario === 'android'), 'channel only on Android');
    // A second call (same user, next screen) is a no-op; permission is asked once per device.
    const before = log.native.length;
    await push.ensurePush('user-1');
    assert(log.native.length === before, 'idempotent per user');
    // Tap → deep link (only our own routes).
    const tap = listeners.get('PushNotifications.pushNotificationActionPerformed');
    tap?.({ actionId: 'tap', notification: { data: { link: '/trainer/nachrichten?client=abc' } } });
    tap?.({ actionId: 'tap', notification: { data: { link: 'https://evil.example' } } });
    assert(links.length === 1 && links[0] === '/trainer/nachrichten?client=abc', 'deep link');
    // Logout removes the token row.
    await push.removePushToken();
    assert(log.db.some((d) => d[0] === 'delete' && d[1] === 'push_tokens') && log.db.some((d) => d[0] === 'eq' && d[3] === `tok-${scenario}`), 'token deleted on logout');
    // Another account on the same device: no new permission prompt, token re-registered.
    log.native.length = 0;
    perm = 'granted';
    await push.ensurePush('user-2');
    await new Promise((r) => setTimeout(r, 30));
    assert(!log.native.includes('PushNotifications.requestPermissions') && log.native.includes('PushNotifications.register'), 're-register for next user');
  }
  console.log('ok', scenario);
} finally {
  await server.close();
}
process.exit(0);
