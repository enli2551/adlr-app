import { useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Trophy, X, Truck, TramFront, Ship, Bus, Tractor, Forklift, Caravan, Car, Piano, Refrigerator } from 'lucide-react';
import type { ComparisonIcon } from '@/lib/workoutSummary';
import type { WorkoutCompletion } from '@/lib/types';
import type { SessionSummary } from '@/lib/workoutSummary';
import { workoutNumber, trainedDateKeys, volumeComparison, fmtKg } from '@/lib/workoutSummary';
import { fmtDuration, monthName } from '@/lib/reportStats';
import { localDateKey } from '@/lib/dates';
import { t, fmtDate, fmtNum } from '@/lib/i18n';

interface Props {
  summary: SessionSummary;
  allCompletions: WorkoutCompletion[]; // whole history (incl. this one) for counters/calendar
  mode: 'finished' | 'history';
  newPRs?: { exercise_name: string; weight_kg: number; reps: number; gym?: string | null }[];
  milestoneMsg?: string | null;
  onClose: () => void;
}

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const CARD_STYLE = { background: 'rgb(var(--text) / 0.04)', border: '1px solid rgb(var(--text) / 0.08)' };

// Full-screen, swipeable post-workout recap (also opened from the Trainings-Historie).
export default function WorkoutSummary({ summary, allCompletions, mode, newPRs = [], milestoneMsg, onClose }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(0);
  const when = new Date(summary.completion.completed_at);
  const nth = workoutNumber(summary.completion, allCompletions);
  const trained = useMemo(() => trainedDateKeys(allCompletions), [allCompletions]);

  const cards: { key: string; node: JSX.Element }[] = [
    { key: 'overview', node: <OverviewCard summary={summary} newPRs={newPRs} milestoneMsg={milestoneMsg} /> },
  ];
  if (summary.exercises.length > 0) cards.push({ key: 'exercises', node: <ExercisesCard summary={summary} /> });
  if (summary.radar.some((r) => r.sets > 0)) cards.push({ key: 'muscles', node: <MusclesCard summary={summary} /> });
  cards.push({ key: 'week', node: <WeekCard ref0={when} trained={trained} /> });
  cards.push({ key: 'month', node: <MonthCard ref0={when} trained={trained} allCompletions={allCompletions} /> });
  if (summary.volumeKg > 0) cards.push({ key: 'volume', node: <VolumeCard kg={summary.volumeKg} /> });

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    setPage(Math.round(el.scrollLeft / el.clientWidth));
  };
  const goTo = (i: number) => scroller.current?.scrollTo({ left: i * scroller.current.clientWidth, behavior: 'smooth' });

  return createPortal(
    <div className="fixed inset-0 z-[60] flex flex-col adlr-fade-in" style={{ background: 'rgb(var(--adlr-black))' }}>
      <div className="max-w-md w-full mx-auto flex flex-col flex-1 min-h-0" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="relative px-5 pt-6 pb-4 text-center">
          {mode === 'history' && (
            <button onClick={onClose} aria-label={t('Schließen')} className="adlr-tap absolute right-4 top-5 p-2 rounded-full bg-white/5 text-white/60">
              <X size={18} />
            </button>
          )}
          <h2 className="text-2xl font-bold adlr-gold-text">{mode === 'finished' ? t('Stark gemacht!') : t(summary.name)}</h2>
          <p className="text-sm text-white/60 mt-1">
            {mode === 'finished'
              ? t('Das ist dein {n}. Training', { n: nth })
              : `${fmtDate(when, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · ${t('{n}. Training', { n: nth })}`}
            {summary.completion.gym ? ` · ${summary.completion.gym}` : ''}
          </p>
        </div>

        <div ref={scroller} onScroll={onScroll} className="flex-1 min-h-0 flex overflow-x-auto snap-x snap-mandatory" style={{ scrollbarWidth: 'none' }}>
          {cards.map((c) => (
            <div key={c.key} className="w-full shrink-0 snap-center px-5 flex">
              <div className="flex-1 rounded-3xl p-6 overflow-y-auto flex flex-col" style={CARD_STYLE}>
                {c.node}
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-center gap-2 py-4">
          {cards.map((c, i) => (
            <button
              key={c.key}
              onClick={() => goTo(i)}
              aria-label={t('Karte {n}', { n: i + 1 })}
              className="w-2 h-2 rounded-full transition-all"
              style={{ background: i === page ? 'rgb(var(--adlr-gold))' : 'rgb(var(--text) / 0.2)', transform: i === page ? 'scale(1.25)' : 'none' }}
            />
          ))}
        </div>

        <div className="px-5 pb-5">
          <button
            onClick={onClose}
            className="adlr-tap w-full py-3.5 rounded-xl font-semibold text-sm"
            style={{ background: 'linear-gradient(135deg, rgb(var(--adlr-gold)), rgb(var(--adlr-gold-dim)))', color: '#000' }}
          >
            {mode === 'finished' ? t('Fertig') : t('Schließen')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-2xl font-bold text-white">{value}</p>
      <p className="text-xs text-white/50 mt-0.5">{t(label)}</p>
    </div>
  );
}

function OverviewCard({ summary, newPRs, milestoneMsg }: { summary: SessionSummary; newPRs: Props['newPRs'] & {}; milestoneMsg?: string | null }) {
  return (
    <div className="my-auto">
      <p className="text-xl font-bold text-white mb-6">{t(summary.name)}</p>
      <div className="grid grid-cols-2 gap-y-6 gap-x-4">
        <Stat label={t('Dauer')} value={summary.durationMin != null ? fmtDuration(summary.durationMin) : '—'} />
        <Stat label={t('Volumen')} value={fmtKg(summary.volumeKg)} />
        <Stat label={t('Übungen')} value={String(summary.exercises.length)} />
        <Stat label={t('Sätze')} value={String(summary.sets)} />
      </div>
      {milestoneMsg && (
        <div className="mt-6 px-4 py-3 rounded-2xl flex items-center gap-2.5" style={{ background: 'rgb(var(--adlr-gold) / 0.14)', border: '1px solid rgb(var(--adlr-gold) / 0.35)' }}>
          <Trophy size={18} className="text-adlr-gold shrink-0" />
          <p className="text-sm text-white font-semibold">{milestoneMsg}</p>
        </div>
      )}
      {newPRs.length > 0 && (
        <div className="mt-3 px-4 py-3 rounded-2xl adlr-gold-border" style={{ background: 'rgb(var(--adlr-gold) / 0.10)' }}>
          <p className="text-xs text-adlr-gold uppercase tracking-[0.2em] mb-1.5">{t('Neuer Rekord')}</p>
          {newPRs.map((pr, i) => (
            <p key={i} className="text-sm text-white font-semibold">{t(pr.exercise_name)}: {pr.weight_kg} kg × {pr.reps}{pr.gym ? <span className="text-white/50 font-normal"> · {pr.gym}</span> : null}</p>
          ))}
        </div>
      )}
    </div>
  );
}

function ExercisesCard({ summary }: { summary: SessionSummary }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-white/40 mb-4">{t('Übungen')}</p>
      <div className="space-y-3.5">
        {summary.exercises.map((ex) => (
          <div key={ex.name} className="flex items-baseline gap-3">
            <span className="text-lg font-bold text-adlr-gold w-9 shrink-0">{ex.sets}×</span>
            <div className="min-w-0">
              <p className="text-base font-medium text-white leading-snug">{t(ex.name)}</p>
              {ex.cardio ? (
                <p className="text-xs text-white/45 mt-0.5">{ex.cardio.minutes} min{ex.cardio.km > 0 ? ` · ${fmtNum(ex.cardio.km)} km` : ''}</p>
              ) : ex.best && <p className="text-xs text-white/45 mt-0.5">{t('Bester Satz')}: {ex.best.weight_kg} kg × {ex.best.reps}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MusclesCard({ summary }: { summary: SessionSummary }) {
  // Polar "rose": one wedge per muscle axis, radius ∝ sets (reads well even when
  // only one or two groups were trained, unlike a radar polygon).
  const n = summary.radar.length;
  const max = Math.max(1, ...summary.radar.map((r) => r.sets));
  const cx = 150, cy = 140, R = 90, half = Math.PI / n;
  const at = (ang: number, r: number) => `${(cx + r * Math.cos(ang)).toFixed(1)},${(cy + r * Math.sin(ang)).toFixed(1)}`;
  const angle = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  return (
    <div className="my-auto">
      <p className="text-xs uppercase tracking-wider text-white/40 mb-2">{t('Muskelgruppen · Sätze')}</p>
      <svg viewBox="0 0 300 280" className="w-full">
        {[0.5, 1].map((f) => (
          <circle key={f} cx={cx} cy={cy} r={R * f} fill="none" stroke="rgb(var(--text) / 0.08)" />
        ))}
        {summary.radar.map((_, i) => (
          <line key={i} x1={cx} y1={cy} x2={at(angle(i) - half, R).split(',')[0]} y2={at(angle(i) - half, R).split(',')[1]} stroke="rgb(var(--text) / 0.08)" />
        ))}
        {summary.radar.map((r, i) => {
          if (r.sets === 0) return null;
          const rr = Math.max(14, (r.sets / max) * R);
          const a0 = angle(i) - half + 0.03, a1 = angle(i) + half - 0.03;
          return (
            <path
              key={r.axis}
              d={`M${cx},${cy} L${at(a0, rr)} A${rr},${rr} 0 0 1 ${at(a1, rr)} Z`}
              fill="rgb(var(--adlr-gold) / 0.45)"
              stroke="rgb(var(--adlr-gold))"
              strokeWidth={1.5}
              strokeLinejoin="round"
            />
          );
        })}
        {summary.radar.map((r, i) => {
          const [x, y] = at(angle(i), R + 26).split(',').map(Number);
          return (
            <text key={r.axis} x={x} y={y} textAnchor="middle" dominantBaseline="middle" fontSize="12" fill={r.sets > 0 ? 'rgb(var(--text) / 0.85)' : 'rgb(var(--text) / 0.35)'}>
              {t(r.axis)}{r.sets > 0 ? ` · ${r.sets}` : ''}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

function WeekCard({ ref0, trained }: { ref0: Date; trained: Set<string> }) {
  const dow = ref0.getDay() === 0 ? 6 : ref0.getDay() - 1;
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(ref0);
    d.setDate(ref0.getDate() - dow + i);
    return localDateKey(d);
  });
  const count = days.filter((k) => trained.has(k)).length;
  return (
    <div className="my-auto">
      <p className="text-xs uppercase tracking-wider text-white/40 mb-6">{t('Diese Woche')}</p>
      <div className="grid grid-cols-7 gap-1 text-center mb-2">
        {WEEKDAYS.map((w) => <span key={w} className="text-xs text-white/50">{t(w)}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-1 place-items-center py-3 rounded-full" style={{ background: 'rgb(var(--text) / 0.05)' }}>
        {days.map((k) => (
          trained.has(k) ? (
            <span key={k} className="w-9 h-9 rounded-full flex items-center justify-center text-black font-bold" style={{ background: 'rgb(var(--adlr-gold))' }}>✓</span>
          ) : (
            <span key={k} className="w-4 h-4 rounded-full" style={{ background: 'rgb(var(--text) / 0.12)' }} />
          )
        ))}
      </div>
      <p className="text-lg font-semibold text-white mt-6">
        {count === 1 ? t('Du hast diese Woche einmal trainiert.') : t('Du hast diese Woche {n}-mal trainiert.', { n: count })}
      </p>
    </div>
  );
}

function MonthCard({ ref0, trained, allCompletions }: { ref0: Date; trained: Set<string>; allCompletions: WorkoutCompletion[] }) {
  const y = ref0.getFullYear(), m = ref0.getMonth();
  const count = allCompletions.filter((c) => { const d = new Date(c.completed_at); return d.getFullYear() === y && d.getMonth() === m; }).length;
  const first = new Date(y, m, 1);
  const offset = first.getDay() === 0 ? 6 : first.getDay() - 1;
  const len = new Date(y, m + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(offset).fill(null), ...Array.from({ length: len }, (_, i) => i + 1)];
  return (
    <div className="my-auto">
      <p className="text-3xl font-bold text-white text-center">{t(count === 1 ? '{n} Training' : '{n} Trainings', { n: count })}</p>
      <p className="text-sm text-white/60 text-center mb-5">{t('im {month}', { month: monthName(m) })}</p>
      <div className="grid grid-cols-7 gap-1.5 text-center">
        {WEEKDAYS.map((w) => <span key={w} className="text-[11px] text-white/40 uppercase">{t(w)}</span>)}
        {cells.map((d, i) => {
          if (d == null) return <span key={i} />;
          const on = trained.has(localDateKey(new Date(y, m, d)));
          return (
            <span
              key={i}
              className="aspect-square rounded-full flex items-center justify-center text-xs font-medium"
              style={on ? { background: 'rgb(var(--adlr-gold))', color: '#000' } : { background: 'rgb(var(--text) / 0.05)', color: 'rgb(var(--text) / 0.5)' }}
            >
              {d}
            </span>
          );
        })}
      </div>
    </div>
  );
}

const COMPARISON_ICONS: Record<ComparisonIcon, typeof Car> = {
  truck: Truck, tram: TramFront, ship: Ship, bus: Bus, tractor: Tractor,
  forklift: Forklift, caravan: Caravan, car: Car, piano: Piano, fridge: Refrigerator,
};

function VolumeCard({ kg }: { kg: number }) {
  const cmp = volumeComparison(kg);
  const Icon = cmp ? COMPARISON_ICONS[cmp.icon] : null;
  const shown = cmp ? Math.min(cmp.count, 5) : 0;
  return (
    <div className="my-auto text-center">
      <p className="text-base font-semibold text-white/80">{t('Du hast insgesamt bewegt:')}</p>
      <p className="text-5xl font-bold adlr-gold-text my-4">{fmtKg(kg)}</p>
      {cmp && <p className="text-base text-white/70">{cmp.text}</p>}
      {Icon && (
        <div className="mt-8 flex flex-col items-center">
          <div
            className="w-36 h-36 rounded-full flex items-center justify-center adlr-pop"
            style={{ background: 'radial-gradient(circle, rgb(var(--adlr-gold) / 0.22), rgb(var(--adlr-gold) / 0.04) 70%)', border: '1px solid rgb(var(--adlr-gold) / 0.3)' }}
          >
            <Icon size={72} strokeWidth={1.4} className="text-adlr-gold" />
          </div>
          {shown >= 2 && (
            <div className="flex items-center gap-2 mt-4">
              {Array.from({ length: shown }, (_, i) => <Icon key={i} size={22} strokeWidth={1.6} className="text-adlr-gold/70" />)}
              {cmp!.count > shown && <span className="text-sm font-semibold text-adlr-gold/80">+{cmp!.count - shown}</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
