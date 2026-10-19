import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Copy, Share2, Link2, Sparkles, Package as PackageIcon, Dumbbell, UserPlus, PartyPopper, MessageCircle, Loader2, UserRound } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { t, tUserTitle } from '@/lib/i18n';
import { Button, Field, Input } from '@/components/ui';
import BrandLogo from '@/components/BrandLogo';
import { BrandingFields, brandSwatch } from '@/components/BrandingSettings';
import PackageCatalog from '@/components/business/PackageCatalog';
import type { Package } from '@/lib/business';
import type { Plan } from '@/lib/types';
import { copyText, inviteLink, inviteText, shareInvite } from '@/lib/invite';
import {
  ONBOARDING_STEPS, copyPlanAsTemplate, loadStarterPlans, readLocalState, saveOnboardingState, type CoachOnboardingState,
} from '@/lib/coachOnboarding';

// Steps: 0 name · 1 branding · 2 first offer · 3 start plan · 4 invite · 5 done
const STEP_LABEL = ['Willkommen', 'Branding', 'Angebot', 'Startplan', 'Einladen', 'Fertig'];

/** First trainer login: a short, resumable setup (name → branding → offer → plan → invite).
 *  Every step after the name is optional; "Später" skips the whole setup (the Übersicht
 *  checklist picks up what's missing). */
