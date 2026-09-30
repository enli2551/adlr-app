import { useMemo, useState } from 'react';
import { ChevronDown, Trophy } from 'lucide-react';
import type { PersonalRecord } from '@/lib/types';
import { fetchExercises } from '@/lib/exercises';
import { useAsyncData } from '@/lib/useAsyncData';
import { t, fmtDate as fmtD } from '@/lib/i18n';

interface Props {
  prs: PersonalRecord[];
  initiallyOpen?: boolean;
  visible?: number; // rows before "Alle anzeigen"
}

interface Best {
  key: string;
  name: string;
  gym: string | null;
  best: PersonalRecord;
  prevWeight: number | null; // previous best before the current one
  count: number;
}

const MAX_SANE_REPS = 100;

/**
 * One row per exercise (and Studio for machine PRs) with the current best, when it
 * was set and how much it improved over the previous best. Cardio and obviously
 * broken entries (typos like 1212 reps, 0 kg) are left out.
 */
export default function PersonalRecords({ prs, initiallyOpen = false, visible = 6 }: Props) {
  const [open, setOpen] = useState(initiallyOpen);
  const [showAll, setShowAll] = useState(false);
  const { data: lib } = useAsyncData(fetchExercises, []);
  const cardio = useMemo(() => new Set((lib ?? []).filter((e) => e.muscle_group === 'Cardio').map((e) => e.name)), [lib]);

  const bests = useMemo<Best[]>(() => {
    const groups = new Map<string, PersonalRecord[]>();
    for (const p of prs) {
      if (cardio.has(p.exercise_name)) continue;
      if (!(p.weight_kg > 0) || p.reps <= 0 || p.reps > MAX_SANE_REPS) continue;
      const key = `${p.exercise_name}|${p.gym ?? ''}`;
      const arr = groups.get(key) ?? [];
      arr.push(p);
      groups.set(key, arr);
    }
    return [...groups.entries()].map(([key, arr]) => {
      const byWeight = [...arr].sort((a, b) => b.weight_kg - a.weight_kg || b.reps - a.reps);
      const best = byWeight[0];
      const earlier = arr.filter((p) => p.achieved_at < best.achieved_at);
      const prevWeight = earlier.length ? Math.max(...earlier.map((p) => p.weight_kg)) : null;
      return { key, name: best.exercise_name, gym: best.gym ?? null, best, prevWeight, count: arr.length };
    }).sort((a, b) => b.best.achieved_at.localeCompare(a.best.achieved_at));
  }, [prs, cardio]);

  const latest = bests[0];
  const rows = showAll ? bests : bests.slice(0, visible);
  const fmtDate = (d: string) => fmtD(d, { day: '2-digit', month: '2-digit', year: '2-digit' });

  return (
    <div>
      <button onClick={() => setOpen(!open)} className="adlr-tap w-full flex items-center justify-between text-left">
        <div className="min-w-0">
          <p className="text-sm font-medium text-white/80 flex items-center gap-2"><Trophy size={16} className="text-adlr-gold" /> {t('Personal Records')}</p>
          <p className="text-xs text-white/40 mt-0.5 truncate">
            {bests.length === 0 ? t('Noch keine Rekorde') : `${t('{n} Übungen', { n: bests.length })} · ${t('zuletzt')}: ${t(latest.name)} ${latest.best.weight_kg} kg`}
          </p>
        </div>
        <ChevronDown size={17} className="shrink-0 text-white/35 transition-transform" style={{ transform: open ? 'rotate(180deg)' : 'none' }} />
      </button>

      {open && bests.length > 0 && (
        <div className="mt-3 space-y-1.5 adlr-fade-in">
          {rows.map((b) => {
            const delta = b.prevWeight != null ? Math.round((b.best.weight_kg - b.prevWeight) * 10) / 10 : null;
            return (
              <div key={b.key} className="flex items-center gap-3 rounded-xl px-3 py-2.5" style={{ background: 'rgb(var(--text) / 0.03)' }}>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-white/85 truncate">{t(b.name)}</p>
                  <p className="text-[11px] text-white/40">
                    {fmtDate(b.best.achieved_at)}{b.gym ? ` · ${b.gym}` : ''}{b.count > 1 ? ` · ${t('{n}× verbessert', { n: b.count })}` : ''}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-adlr-gold">{b.best.weight_kg} kg × {b.best.reps}</p>
                  {delta != null && delta > 0 && <p className="text-[11px] text-green-500">+{delta} kg</p>}
                </div>
              </div>
            );
          })}
          {bests.length > visible && (
            <button onClick={() => setShowAll(!showAll)} className="adlr-tap w-full pt-1 text-xs font-medium text-adlr-gold">
              {showAll ? t('Weniger anzeigen') : t('Alle {n} anzeigen', { n: bests.length })}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
