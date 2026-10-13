import type { Exercise } from '@/lib/types';
import { t } from '@/lib/i18n';

// Multi-week programs, rule based: a plan runs `weeks` weeks; each week can scale the volume
// (sets %), change the reps (±), the load (weight %) and the effort (RPE ±), or be a deload.
// The client's week is counted from the plan assignment (client_plans.assigned_at).

export interface WeekRule {
  week: number;          // 1-based
  deload?: boolean;
  sets_pct?: number;     // 100 = as written
  reps_delta?: number;
  weight_pct?: number;   // +2.5 = 2.5 % heavier than written
  rpe_delta?: number;    // +1 = one RPE harder (RIR one lower)
}

export interface ProgramState { week: number; total: number; finished: boolean; rule: WeekRule | null }

const DAY = 86400000;

export function programState(weeks: number | null | undefined, rules: WeekRule[] | null | undefined, assignedAt: string | null | undefined, now = new Date()): ProgramState | null {
  if (!weeks || weeks < 2 || !assignedAt) return null;
  const start = new Date(assignedAt);
  start.setHours(0, 0, 0, 0);
  const raw = Math.floor((now.getTime() - start.getTime()) / (7 * DAY)) + 1;
  const week = Math.max(1, Math.min(weeks, raw));
  return { week, total: weeks, finished: raw > weeks, rule: (rules ?? []).find((r) => r.week === week) ?? null };
}

const roundLoad = (kg: number) => Math.round(kg * 2) / 2; // 0.5 kg steps

/** The plan day's exercises as prescribed for this program week. */
export function applyWeek(exercises: Exercise[], rule: WeekRule | null): Exercise[] {
  if (!rule) return exercises;
  const pct = rule.sets_pct ?? 100;
  const w = rule.weight_pct ?? 0;
  const dr = rule.reps_delta ?? 0;
  const de = rule.rpe_delta ?? 0;
  if (pct === 100 && !w && !dr && !de) return exercises;
  return exercises.map((ex) => {
    const sets = Math.max(1, Math.round((ex.sets ?? 1) * pct / 100));
    const scaleW = (kg?: number) => (kg != null && w ? roundLoad(kg * (1 + w / 100)) : kg);
    const addR = (r?: number) => (r != null && dr ? Math.max(1, r + dr) : r);
    let details = ex.set_details;
    if (details && details.length) {
      details = Array.from({ length: sets }, (_, i) => details![Math.min(i, details!.length - 1)]).map((d) => ({ weight_kg: scaleW(d.weight_kg), reps: addR(d.reps) }));
    }
    return {
      ...ex,
      sets,
      reps: addR(ex.reps),
      weight_kg: scaleW(ex.weight_kg),
      set_details: details,
      rpe: ex.rpe != null && de ? Math.max(5, Math.min(10, ex.rpe + de)) : ex.rpe,
      rir: ex.rir != null && de ? Math.max(0, Math.min(5, Math.round(ex.rir - de))) : ex.rir,
    };
  });
}

/** Short description of a week, e.g. "Deload · 60 % Sätze" or "+5 % Gewicht · +1 Wdh". */
export function ruleSummary(rule: WeekRule | null): string {
  if (!rule) return t('wie geschrieben');
  const parts: string[] = [];
  if (rule.deload) parts.push(t('Deload'));
  if (rule.sets_pct != null && rule.sets_pct !== 100) parts.push(t('{n} % Sätze', { n: rule.sets_pct }));
  if (rule.weight_pct) parts.push(t('{n} % Gewicht', { n: `${rule.weight_pct > 0 ? '+' : ''}${rule.weight_pct}` }));
  if (rule.reps_delta) parts.push(t('{n} Wdh', { n: `${rule.reps_delta > 0 ? '+' : ''}${rule.reps_delta}` }));
  if (rule.rpe_delta) parts.push(`RPE ${rule.rpe_delta > 0 ? '+' : ''}${rule.rpe_delta}`);
  return parts.length ? parts.join(' · ') : t('wie geschrieben');
}

export type ProgramPreset = 'linear' | 'volume' | 'flat';

/** Ready-made progressions: every 4th week (and a final 4-week block's last week) is a deload. */
export function presetRules(weeks: number, preset: ProgramPreset): WeekRule[] {
  const rules: WeekRule[] = [];
  let step = 0;
  for (let wk = 1; wk <= weeks; wk++) {
    const deload = preset !== 'flat' && wk % 4 === 0;
    if (deload) {
      rules.push({ week: wk, deload: true, sets_pct: 60, weight_pct: preset === 'linear' ? Math.max(-10, (step - 1) * 2.5 - 10) : -10, rpe_delta: -2 });
      continue;
    }
    if (preset === 'linear') rules.push({ week: wk, weight_pct: step * 2.5, rpe_delta: step > 0 ? Math.min(2, step * 0.5) : 0 });
    else if (preset === 'volume') rules.push({ week: wk, reps_delta: step, sets_pct: 100 + Math.min(step, 2) * 10 });
    else rules.push({ week: wk });
    step++;
  }
  return rules;
}
