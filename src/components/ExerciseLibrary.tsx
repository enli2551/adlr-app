import { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Search, Dumbbell, Play, Plus, X, Loader2, Activity, Target, Clock } from 'lucide-react';
import { fetchExercises, MUSCLE_GROUPS, type ExerciseRow } from '@/lib/exercises';
import { useAsyncData } from '@/lib/useAsyncData';

interface Props {
  onAdd: (ex: ExerciseRow) => void;
  onDemo: (ex: ExerciseRow) => void;
  canAdd: boolean;
  noSelectionHint?: string;
}

export function ExerciseLibrary({ onAdd, onDemo, canAdd, noSelectionHint }: Props) {
  const [hint, setHint] = useState(false);
  const { data: exercises, loading } = useAsyncData(fetchExercises, []);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('Alle');

  const filtered = useMemo(() => {
    if (!exercises) return [];
    const q = search.toLowerCase();
    return exercises.filter((s) => {
      const matchGroup = filter === 'Alle' || s.muscle_group === filter;
      const matchSearch = !q || s.name.toLowerCase().includes(q);
      return matchGroup && matchSearch;
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
          ÜBUNGSBIBLIOTHEK · {exercises?.length ?? 0} Übungen
        </p>
        <div className="relative mb-3">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Übung suchen..."
            className="w-full bg-inset border border-white/10 rounded-xl pl-9 pr-3 py-2.5 text-sm text-white placeholder-white/30 outline-none"
          />
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {['Alle', ...MUSCLE_GROUPS].map((g) => (
            <button
              key={g}
              onClick={() => setFilter(g)}
              className="adlr-tap px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap border transition-all shrink-0"
              style={filter === g
                ? { background: 'rgb(var(--adlr-gold))', color: '#000', borderColor: 'rgb(var(--adlr-gold))' }
                : { background: 'rgb(var(--text) / 0.05)', color: 'rgb(var(--text) / 0.5)', borderColor: 'rgb(var(--text) / 0.08)' }}
            >
              {g}
            </button>
          ))}
        </div>
      </div>
      <div className="max-h-80 overflow-y-auto divide-y" style={{ divideColor: 'rgb(var(--text) / 0.05)' }}>
        {filtered.map((s) => (
          <div key={s.id} className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.03] transition-colors">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgb(var(--adlr-gold) / 0.1)' }}>
              <Dumbbell size={15} style={{ color: 'rgb(var(--adlr-gold))' }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white">{s.name}</p>
              <p className="text-xs text-white/40">{s.muscle_group} · {s.default_sets}×{s.default_reps} · {s.equipment}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {hasDemo(s.exercise_id) && (
                <button
                  onClick={() => onDemo(s)}
                  className="adlr-tap flex items-center gap-1 text-xs"
                  style={{ color: 'rgb(var(--text) / 0.35)' }}
                >
                  <Play size={11} /> Demo
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
          <p className="text-sm text-white/25 text-center py-8">Keine Treffer.</p>
        )}
      </div>
      {hint && (
        <div className="px-4 py-2.5 text-xs text-center adlr-fade-in" style={{ background: 'rgb(var(--adlr-gold) / 0.08)', color: 'rgb(var(--adlr-gold))', borderTop: '1px solid rgb(var(--adlr-gold) / 0.15)' }}>
          {noSelectionHint ?? 'Wähle zuerst einen Trainingstag oben aus'}
        </div>
      )}
    </div>
  );
}

// Locally bundled, self-owned exercise images (by ExerciseDB id) — offline, no API.
export const LOCAL_DEMO_IMAGES: Record<string, string> = {
  '0102': 'kniebeuge.png',        // Kniebeugen
  '0032': 'kreuzheben.png',       // Kreuzheben
  '0025': 'bankdruecken.png',     // Bankdrücken
  '0086': 'schulterdruecken.png', // Schulterdrücken
  '0652': 'klimmzug.png',         // Klimmzüge
  '0027': 'langhantelrudern.png', // Rudern
  '0054': 'ausfallschritt.png',   // Ausfallschritte
  '0031': 'bizeps-curl.png',      // Bizeps Curls
  '0241': 'trizeps-druecken.png', // Trizepsdrücken
  '0464': 'plank.png',            // Plank
  // Batch 2
  '0047': 'schraegbankdruecken.png', // Schrägbankdrücken
  '0673': 'latzug.png',              // Latzug
  '0861': 'sitzrudern.png',          // Sitzrudern (Kabel)
  '0739': 'beinpresse.png',          // Beinpresse
  '0585': 'beinstrecker.png',        // Beinstrecker
  '0496': 'beinbeuger.png',          // Beinbeuger
  '0088': 'wadenheben.png',          // Wadenheben
  '0417': 'wadenheben.png',          // Stehendes Wadenheben
  '0178': 'seitheben.png',           // Seitheben
  '0188': 'kabel-fliegende.png',     // Cable Fly
  '1269': 'kabel-fliegende.png',     // Cable Crossover
  '0001': 'crunches.png',            // 3/4 Sit-up (bodyweight ab curl)
  // Batch 3
  '0289': 'kurzhantel-bankdruecken.png',    // Kurzhantel Bankdrücken
  '0290': 'kurzhantel-schulterdruecken.png',// Kurzhantel Bank Sitz Drücken
  '0287': 'kurzhantel-schulterdruecken.png',// Arnold Press
  '0293': 'kurzhantel-rudern.png',          // Kurzhantel Rudern
  '0085': 'rumaenisches-kreuzheben.png',    // Rumänisches Kreuzheben
  '1409': 'hip-thrust.png',                 // Hip Thrusts
  '0484': 'hip-thrust.png',                 // Hüftheben (Knie gebeugt)
  '0154': 'reverse-fly.png',                // Reverse Fly
  '0165': 'hammercurls.png',                // Hammer Curls
  '0814': 'dips.png',                       // Trizeps Dips
  // Batch 4
  '0576': 'brustpresse-maschine.png',       // Brustpresse (Maschine)
  // Lat-Zug Varianten → gemeinsames Latzug-Bild
  '0198': 'latzug.png',                     // Kabel Latzug
  '0150': 'latzug.png',                     // Kabel Latzug (Stange)
  '0177': 'latzug.png',                     // Kabel Latzug (Seil)
  '0197': 'latzug.png',                     // Kabel Latzug (Pro Lat Bar)
  '0007': 'latzug.png',                     // Wechselnder Latzug
};

// Locally bundled animated demos (Vital Animations, licensed) — offline MP4 loops.
// Keyed by the app's exercise_id → Vital clip filename in /public/exercises-anim/.
// The Vital ids are their own numbering; matched here by exercise meaning, not id.
export const LOCAL_DEMO_VIDEOS: Record<string, string> = {
  '0003': '0053.mp4', // Air Bike ← air bike sprint
  '0102': '0054.mp4', // Kniebeugen ← barbell back squat
  '2809': '0055.mp4', // Langhantel Split Kniebeuge (V2) ← barbell bulgarian split squat
  '0024': '0056.mp4', // Frontkniebeugen ← barbell front squat
  '1409': '0057.mp4', // Hip Thrusts / Glute Bridges ← barbell hip thrust
  '0078': '0059.mp4', // Langhantel Hintere Ausfallschritte ← barbell reverse lunges
  '0085': '0060.mp4', // Rumänisches Kreuzheben ← barbell romanian deadlift
  '0228': '0061.mp4', // Cable Kickbacks ← cable leg kickback
  '0798': '0062.mp4', // Stationäres Fahrrad ← cycling
  '0410': '0063.mp4', // Kurzhantel Einbein Split Kniebeuge ← dumbbell bulgarian split squat
  '1760': '0064.mp4', // Kurzhantel Kelch-Kniebeuge ← dumbbell goblet squat
  '0534': '0064.mp4', // Kelch-Kniebeuge ← dumbbell goblet squat
  '1459': '0065.mp4', // Kurzhantel Rumänisches Kreuzheben ← dumbbell hip hinge
  '0371': '0066.mp4', // Kurzhantel Plyo Kniebeuge ← dumbbell jump squat
  '2331': '0067.mp4', // Crosstrainer ← elliptical hiit machine
  '2141': '0067.mp4', // Elliptical Crosstrainer ← elliptical hiit machine
  '0046': '0068.mp4', // Hackenschmidt Kniebeuge ← hack squat machine
  '1427': '0069.mp4', // Hüftabduktoren ← hip abduction machine
  '0549': '0072.mp4', // Kettlebell Swings ← kettlebell swing
  '0585': '0073.mp4', // Beinstrecker ← leg extension machine
  '0739': '0074.mp4', // Beinpresse ← leg press machine
  '0496': '0075.mp4', // Beinbeuger ← lying leg curl machine
  '0128': '0076.mp4', // Battle Ropes ← rope wave
  '0684': '0078.mp4', // Laufen (mit Gerät) ← run on treadmill
  '0091': '0080.mp4', // Langhantel Sitz Overhead Press ← seated overhead press
  '0431': '0081.mp4', // Kurzhantel Step-ups ← step-ups (weighted)
  '1684': '0081.mp4', // Step-ups ← step-ups (weighted)
  '2311': '0082.mp4', // Stepmill Laufen ← stepmill machine
  '0116': '0084.mp4', // Langhantel Steifbein Kreuzheben ← stiff-legged deadlift
  '0241': '0085.mp4', // Trizepsdrücken ← triceps pushdown (cable-rope)
  '0200': '0085.mp4', // Kabel Pushdown (Seil) ← triceps pushdown (cable-rope)
  '0685': '0086.mp4', // Laufen ← walk on treadmill
  '0287': '0087.mp4', // Arnold Press ← arnold press dumbbell
  '0086': '0088.mp4', // Schulterdrücken ← barbell overhead press standing
  '0119': '0089.mp4', // Upright Row ← barbell upright row
  '0120': '0089.mp4', // Langhantel Upright Row ← barbell upright row
  '0290': '0090.mp4', // Kurzhantel Bank Sitz Drücken ← dumbbell overhead press
  '0040': '0092.mp4', // Frontheben ← front raise (dumbbell)
  '0310': '0092.mp4', // Kurzhantel Frontheben ← front raise (dumbbell)
  '0192': '0095.mp4', // Kabel Einarmig Seitheben ← cable cross lateral raise
  '0178': '0096.mp4', // Seitheben ← lateral raises (dumbbell)
  '0334': '0096.mp4', // Kurzhantel Seitheben ← lateral raises (dumbbell)
  '0154': '0099.mp4', // Reverse Fly ← rear delt fly (reverse pec deck)
  '0225': '0100.mp4', // Kabel Stehend Crossover Reverse Fly ← rear delt cable fly
  '9051': '0051.mp4', // Pec Fly (Maschine) ← pec deck machine fly (custom id, see migration)
};

// True if the exercise has any local demo (animation preferred, else static image).
export function hasDemo(exerciseId: string): boolean {
  return !!(LOCAL_DEMO_VIDEOS[exerciseId] || LOCAL_DEMO_IMAGES[exerciseId]);
}

export function ExerciseDemoModal({ ex, onClose }: { ex: ExerciseRow; onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [gifLoading, setGifLoading] = useState(true);
  const [gifError, setGifError] = useState(false);

  useState(() => {
    if (ex.cues.length === 0) return;
    const interval = setInterval(() => setStep((s) => (s + 1) % ex.cues.length), 2000);
    return () => clearInterval(interval);
  });

  const localVid = LOCAL_DEMO_VIDEOS[ex.exercise_id];
  const localImg = LOCAL_DEMO_IMAGES[ex.exercise_id];
  const gifUrl = localImg
    ? `/exercises/${localImg}`
    : `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/exercise-gif?id=${ex.exercise_id}&res=180`;

  return createPortal((
    <div className="fixed inset-0 z-50 overflow-y-auto adlr-fade-in" style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }} onClick={onClose}>
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="adlr-card p-6 max-w-md w-full" style={{ background: 'rgb(var(--surface-2))', border: '1px solid rgb(var(--adlr-gold) / 0.25)' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 className="text-lg font-bold text-white">{ex.name}</h2>
            <p className="text-sm text-white/40 mt-0.5">Ausführung Demo</p>
          </div>
          <button onClick={onClose} className="adlr-tap text-white/40 hover:text-white/80"><X size={20} /></button>
        </div>
        <div className="rounded-xl flex items-center justify-center mb-4 overflow-hidden relative" style={{ background: (localVid || localImg) ? '#ffffff' : 'linear-gradient(180deg, rgb(var(--adlr-gold) / 0.06) 0%, rgba(0,0,0,0.3) 100%)', border: '1px solid rgb(var(--text) / 0.06)', minHeight: '280px' }}>
          {gifError ? (
            <div className="flex flex-col items-center gap-2 py-12">
              <Activity size={32} style={{ color: 'rgb(var(--adlr-gold))' }} />
              <p className="text-sm text-white/40">Demo nicht verfügbar</p>
            </div>
          ) : (
            <>
              {gifLoading && (
                <div className="absolute flex flex-col items-center gap-3 py-12">
                  <Loader2 size={32} className="animate-spin" style={{ color: 'rgb(var(--adlr-gold))' }} />
                  <p className="text-sm text-white/40">Lade Animation...</p>
                </div>
              )}
              {localVid ? (
                <video
                  src={`/exercises-anim/${localVid}`}
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="w-full h-auto"
                  style={{ maxHeight: '320px', objectFit: 'contain' }}
                  onLoadedData={() => setGifLoading(false)}
                  onError={() => { setGifLoading(false); setGifError(true); }}
                />
              ) : (
                <img src={gifUrl} alt={ex.name} className="w-full h-auto" style={{ maxHeight: '320px', objectFit: 'contain' }} onLoad={() => setGifLoading(false)} onError={() => { setGifLoading(false); setGifError(true); }} />
              )}
            </>
          )}
        </div>
        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="bg-inset rounded-lg p-2.5 text-center">
            <Target size={14} className="mx-auto mb-1" style={{ color: 'rgb(var(--adlr-gold))' }} />
            <p className="text-xs text-white/40">Muskel</p>
            <p className="text-xs text-white/80 font-medium mt-0.5">{ex.muscle_group}</p>
          </div>
          <div className="bg-inset rounded-lg p-2.5 text-center">
            <Activity size={14} className="mx-auto mb-1" style={{ color: 'rgb(var(--adlr-gold))' }} />
            <p className="text-xs text-white/40">Equipment</p>
            <p className="text-xs text-white/80 font-medium mt-0.5">{ex.equipment}</p>
          </div>
          <div className="bg-inset rounded-lg p-2.5 text-center">
            <Clock size={14} className="mx-auto mb-1" style={{ color: 'rgb(var(--adlr-gold))' }} />
            <p className="text-xs text-white/40">Tempo</p>
            <p className="text-xs text-white/80 font-medium mt-0.5">{ex.tempo}</p>
          </div>
        </div>
        {ex.cues.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wide" style={{ color: 'rgb(var(--adlr-gold))' }}>Ausführungshinweise</p>
            {ex.cues.map((cue, i) => (
              <div key={i} className="flex items-start gap-2.5 rounded-lg px-3 py-2 transition-all" style={i === step ? { background: 'rgb(var(--adlr-gold) / 0.1)', border: '1px solid rgb(var(--adlr-gold) / 0.3)' } : { background: 'rgb(var(--text) / 0.03)', border: '1px solid transparent' }}>
                <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-all mt-0.5" style={i === step ? { background: 'rgb(var(--adlr-gold))', color: '#000' } : { background: 'rgb(var(--text) / 0.1)', color: 'rgb(var(--text) / 0.4)' }}>{i + 1}</span>
                <span className="text-sm leading-relaxed" style={i === step ? { color: 'rgb(var(--text))' } : { color: 'rgb(var(--text) / 0.5)' }}>{cue}</span>
              </div>
            ))}
          </div>
        )}
        </div>
      </div>
    </div>
  ), document.body);
}
