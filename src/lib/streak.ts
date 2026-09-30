import { localDateKey } from '@/lib/dates';

// Weekly streak = consecutive calendar weeks in which the weekly training target
// (number of training days in the plan) was reached. Strength plans have rest days
// by design, so a DAILY streak is meaningless (it's ~always 1) — use this instead.
// The current week never breaks the streak (it's still in progress).

function weekBounds(ref: Date) {
  const dow = ref.getDay() === 0 ? 6 : ref.getDay() - 1;
  const start = new Date(ref);
  start.setDate(ref.getDate() - dow);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { startKey: localDateKey(start), endKey: localDateKey(end) };
}

export function weeklyStreak(completedAt: string[], trainingsPerWeek: number): number {
  if (trainingsPerWeek <= 0) return 0;
  const keys = completedAt.map((c) => localDateKey(c));
  const today = new Date();
  let weeks = 0;
  for (let w = 0; w < 104; w++) {
    const ref = new Date(today);
    ref.setDate(today.getDate() - w * 7);
    const { startKey, endKey } = weekBounds(ref);
    const n = keys.filter((k) => k >= startKey && k <= endKey).length;
    if (n >= trainingsPerWeek) weeks++;
    else if (w > 0) break;
  }
  return weeks;
}
