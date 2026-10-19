// Sends remote push notifications for new chat messages, check-ins/replies and session
// changes. Called by the database triggers in migration 20261017_push.sql (pg_net), NOT by
// the app. Android tokens go through FCM HTTP v1, iOS tokens straight to APNs (token-based
// .p8 auth) — the app uses @capacitor/push-notifications, which yields a raw APNs token on
// iOS, so no Firebase SDK is needed in the iOS app.
//
// Deploy (Dashboard → Edge Functions, or CLI): npx supabase functions deploy send-push --no-verify-jwt
//   Verify JWT must be OFF: the caller is the database, authenticated by x-push-secret.
// Secrets (Dashboard → Edge Functions → Secrets):
//   PUSH_WEBHOOK_SECRET   random string, same value as the Vault secret 'push_webhook_secret'
//   FCM_SERVICE_ACCOUNT   the whole Firebase service-account JSON (Android)
//   APNS_KEY_P8           contents of the AuthKey_XXXX.p8 file (iOS)
//   APNS_KEY_ID           the 10-character key id of that .p8
//   APNS_TEAM_ID          Apple team id (7S87RYSQ7D)
//   APNS_SANDBOX          optional, "1" only for Xcode debug builds (TestFlight/App Store = production)
// Missing FCM or APNs secrets just skip that platform. SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are automatic.
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

type Lang = 'de' | 'en' | 'hu';
interface Payload { table: string; type: 'INSERT' | 'UPDATE'; actor: string | null; record: Record<string, unknown>; old_record: Record<string, unknown> | null }
interface Push { userId: string; title: string; body: string; link: string; collapse: string }
interface ProfileRow { id: string; first_name: string | null; last_name: string | null; lang: string | null; role: string | null; trainer_id: string | null }

const TIME_ZONE = 'Europe/Vienna';
const BUNDLE_ID = 'com.adlr.app';
const ANDROID_CHANNEL = 'adlr-push';

