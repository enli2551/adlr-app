// Local-timezone date key (YYYY-MM-DD).
// IMPORTANT: do NOT use `new Date(x).toISOString().slice(0, 10)` for calendar keys —
// toISOString() converts to UTC and shifts the date by the timezone offset
// (e.g. -1 day in Austria/UTC+2), which misaligns workout completions with the
// day they actually happened. This formats in the user's local timezone instead.
export function localDateKey(d: Date | string): string {
  const x = typeof d === 'string' ? new Date(d) : d;
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, '0');
  const day = String(x.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
