import type { Profile } from '@/lib/types';
import { t, fmtNum } from '@/lib/i18n';

// Activity factor from the client's OWN onboarding answers (not a fixed guess):
// job type as the base (PAL-style) + ~0.05 per weekly training day.
const JOB_BASE: Record<string, number> = { Sitzend: 1.2, Gemischt: 1.3, Aktiv: 1.45 };
const PER_TRAINING_DAY = 0.05;

export interface KcalSuggestion {
  kcal: number;
  explain: string; // shown to the trainer, e.g. "Sitzend · 3 Trainingstage · −500 (Abnehmen)"
}

/**
 * Suggested daily calorie target: Mifflin-St Jeor BMR × activity factor from the
 * intake (job type + training days), then −500 kcal for fat loss or +250 for muscle
 * gain. Fat loss wins when both goals are chosen. Rounded to 50 kcal, with a floor
 * of 1200 (women) / 1500 (men). Returns null if age/height/weight are missing.
 */
export function suggestKcalTarget(
  p: Pick<Profile, 'age' | 'height_cm' | 'weight_kg' | 'gender' | 'intake'>,
  trainingDaysOverride?: number,
): KcalSuggestion | null {
  const w = p.weight_kg, h = p.height_cm, a = p.age;
  if (!w || !h || !a) return null;
  const female = (p.gender ?? '').toLowerCase().startsWith('frau');
  const bmr = 10 * w + 6.25 * h - 5 * a + (female ? -161 : 5);

  const job = p.intake?.jobType ?? 'Sitzend';
  const days = trainingDaysOverride ?? p.intake?.trainingDays?.length ?? 0;
  const factor = Math.min(1.9, (JOB_BASE[job] ?? 1.2) + days * PER_TRAINING_DAY);
  const tdee = bmr * factor;

  const goals = p.intake?.goals ?? [];
  let adj = 0, goalTxt = t('Halten');
  if (goals.includes('Gewicht reduzieren')) { adj = -500; goalTxt = t('−500 (Abnehmen)'); }
  else if (goals.includes('Muskeln aufbauen')) { adj = 250; goalTxt = t('+250 (Aufbau)'); }

  const floor = female ? 1200 : 1500;
  const kcal = Math.max(floor, Math.round((tdee + adj) / 50) * 50);
  return {
    kcal,
    explain: `${JOB_BASE[job] ? t(job) : t('Sitzend (angenommen)')} · ${t('{n} Trainingstage', { n: days })} · ×${fmtNum(Number(factor.toFixed(2)))} · ${goalTxt}`,
  };
}

export const fmtKcal = (n: number) => `${fmtNum(n)} kcal`;
