import { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Search, Dumbbell, Play, Plus, X, Loader2, Activity, Target, Clock, Pencil, Video, Trash2 } from 'lucide-react';
import { fetchExercises, MUSCLE_GROUPS, coachVideoFor, onCoachLibraryChange, type ExerciseRow } from '@/lib/exercises';
import { signedCoachVideo, setLibraryVideo, clearLibraryVideo } from '@/lib/coachVideos';
import { useAuth } from '@/lib/auth';
import CoachExerciseSheet from '@/components/CoachExerciseSheet';
import { useAsyncData } from '@/lib/useAsyncData';
import { t } from '@/lib/i18n';
import { demoVideoFor } from '@/lib/demoVideos';
import { EXERCISE_ALIASES } from '@/lib/exerciseAliases';

interface Props {
  onAdd: (ex: ExerciseRow) => void;
  onDemo: (ex: ExerciseRow) => void;
  canAdd: boolean;
  noSelectionHint?: string;
}

export function ExerciseLibrary({ onAdd, onDemo, canAdd, noSelectionHint }: Props) {
  const [hint, setHint] = useState(false);
  const { profile } = useAuth();
  const isCoach = profile?.role === 'trainer';
  // Coach's own exercises change while the list is open (created / edited) → refetch.
  const [libVersion, setLibVersion] = useState(0);
  useEffect(() => onCoachLibraryChange(() => setLibVersion((v) => v + 1)), []);
  const [sheet, setSheet] = useState<{ row: ExerciseRow | null } | null>(null);
  const { data: exercises, loading } = useAsyncData(fetchExercises, [libVersion]);
  const hasOwn = (exercises ?? []).some((e) => e.trainer_id);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('Alle');

  const filtered = useMemo(() => {
    if (!exercises) return [];
    // Hidden duplicates still count for search: "Kurzhantel Seitheben" (hidden) finds the kept
    // "Seitheben". Equipment and accents too — "kezisulyzos oldalemeles" finds it.
    const fold = (x: string) => x.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const aliasesOf = new Map<string, string[]>();
    for (const e of exercises) {
      const keep = e.alias_of || EXERCISE_ALIASES[e.name];
      if (keep) aliasesOf.set(keep, [...(aliasesOf.get(keep) ?? []), e.name]);
    }
    const words = fold(search).split(/\s+/).filter(Boolean);
    return exercises.filter((s) => {
      if (s.alias_of || EXERCISE_ALIASES[s.name]) return false; // duplicate entry — use the kept one
      const matchGroup = filter === 'Alle' || (filter === '__own' ? !!s.trainer_id : s.muscle_group === filter);
      if (!matchGroup) return false;
      if (words.length === 0) return true;
      const names = [s.name, ...(aliasesOf.get(s.name) ?? [])];
      const hay = fold([...names, ...names.map((n) => t(n)), s.equipment ?? '', s.equipment ? t(s.equipment) : ''].join(' | '));
      return words.every((w) => hay.includes(w));
    });
  }, [exercises, search, filter]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={24} className="animate-spin" style={{ color: 'rgb(var(--adlr-gold))' }} />
      </div>
    );
  }

  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgb(var(--text) / 0.07)' }}>
      <div className="px-4 pt-4 pb-3" style={{ background: 'rgb(var(--text) / 0.03)' }}>
        <p className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-3">
          {t('ÜBUNGSBIBLIOTHEK')} · {t('{n} Übungen', { n: exercises?.length ?? 0 })}
        </p>
        <div className="relative mb-3">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('Übung suchen...')}
            className="w-full bg-inset border border-white/10 rounded-xl pl-9 pr-3 py-2.5 text-sm text-white placeholder-white/30 outline-none"
          />
        </div>
        {isCoach && (
          <button onClick={() => setSheet({ row: null })} className="adlr-tap w-full mb-3 py-2.5 rounded-xl text-sm font-semibold border border-dashed flex items-center justify-center gap-1.5" style={{ borderColor: 'rgb(var(--adlr-gold) / 0.45)', color: 'rgb(var(--adlr-gold))' }}>
            <Plus size={15} /> {t('Eigene Übung erstellen')}
          </button>
        )}
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {['Alle', ...(hasOwn ? ['__own'] : []), ...MUSCLE_GROUPS].map((g) => (
            <button
              key={g}
              onClick={() => setFilter(g)}
              className="adlr-tap px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap border transition-all shrink-0"
              style={filter === g
                ? { background: 'rgb(var(--adlr-gold))', color: '#000', borderColor: 'rgb(var(--adlr-gold))' }
                : { background: 'rgb(var(--text) / 0.05)', color: 'rgb(var(--text) / 0.5)', borderColor: 'rgb(var(--text) / 0.08)' }}
            >
              {g === '__own' ? (isCoach ? t('Eigene') : t('Von deinem Coach')) : t(g)}
            </button>
          ))}
        </div>
      </div>
      <div className="max-h-80 overflow-y-auto divide-y divide-white/5">
        {filtered.map((s) => (
          <div key={s.id} className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.03] transition-colors">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgb(var(--adlr-gold) / 0.1)' }}>
              <Dumbbell size={15} style={{ color: 'rgb(var(--adlr-gold))' }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white flex items-center gap-1.5">
                <span className="min-w-0">{t(s.name)}</span>
                {s.trainer_id && <span className="shrink-0 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded" style={{ background: 'rgb(var(--adlr-gold) / 0.15)', color: 'rgb(var(--adlr-gold))' }}>{isCoach ? t('Eigene') : t('Coach')}</span>}
              </p>
              <p className="text-xs text-white/40">{t(s.muscle_group)} · {s.default_sets}×{s.default_reps} · {t(s.equipment)}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {isCoach && s.trainer_id === profile?.id && (
                <button onClick={() => setSheet({ row: s })} className="adlr-tap p-1 text-white/35" aria-label={t('Bearbeiten')}><Pencil size={13} /></button>
              )}
              {hasDemo(s) && (
                <button
                  onClick={() => onDemo(s)}
                  className="adlr-tap flex items-center gap-1 text-xs"
                  style={{ color: 'rgb(var(--text) / 0.35)' }}
                >
                  <Play size={11} /> {t('Demo')}
                </button>
              )}
              <button
                onClick={() => {
                  if (!canAdd) { setHint(true); setTimeout(() => setHint(false), 2500); return; }
                  onAdd(s);
                }}
                className="adlr-tap w-7 h-7 rounded-lg flex items-center justify-center border transition-all"
                style={canAdd
                  ? { background: 'rgb(var(--adlr-gold) / 0.1)', borderColor: 'rgb(var(--adlr-gold) / 0.25)', color: 'rgb(var(--adlr-gold))' }
                  : { background: 'rgb(var(--text) / 0.04)', borderColor: 'rgb(var(--text) / 0.1)', color: 'rgb(var(--text) / 0.25)' }}
              >
                <Plus size={14} />
              </button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="text-sm text-white/25 text-center py-8">{t('Keine Treffer.')}</p>
        )}
      </div>
      {sheet && <CoachExerciseSheet initial={sheet.row} onClose={() => setSheet(null)} />}
      {hint && (
        <div className="px-4 py-2.5 text-xs text-center adlr-fade-in" style={{ background: 'rgb(var(--adlr-gold) / 0.08)', color: 'rgb(var(--adlr-gold))', borderTop: '1px solid rgb(var(--adlr-gold) / 0.15)' }}>
          {noSelectionHint ?? t('Wähle zuerst einen Trainingstag oben aus')}
        </div>
      )}
    </div>
  );
}