export default function CoachOnboarding() {
  const { profile, refreshProfile } = useAuth();
  const nav = useNavigate();
  const uid = profile?.id ?? '';

  const [state, setState] = useState<CoachOnboardingState>(() => {
    const db = profile?.coach_onboarding ?? {};
    const local = uid ? readLocalState(uid) : {};
    const pick = (local.step ?? 0) > (db.step ?? 0) ? local : db;
    return { ...pick, done: { ...db.done, ...local.done }, skipped: false };
  });
  const step = Math.min(state.step ?? 0, ONBOARDING_STEPS - 1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // step 0
  const initialName = profile?.first_name?.includes('@') ? '' : (profile?.first_name ?? '');
  const [name, setName] = useState(initialName);
  // step 1
  const [color, setColor] = useState<string | null>(profile?.brand_color ?? null);
  const [logo, setLogo] = useState<string | null>(profile?.brand_logo ?? null);
  // step 2
  const [packages, setPackages] = useState<Package[] | null>(null);
  // step 3
  const [starters, setStarters] = useState<(Plan & { training_days: number })[] | null>(null);
  const [copying, setCopying] = useState<string | null>(null);
  const [copied, setCopied] = useState<string[]>([]);
  // step 4
  const [code, setCode] = useState<string | null>(null);
  const [flash, setFlash] = useState<'code' | 'link' | null>(null);
  const [invited, setInvited] = useState(false);

  const loadPackages = async () => {
    const { data } = await supabase.from('packages').select('*').eq('trainer_id', uid).order('created_at');
    setPackages((data ?? []) as Package[]);
  };

  useEffect(() => {
    if (!uid) return;
    if (step === 2 && packages === null) loadPackages();
    if (step === 3 && starters === null) loadStarterPlans().then(setStarters).catch(() => setStarters([]));
    if (step === 4 && code === null) {
      supabase.rpc('my_invite_code').then(({ data, error }) => {
        if (error) setErr(t('Code konnte nicht geladen werden (Migration ausgeführt?)'));
        else setCode(data as string);
      });
    }
  }, [step, uid]);

  if (!profile) return null;

  const persist = (next: CoachOnboardingState, finished = false) => {
    setState(next);
    return saveOnboardingState(uid, next, finished);
  };
  const go = (to: number, done?: Partial<NonNullable<CoachOnboardingState['done']>>) => {
    setErr(null);
    persist({ ...state, step: to, done: { ...state.done, ...done } });
    window.scrollTo({ top: 0 });
  };
  const finish = async (skipped: boolean) => {
    setBusy(true);
    const { error } = await persist({ ...state, step: skipped ? step : ONBOARDING_STEPS - 1, skipped }, true);
    setBusy(false);
    if (error) { setErr(t('Speichern fehlgeschlagen. Bitte erneut versuchen.')); return; }
    await refreshProfile();
    nav('/trainer', { replace: true });
  };

  const saveName = async () => {
    const first = name.trim();
    if (!first) return;
    setBusy(true);
    const { error } = await supabase.from('profiles').update({ first_name: first }).eq('id', uid);
    setBusy(false);
    if (error) { setErr(t('Speichern fehlgeschlagen. Bitte erneut versuchen.')); return; }
    refreshProfile();
    go(1, { name: true });
  };
  const brandDirty = color !== (profile.brand_color ?? null) || logo !== (profile.brand_logo ?? null);
  const saveBrand = async () => {
    if (!brandDirty) { go(2, { branding: !!(color || logo) }); return; }
    setBusy(true);
    const { error } = await supabase.from('profiles').update({ brand_color: color, brand_logo: logo }).eq('id', uid);
    setBusy(false);
    if (error) { setErr(t('Speichern fehlgeschlagen. Ist die Datenbank-Migration für Branding ausgeführt?')); return; }
    await refreshProfile();
    go(2, { branding: !!(color || logo) });
  };
  const takeStarter = async (p: Plan) => {
    setCopying(p.id); setErr(null);
    const id = await copyPlanAsTemplate(uid, p);
    setCopying(null);
    if (!id) { setErr(t('Vorlage konnte nicht erstellt werden')); return; }
    setCopied((c) => [...c, p.id]);
  };
  const flashOk = (k: 'code' | 'link') => { setInvited(true); setFlash(k); setTimeout(() => setFlash(null), 2000); };

  const coachName = name.trim() || t('dein Coach');
  const hasPackages = (packages ?? []).some((p) => p.active);

  // ── step bodies ────────────────────────────────────────────────────────────
  const bodies: { kicker: string; title: string; intro: string; body: React.ReactNode }[] = [
    {
      kicker: t('Willkommen bei ADLR Coach'),
      title: t('Lass uns deine App einrichten'),
      intro: t('In fünf kurzen Schritten ist alles bereit für deine ersten Klienten. Alles außer deinem Namen kannst du überspringen und später ändern.'),
      body: (
        <div className="space-y-4">
          <Field label={t('Dein Name für Klienten')} hint={t('So erscheinst du überall in der App deiner Klienten.')}>
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={t('Vorname')} maxLength={40}
              onKeyDown={(e) => { if (e.key === 'Enter') saveName(); }} />
          </Field>
          <div className="adlr-card p-4">
            <p className="text-[10px] uppercase tracking-widest text-white/35 mb-2">{t('Vorschau in der Klienten-App')}</p>
            <div className="flex items-start gap-2.5">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0" style={{ background: 'rgb(var(--adlr-gold) / 0.2)', color: 'rgb(var(--adlr-gold))' }}>
                {(coachName[0] ?? 'C').toUpperCase()}
              </div>
              <div className="rounded-2xl rounded-tl-sm px-3 py-2 text-sm text-white/85" style={{ background: 'rgb(var(--text) / 0.06)' }}>
                <p className="text-[11px] text-adlr-gold font-semibold mb-0.5">{coachName}</p>
                {t('Willkommen! Dein erster Plan ist fertig — lass uns starten.')}
              </div>
            </div>
          </div>
        </div>
      ),
    },
    {
      kicker: t('Dein Branding'),
      title: t('Deine Marke in der App'),
      intro: t('Dein Logo und deine Farbe ersetzen ADLR-Gold in der App deiner Klienten.'),
      body: (
        <div className="space-y-4">
          <div className="adlr-card p-4"><BrandingFields color={color} logo={logo} onColor={setColor} onLogo={setLogo} onError={setErr} /></div>
          <div className="adlr-card p-4">
            <p className="text-[10px] uppercase tracking-widest text-white/35 mb-3">{t('Vorschau')}</p>
            <div className="flex items-center justify-between mb-3">
              {logo ? <img src={logo} alt="" className="h-6 max-w-[140px] object-contain" /> : <BrandLogo size={16} />}
              <span className="text-[10px] font-semibold" style={{ color: brandSwatch(color) }}>{coachName}</span>
            </div>
            <div className="h-1.5 rounded-full mb-3" style={{ background: 'rgb(var(--text) / 0.08)' }}>
              <div className="h-full w-2/3 rounded-full" style={{ background: brandSwatch(color) }} />
            </div>
            <div className="py-2.5 rounded-xl text-center text-sm font-semibold" style={{ background: brandSwatch(color), color: '#000' }}>{t('Training starten')}</div>
          </div>
        </div>
      ),
    },
    {
      kicker: t('Optional'),
      title: t('Dein erstes Angebot'),
      intro: t('Lege an, was du verkaufst — z. B. Einzeltraining, 10er-Block oder Online-Coaching. So siehst du später, welcher Klient wie viele Einheiten offen hat.'),
      body: (
        <div className="adlr-card p-4">
          {packages === null ? <Loader2 size={18} className="animate-spin text-white/40 mx-auto" /> : <PackageCatalog packages={packages} onChange={loadPackages} />}
        </div>
      ),
    },
    {
      kicker: t('Optional'),
      title: t('Dein Startplan'),
      intro: t('Übernimm einen fertigen Plan als Vorlage. Du passt ihn im Plan Builder an und weist ihn Klienten mit einem Tipp zu.'),
      body: (
        <div className="space-y-2.5">
          {starters === null && <Loader2 size={18} className="animate-spin text-white/40 mx-auto" />}
          {starters?.length === 0 && <p className="text-sm text-white/45">{t('Gerade keine Vorlage verfügbar — du baust deinen ersten Plan im Plan Builder.')}</p>}
          {starters?.map((p) => {
            const isCopied = copied.includes(p.id);
            return (
              <div key={p.id} className="adlr-card p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgb(var(--adlr-gold) / 0.12)', color: 'rgb(var(--adlr-gold))' }}><Dumbbell size={18} /></div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{tUserTitle(p.name)}</p>
                  <p className="text-[11px] text-white/45">{t('{n} Trainingstage pro Woche', { n: p.training_days })}</p>
                </div>
                <button onClick={() => !isCopied && takeStarter(p)} disabled={copying !== null || isCopied}
                  className="adlr-tap px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1 shrink-0 disabled:opacity-100"
                  style={isCopied ? { background: 'rgb(34 197 94 / 0.15)', color: '#22c55e' } : { background: 'rgb(var(--adlr-gold))', color: '#000' }}>
                  {copying === p.id ? <Loader2 size={13} className="animate-spin" /> : isCopied ? <Check size={13} /> : null}
                  {isCopied ? t('Übernommen') : t('Übernehmen')}
                </button>
              </div>
            );
          })}
          {copied.length > 0 && <p className="text-xs text-white/45 px-1">{t('Du findest sie im Plan Builder unter „Vorlagen“.')}</p>}
        </div>
      ),
    },
    {
      kicker: t('Optional'),
      title: t('Lade deinen ersten Klienten ein'),
      intro: t('Deine Klienten geben diesen Code beim Registrieren ein — dann sind sie automatisch mit dir verbunden.'),
      body: (
        <div className="space-y-3">
          <div className="rounded-2xl py-6 text-center" style={{ background: 'rgb(var(--adlr-gold) / 0.1)', border: '1px solid rgb(var(--adlr-gold) / 0.35)' }}>
            <p className="text-[10px] uppercase tracking-widest text-white/40 mb-1">{t('Dein Einladungscode')}</p>
            <p data-testid="invite-code" className="text-3xl font-extrabold tracking-[0.35em] text-adlr-gold pl-[0.35em]">{code ?? '······'}</p>
          </div>
          <Button onClick={async () => { if (!code) return; const r = await shareInvite(code); if (r === 'copied') flashOk('code'); else if (r === 'shared') setInvited(true); }} disabled={!code} className="w-full flex items-center justify-center gap-2">
            <Share2 size={16} /> {t('Einladung teilen')}
          </Button>
          <div className="flex gap-2">
            <button onClick={async () => { if (code && await copyText(inviteText(code))) flashOk('code'); }} disabled={!code}
              className="adlr-tap flex-1 py-3 rounded-xl text-sm font-medium bg-white/5 border border-white/10 text-white/80 flex items-center justify-center gap-1.5 disabled:opacity-40">
              {flash === 'code' ? <Check size={15} className="text-green-500" /> : <Copy size={15} />} {flash === 'code' ? t('Kopiert') : t('Text kopieren')}
            </button>
            {code && inviteLink(code) && (
              <button onClick={async () => { if (await copyText(inviteLink(code)!)) flashOk('link'); }}
                className="adlr-tap flex-1 py-3 rounded-xl text-sm font-medium bg-white/5 border border-white/10 text-white/80 flex items-center justify-center gap-1.5">
                {flash === 'link' ? <Check size={15} className="text-green-500" /> : <Link2 size={15} />} {flash === 'link' ? t('Kopiert') : t('Link kopieren')}
              </button>
            )}
          </div>
          <div className="adlr-card p-3 flex items-start gap-2.5">
            <MessageCircle size={15} className="text-adlr-gold shrink-0 mt-0.5" />
            <p className="text-xs text-white/55 leading-relaxed">{code ? inviteText(code) : '…'}</p>
          </div>
        </div>
      ),
    },
  ];

  // ── done screen ────────────────────────────────────────────────────────────
  if (step === ONBOARDING_STEPS - 1) {
    const d = state.done ?? {};
    const rows: [boolean, string, typeof Check][] = [
      [!!d.name, t('Name für Klienten'), UserRound],
      [!!(d.branding || profile.brand_color || profile.brand_logo), t('Logo & Farbe'), Sparkles],
      [!!d.package, t('Erstes Angebot'), PackageIcon],
      [!!d.plan, t('Startplan als Vorlage'), Dumbbell],
      [!!d.invite, t('Einladung geteilt'), UserPlus],
    ];
    return (
      <div className="min-h-screen flex flex-col">
        <div className="flex-1 px-6 pt-20 pb-36 max-w-md mx-auto w-full adlr-slide-in">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-5" style={{ background: 'rgb(var(--adlr-gold) / 0.15)', color: 'rgb(var(--adlr-gold))' }}><PartyPopper size={26} /></div>
          <p className="text-xs text-adlr-gold tracking-widest uppercase mb-2">{t('Fertig')}</p>
          <h1 className="text-2xl font-bold tracking-tight mb-2">{t('Deine App ist bereit, {name}', { name: coachName })}</h1>
          <p className="text-sm text-white/50 mb-6">{t('Auf der Übersicht wartet eine kurze Checkliste mit den nächsten Schritten: eigene Fragen, Check-in und dein Kalender.')}</p>
          <div className="adlr-card divide-y divide-white/5">
            {rows.map(([ok, label, Icon]) => (
              <div key={label} className="flex items-center gap-3 px-4 py-3">
                <Icon size={15} className={ok ? 'text-adlr-gold' : 'text-white/25'} />
                <span className={`flex-1 text-sm ${ok ? 'text-white/85' : 'text-white/40'}`}>{label}</span>
                {ok ? <Check size={16} className="text-green-500" /> : <span className="text-[11px] text-white/30">{t('später')}</span>}
              </div>
            ))}
          </div>
        </div>
        <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-adlr-black via-adlr-black to-transparent pt-6 pb-6 px-6 safe-bottom">
          <div className="max-w-md mx-auto">
            {err && <p className="text-xs text-red-400 mb-2 text-center">{err}</p>}
            <Button onClick={() => finish(false)} disabled={busy} className="w-full">{busy ? t('Speichert...') : t('Zur Übersicht')}</Button>
          </div>
        </div>
      </div>
    );
  }

  const cur = bodies[step];
  const progress = ((step + 1) / ONBOARDING_STEPS) * 100;
  const next = () => {
    if (step === 0) return saveName();
    if (step === 1) return saveBrand();
    if (step === 2) return go(3, { package: hasPackages });
    if (step === 3) return go(4, { plan: copied.length > 0 || !!state.done?.plan });
    return go(5, { invite: invited || !!state.done?.invite });
  };
  const primaryLabel = step === 0 ? t("Los geht's") : t('Weiter');

  return (
    <div className="min-h-screen flex flex-col">
      <div className="fixed top-0 left-0 right-0 z-20 bg-adlr-black/90 safe-top">
        <div className="flex items-center justify-between px-5 pt-4 pb-2 max-w-md mx-auto">
          <button onClick={() => go(step - 1)} disabled={step === 0} className="text-white/40 text-sm disabled:opacity-0 adlr-tap">{t('Zurück')}</button>
          <span className="text-xs text-white/40 tracking-widest uppercase">{t(STEP_LABEL[step])} · {step + 1} / {ONBOARDING_STEPS - 1}</span>
          <button onClick={() => finish(true)} disabled={busy} className="text-white/40 text-sm adlr-tap">{t('Später')}</button>
        </div>
        <div className="h-0.5 bg-white/5 mx-5 rounded-full overflow-hidden max-w-md sm:mx-auto">
          <div className="h-full bg-adlr-gold transition-all duration-500 ease-out" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="flex-1 px-6 pt-20 pb-40 max-w-md mx-auto w-full">
        <div key={step} className="adlr-slide-in">
          <div className="mb-6">
            <p className="text-xs text-adlr-gold tracking-widest uppercase mb-2">{cur.kicker}</p>
            <h1 className="text-2xl font-bold tracking-tight mb-2">{cur.title}</h1>
            <p className="text-sm text-white/50 leading-relaxed">{cur.intro}</p>
          </div>
          {cur.body}
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-adlr-black via-adlr-black to-transparent pt-6 pb-6 px-6 safe-bottom">
        <div className="max-w-md mx-auto">
          {err && <p className="text-xs text-red-400 mb-2 text-center">{err}</p>}
          <Button onClick={next} disabled={busy || (step === 0 && !name.trim())} className="w-full">
            {busy ? t('Speichert...') : primaryLabel}
          </Button>
          {step > 0 && (
            <button onClick={() => go(step + 1)} disabled={busy} className="w-full text-xs text-white/35 mt-3 adlr-tap">{t('Überspringen')}</button>
          )}
        </div>
      </div>
    </div>
  );
}