// German source text is the key, like the app's t().
const DICT: Record<string, { en: string; hu: string }> = {
  'Dein Coach': { en: 'Your coach', hu: 'Edződ' },
  'Neue Nachricht': { en: 'New message', hu: 'Új üzenet' },
  '{coach} hat auf deinen Check-in geantwortet': { en: '{coach} replied to your check-in', hu: '{coach} válaszolt a check-inedre' },
  'Neuer Termin': { en: 'New session', hu: 'Új időpont' },
  'Termin verschoben': { en: 'Session rescheduled', hu: 'Időpont módosult' },
  'Termin abgesagt': { en: 'Session cancelled', hu: 'Időpont lemondva' },
  'Neuer Check-in': { en: 'New check-in', hu: 'Új check-in' },
  '{name} hat den Wochen-Check-in ausgefüllt.': { en: '{name} filled in the weekly check-in.', hu: '{name} kitöltötte a heti check-int.' },
  'Ein Klient': { en: 'A client', hu: 'Egy kliens' },
};
function tr(lang: Lang, key: string, vars: Record<string, string> = {}): string {
  const s = lang === 'de' ? key : (DICT[key]?.[lang] ?? key);
  return s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
}
const langOf = (p: ProfileRow | null): Lang => (p?.lang === 'en' || p?.lang === 'hu' ? p.lang : 'de');
const LOCALE: Record<Lang, string> = { de: 'de-AT', en: 'en-GB', hu: 'hu-HU' };
function when(lang: Lang, iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString(LOCALE[lang], { weekday: 'short', day: 'numeric', month: 'short', timeZone: TIME_ZONE });
  const time = d.toLocaleTimeString(LOCALE[lang], { hour: '2-digit', minute: '2-digit', timeZone: TIME_ZONE });
  return `${date}, ${time}`;
}
/** Lock-screen preview: one line, short — never the whole message. */
function preview(text: unknown, max = 90): string {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
function displayName(p: ProfileRow | null): string {
  const first = (p?.first_name ?? '').trim();
  if (first.includes('@')) { const l = first.split('@')[0].split(/[._-]/)[0]; return l ? l[0].toUpperCase() + l.slice(1) : ''; }
  return [first, (p?.last_name ?? '').trim()].filter(Boolean).join(' ');
}

async function profile(admin: SupabaseClient, id: string | null | undefined): Promise<ProfileRow | null> {
  if (!id) return null;
  const { data } = await admin.from('profiles').select('id, first_name, last_name, lang, role, trainer_id').eq('id', id).maybeSingle();
  return (data as ProfileRow | null) ?? null;
}

/** Turns one trigger event into the notification for the other party (never the actor). */
async function buildPush(admin: SupabaseClient, p: Payload): Promise<Push | null> {
  const r = p.record;
  if (p.table === 'messages' && p.type === 'INSERT') {
    const client = await profile(admin, r.client_id as string);
    if (!client) return null;
    if (r.sender === 'trainer') {
      const coach = await profile(admin, client.trainer_id);
      const lang = langOf(client);
      const coachName = displayName(coach) || tr(lang, 'Dein Coach');
      // The coach app posts a chat message right after answering a check-in.
      const since = new Date(Date.now() - 2 * 60_000).toISOString();
      const { data: reply } = await admin.from('weekly_checkins').select('id').eq('client_id', client.id).gte('replied_at', since).limit(1).maybeSingle();
      if (reply) return { userId: client.id, title: tr(lang, '{coach} hat auf deinen Check-in geantwortet', { coach: coachName }), body: preview(r.body), link: '/app', collapse: `chat-${client.id}` };
      return { userId: client.id, title: coachName, body: preview(r.body) || tr(lang, 'Neue Nachricht'), link: '/app/coach', collapse: `chat-${client.id}` };
    }
    if (!client.trainer_id) return null;
    const coach = await profile(admin, client.trainer_id);
    const lang = langOf(coach);
    const name = displayName(client) || tr(lang, 'Ein Klient');
    // The client app posts "check-in filled in" to the chat right after saving the check-in.
    const since = new Date(Date.now() - 2 * 60_000).toISOString();
    const { data: checkin } = await admin.from('weekly_checkins').select('id').eq('client_id', client.id).gte('created_at', since).limit(1).maybeSingle();
    if (checkin) return { userId: client.trainer_id, title: tr(lang, 'Neuer Check-in'), body: tr(lang, '{name} hat den Wochen-Check-in ausgefüllt.', { name }), link: `/trainer/klienten?client=${client.id}`, collapse: `checkin-${client.id}` };
    return { userId: client.trainer_id, title: name, body: preview(r.body) || tr(lang, 'Neue Nachricht'), link: `/trainer/nachrichten?client=${client.id}`, collapse: `chat-${client.id}` };
  }

  if (p.table === 'sessions') {
    const clientId = r.client_id as string;
    const trainerId = r.trainer_id as string;
    const toTrainer = p.actor != null && p.actor === clientId;
    const recipient = await profile(admin, toTrainer ? trainerId : clientId);
    if (!recipient) return null;
    const lang = langOf(recipient);
    const cancelled = r.status === 'cancelled';
    const title = p.type === 'INSERT' ? tr(lang, 'Neuer Termin') : cancelled ? tr(lang, 'Termin abgesagt') : tr(lang, 'Termin verschoben');
    let body = when(lang, r.scheduled_at as string);
    if (r.location && !cancelled) body += ` · ${preview(r.location, 40)}`;
    if (toTrainer) { const c = await profile(admin, clientId); body = `${displayName(c)}: ${body}`; }
    return { userId: recipient.id, title, body, link: toTrainer ? '/trainer/klienten?view=kalender' : '/app', collapse: `session-${r.id}` };
  }
  return null;
}

// ── JWT helpers (WebCrypto) ──────────────────────────────────────────────────
const b64url = (data: ArrayBuffer | Uint8Array | string): string => {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
function pemToDer(pem: string): ArrayBuffer {
  const b64 = pem.replace(/\\n/g, '\n').replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}
async function signJwt(header: object, claims: object, pem: string, alg: 'RS256' | 'ES256'): Promise<string> {
  const input = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;
  const key = await crypto.subtle.importKey('pkcs8', pemToDer(pem),
    alg === 'RS256' ? { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' } : { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  // WebCrypto ECDSA returns raw r||s, which is exactly the JWS ES256 format.
  const sig = await crypto.subtle.sign(alg === 'RS256' ? 'RSASSA-PKCS1-v1_5' : { name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(input));
  return `${input}.${b64url(sig)}`;
}

// ── FCM HTTP v1 (Android) ───────────────────────────────────────────────────
let fcmAuth: { token: string; exp: number; projectId: string } | null = null;
async function fcmAccess(): Promise<{ token: string; projectId: string } | null> {
  const raw = Deno.env.get('FCM_SERVICE_ACCOUNT');
  if (!raw) return null;
  if (fcmAuth && fcmAuth.exp > Date.now() + 60_000) return fcmAuth;
  const sa = JSON.parse(raw) as { client_email: string; private_key: string; project_id: string };
  const now = Math.floor(Date.now() / 1000);
  const assertion = await signJwt({ alg: 'RS256', typ: 'JWT' }, {
    iss: sa.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
  }, sa.private_key, 'RS256');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  if (!res.ok) { console.error('fcm oauth', res.status, await res.text()); return null; }
  const j = await res.json() as { access_token: string; expires_in: number };
  fcmAuth = { token: j.access_token, exp: Date.now() + j.expires_in * 1000, projectId: sa.project_id };
  return fcmAuth;
}
/** Returns false when the token is dead and should be deleted. */
async function sendFcm(token: string, push: Push): Promise<boolean> {
  const auth = await fcmAccess();
  if (!auth) return true;
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${auth.projectId}/messages:send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${auth.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: {
      token,
      notification: { title: push.title, body: push.body },
      data: { link: push.link },
      android: { priority: 'HIGH', notification: { channel_id: ANDROID_CHANNEL, icon: 'ic_stat_push', color: '#C9A84C', tag: push.collapse } },
    } }),
  });
  if (res.ok) return true;
  const text = await res.text();
  console.error('fcm send', res.status, text);
  return !(res.status === 404 || (res.status === 400 && /UNREGISTERED|registration token/i.test(text)));
}

// ── APNs (iOS) ──────────────────────────────────────────────────────────────
let apnsJwt: { token: string; iat: number } | null = null;
async function apnsAuth(): Promise<string | null> {
  const p8 = Deno.env.get('APNS_KEY_P8'), kid = Deno.env.get('APNS_KEY_ID'), team = Deno.env.get('APNS_TEAM_ID');
  if (!p8 || !kid || !team) return null;
  const now = Math.floor(Date.now() / 1000);
  // Apple wants the provider token refreshed at most every 20 min and at least every 60.
  if (apnsJwt && now - apnsJwt.iat < 40 * 60) return apnsJwt.token;
  apnsJwt = { token: await signJwt({ alg: 'ES256', kid }, { iss: team, iat: now }, p8, 'ES256'), iat: now };
  return apnsJwt.token;
}
async function sendApns(token: string, push: Push): Promise<boolean> {
  const jwt = await apnsAuth();
  if (!jwt) return true;
  const host = Deno.env.get('APNS_SANDBOX') === '1' ? 'api.sandbox.push.apple.com' : 'api.push.apple.com';
  const res = await fetch(`https://${host}/3/device/${token}`, {
    method: 'POST',
    headers: {
      authorization: `bearer ${jwt}`, 'apns-topic': BUNDLE_ID, 'apns-push-type': 'alert',
      'apns-priority': '10', 'apns-collapse-id': push.collapse.slice(0, 64),
    },
    body: JSON.stringify({ aps: { alert: { title: push.title, body: push.body }, sound: 'default', 'thread-id': push.collapse }, link: push.link }),
  });
  if (res.ok) return true;
  const text = await res.text();
  console.error('apns send', res.status, text);
  return !(res.status === 410 || /BadDeviceToken|Unregistered|DeviceTokenNotForTopic/.test(text));
}

Deno.serve(async (req) => {
  const secret = Deno.env.get('PUSH_WEBHOOK_SECRET');
  if (!secret || req.headers.get('x-push-secret') !== secret) return new Response('forbidden', { status: 403 });
  try {
    const payload = await req.json() as Payload;
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const push = await buildPush(admin, payload);
    if (!push || push.userId === payload.actor) return Response.json({ sent: 0 });

    const { data: tokens } = await admin.from('push_tokens').select('token, platform').eq('user_id', push.userId);
    let sent = 0;
    const dead: string[] = [];
    for (const t of (tokens ?? []) as { token: string; platform: string }[]) {
      try {
        const alive = t.platform === 'ios' ? await sendApns(t.token, push) : await sendFcm(t.token, push);
        if (alive) sent++; else dead.push(t.token);
      } catch (e) { console.error('push', t.platform, String(e)); }
    }
    if (dead.length) await admin.from('push_tokens').delete().in('token', dead);
    return Response.json({ sent, removed: dead.length });
  } catch (e) {
    console.error('send-push', String(e));
    return Response.json({ error: String(e) }, { status: 500 });
  }
});