// Locally bundled, self-owned exercise images (by ExerciseDB id) — offline, no API.
export const LOCAL_DEMO_IMAGES: Record<string, string> = {
  '0102': 'kniebeuge.webp',        // Kniebeugen
  '0032': 'kreuzheben.webp',       // Kreuzheben
  '0025': 'bankdruecken.webp',     // Bankdrücken
  '0086': 'schulterdruecken.webp', // Schulterdrücken
  '0652': 'klimmzug.webp',         // Klimmzüge
  '0027': 'langhantelrudern.webp', // Rudern
  '0054': 'ausfallschritt.webp',   // Ausfallschritte
  '0031': 'bizeps-curl.webp',      // Bizeps Curls
  '0241': 'trizeps-druecken.webp', // Trizepsdrücken
  '0464': 'plank.webp',            // Plank
  // Batch 2
  '0047': 'schraegbankdruecken.webp', // Schrägbankdrücken
  '0673': 'latzug.webp',              // Latzug
  '0861': 'sitzrudern.webp',          // Sitzrudern (Kabel)
  '0739': 'beinpresse.webp',          // Beinpresse
  '0585': 'beinstrecker.webp',        // Beinstrecker
  '0496': 'beinbeuger.webp',          // Beinbeuger
  // '0088' Wadenheben is the MACHINE standing calf raise — the bodyweight picture was wrong; no clip yet
  '0417': 'wadenheben.webp',          // Stehendes Wadenheben
  '0178': 'seitheben.webp',           // Seitheben
  '0188': 'kabel-fliegende.webp',     // Cable Fly
  '1269': 'kabel-fliegende.webp',     // Cable Crossover
  '0001': 'crunches.webp',            // 3/4 Sit-up (bodyweight ab curl)
  // Batch 3
  '0289': 'kurzhantel-bankdruecken.webp',    // Kurzhantel Bankdrücken
  '0290': 'kurzhantel-schulterdruecken.webp',// Kurzhantel Bank Sitz Drücken
  '0287': 'kurzhantel-schulterdruecken.webp',// Arnold Press
  '0293': 'kurzhantel-rudern.webp',          // Kurzhantel Rudern
  '0085': 'rumaenisches-kreuzheben.webp',    // Rumänisches Kreuzheben
  '1409': 'hip-thrust.webp',                 // Hip Thrusts
  '0484': 'hip-thrust.webp',                 // Hüftheben (Knie gebeugt)
  '0154': 'reverse-fly.webp',                // Reverse Fly
  '0165': 'hammercurls.webp',                // Hammer Curls
  '0814': 'dips.webp',                       // Trizeps Dips
  // Batch 4
  '0576': 'brustpresse-maschine.webp',       // Brustpresse (Maschine)
  // Lat-Zug Varianten → gemeinsames Latzug-Bild
  '0198': 'latzug.webp',                     // Kabel Latzug
  '0150': 'latzug.webp',                     // Kabel Latzug (Stange)
  '0177': 'latzug.webp',                     // Kabel Latzug (Seil)
  '0197': 'latzug.webp',                     // Kabel Latzug (Pro Lat Bar)
  '0007': 'latzug.webp',                     // Wechselnder Latzug
};


// True if the exercise has any local demo (animation preferred, else static image).
export function hasDemo(ex: { name: string; exercise_id?: string | null; video_path?: string | null }): boolean {
  return !!(coachVideoFor(ex) || demoVideoFor(ex.name) || (ex.exercise_id && LOCAL_DEMO_IMAGES[ex.exercise_id]));
}

export function ExerciseDemoModal({ ex, onClose }: { ex: ExerciseRow; onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [gifLoading, setGifLoading] = useState(true);
  const [gifError, setGifError] = useState(false);

  useEffect(() => {
    if (ex.cues.length === 0) return;
    const interval = setInterval(() => setStep((s) => (s + 1) % ex.cues.length), 2000);
    return () => clearInterval(interval);
  }, [ex.cues.length]);
  // iPhone Low Power Mode (and some Android battery savers) refuse autoplay: the clip then
  // sat on its first frame. Try to play explicitly; if refused, show a play button — a tap
  // is always allowed.
  const videoRef = useRef<HTMLVideoElement>(null);
  const [needsTap, setNeedsTap] = useState(false);
  const tryPlay = () => {
    const v = videoRef.current;
    if (!v) return;
    const p = v.play();
    if (p && typeof p.then === 'function') p.then(() => setNeedsTap(false)).catch(() => setNeedsTap(true));
  };

  const { profile } = useAuth();
  const isCoach = profile?.role === 'trainer';
  const [libVersion, setLibVersion] = useState(0);
  useEffect(() => onCoachLibraryChange(() => setLibVersion((v) => v + 1)), []);
  const coachPath = coachVideoFor(ex);
  const [coachUrl, setCoachUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setCoachUrl(null);
    if (coachPath) signedCoachVideo(coachPath).then((u) => { if (alive) setCoachUrl(u); });
    return () => { alive = false; };
  }, [coachPath, libVersion]);
  const [videoBusy, setVideoBusy] = useState(false);
  const [videoErr, setVideoErr] = useState<string | null>(null);
  const [editOwn, setEditOwn] = useState(false);
  const ownOverride = isCoach && !ex.trainer_id && !!coachPath;
  const uploadOwnVideo = async (file: File | undefined) => {
    if (!file || !profile) return;
    setVideoBusy(true); setVideoErr(null);
    const e = await setLibraryVideo(profile.id, ex.name, file);
    setVideoBusy(false);
    if (e) setVideoErr(e === 'too_large' ? t('Das Video ist zu groß (max. 50 MB). Nimm ein kürzeres auf.') : t('Video konnte nicht hochgeladen werden ({msg}).', { msg: e }));
  };
  const localVid = coachUrl ?? demoVideoFor(ex.name);
  const localImg = LOCAL_DEMO_IMAGES[ex.exercise_id];
  const gifUrl = localImg
    ? `/exercises/${localImg}`
    : `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/exercise-gif?id=${ex.exercise_id}&res=180`;

  return createPortal((
    <div className="fixed inset-0 z-[80] overflow-y-auto adlr-fade-in" style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }} onClick={onClose}>
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="adlr-card p-6 max-w-md w-full" style={{ background: 'rgb(var(--surface-2))', border: '1px solid rgb(var(--adlr-gold) / 0.25)' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 className="text-lg font-bold text-white">{t(ex.name)}</h2>
            <p className="text-sm text-white/40 mt-0.5">{coachUrl ? (isCoach ? t('Dein Video') : t('Video von deinem Coach')) : t('Ausführung Demo')}</p>
          </div>
          <button onClick={onClose} className="adlr-tap text-white/40 hover:text-white/80"><X size={20} /></button>
        </div>
        <div className="rounded-xl flex items-center justify-center mb-4 overflow-hidden relative" style={{ background: (localVid || localImg) ? '#ffffff' : 'linear-gradient(180deg, rgb(var(--adlr-gold) / 0.06) 0%, rgba(0,0,0,0.3) 100%)', border: '1px solid rgb(var(--text) / 0.06)', minHeight: '280px' }}>
          {gifError ? (
            <div className="flex flex-col items-center gap-2 py-12">
              <Activity size={32} style={{ color: 'rgb(var(--adlr-gold))' }} />
              <p className="text-sm text-white/40">{t('Demo nicht verfügbar')}</p>
            </div>
          ) : (
            <>
              {gifLoading && (
                <div className="absolute flex flex-col items-center gap-3 py-12">
                  <Loader2 size={32} className="animate-spin" style={{ color: 'rgb(var(--adlr-gold))' }} />
                  <p className="text-sm text-white/40">{t('Lade Animation...')}</p>
                </div>
              )}
              {localVid ? (
                <>
                  <video
                    ref={videoRef}
                    src={localVid}
                    autoPlay
                    loop
                    muted
                    playsInline
                    preload="auto"
                    className="w-full h-auto"
                    style={{ maxHeight: '320px', objectFit: 'contain' }}
                    onLoadedData={() => { setGifLoading(false); tryPlay(); }}
                    onClick={tryPlay}
                    onError={() => { setGifLoading(false); setGifError(true); }}
                  />
                  {needsTap && (
                    <button onClick={tryPlay} className="adlr-tap absolute inset-0 flex items-center justify-center" aria-label={t('Animation abspielen')}>
                      <span className="w-16 h-16 rounded-full flex items-center justify-center shadow-xl" style={{ background: 'rgb(var(--adlr-gold))' }}>
                        <Play size={28} color="#000" fill="#000" />
                      </span>
                    </button>
                  )}
                </>
              ) : (
                <img src={gifUrl} alt={t(ex.name)} className="w-full h-auto" style={{ maxHeight: '320px', objectFit: 'contain' }} onLoad={() => setGifLoading(false)} onError={() => { setGifLoading(false); setGifError(true); }} />
              )}
            </>
          )}
        </div>
        {isCoach && (
          <div className="flex flex-wrap items-center gap-2 mb-4">
            {ex.trainer_id === profile?.id ? (
              <button onClick={() => setEditOwn(true)} className="adlr-tap flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold" style={{ background: 'rgb(var(--adlr-gold) / 0.15)', color: 'rgb(var(--adlr-gold))' }}>
                <Pencil size={13} /> {t('Übung bearbeiten')}
              </button>
            ) : !ex.trainer_id && (
              <>
                <label className="adlr-tap flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold cursor-pointer" style={{ background: 'rgb(var(--adlr-gold) / 0.15)', color: 'rgb(var(--adlr-gold))' }}>
                  {videoBusy ? <Loader2 size={13} className="animate-spin" /> : <Video size={13} />} {ownOverride ? t('Eigenes Video ersetzen') : t('Eigenes Video hochladen')}
                  <input type="file" accept="video/*" className="hidden" disabled={videoBusy} onChange={(e) => uploadOwnVideo(e.target.files?.[0])} />
                </label>
                {ownOverride && (
                  <button onClick={async () => { if (!profile) return; setVideoBusy(true); await clearLibraryVideo(profile.id, ex.name); setVideoBusy(false); }} className="adlr-tap flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs bg-white/5 text-white/60">
                    <Trash2 size={13} /> {t('Animation statt Video')}
                  </button>
                )}
              </>
            )}
            <p className="w-full text-[11px] text-white/35">{t('Deine Klienten sehen dein Video statt der Animation.')}</p>
            {videoErr && <p className="w-full text-xs text-red-400">{videoErr}</p>}
          </div>
        )}
        {editOwn && <CoachExerciseSheet initial={ex} onClose={() => setEditOwn(false)} />}
        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="bg-inset rounded-lg p-2.5 text-center">
            <Target size={14} className="mx-auto mb-1" style={{ color: 'rgb(var(--adlr-gold))' }} />
            <p className="text-xs text-white/40">{t('Muskel')}</p>
            <p className="text-xs text-white/80 font-medium mt-0.5">{t(ex.muscle_group)}</p>
          </div>
          <div className="bg-inset rounded-lg p-2.5 text-center">
            <Activity size={14} className="mx-auto mb-1" style={{ color: 'rgb(var(--adlr-gold))' }} />
            <p className="text-xs text-white/40">{t('Equipment')}</p>
            <p className="text-xs text-white/80 font-medium mt-0.5">{t(ex.equipment)}</p>
          </div>
          <div className="bg-inset rounded-lg p-2.5 text-center">
            <Clock size={14} className="mx-auto mb-1" style={{ color: 'rgb(var(--adlr-gold))' }} />
            <p className="text-xs text-white/40">{t('Tempo')}</p>
            <p className="text-xs text-white/80 font-medium mt-0.5">{/\d/.test(ex.tempo) ? ex.tempo : t(`tempo|${ex.tempo}`)}</p>
          </div>
        </div>
        {ex.cues.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wide" style={{ color: 'rgb(var(--adlr-gold))' }}>{t('Ausführungshinweise')}</p>
            {ex.cues.map((cue, i) => (
              <div key={i} className="flex items-start gap-2.5 rounded-lg px-3 py-2 transition-all" style={i === step ? { background: 'rgb(var(--adlr-gold) / 0.1)', border: '1px solid rgb(var(--adlr-gold) / 0.3)' } : { background: 'rgb(var(--text) / 0.03)', border: '1px solid transparent' }}>
                <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-all mt-0.5" style={i === step ? { background: 'rgb(var(--adlr-gold))', color: '#000' } : { background: 'rgb(var(--text) / 0.1)', color: 'rgb(var(--text) / 0.4)' }}>{i + 1}</span>
                <span className="text-sm leading-relaxed" style={i === step ? { color: 'rgb(var(--text))' } : { color: 'rgb(var(--text) / 0.5)' }}>{t(cue)}</span>
              </div>
            ))}
          </div>
        )}
        </div>
      </div>
    </div>
  ), document.body);
}
