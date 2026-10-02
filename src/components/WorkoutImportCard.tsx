import { useRef, useState } from 'react';
import { Upload, Check, ChevronDown } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { fetchAll } from '@/lib/fetchAll';
import { t, fmtDate, fmtNum } from '@/lib/i18n';
import { parseWorkoutExport, type ImportResult, type ImportedWorkout } from '@/lib/workoutImport';

const SOURCE_LABEL = { hevy: 'Hevy', strong: 'Strong' } as const;
const DUP_WINDOW_MS = 2 * 60 * 1000;

type Stage =
  | { kind: 'idle' }
  | { kind: 'preview'; result: ImportResult; fresh: ImportedWorkout[]; dupes: number }
  | { kind: 'running'; done: number; total: number }
  | { kind: 'done'; workouts: number; sets: number; prs: number }
  | { kind: 'error'; msg: string };

/** Client Profil: import training history from Hevy / Strong CSV exports. */
export default function WorkoutImportCard({ clientId }: { clientId: string }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>({ kind: 'idle' });
  const [showMap, setShowMap] = useState(false);
  const runningRef = useRef(false); // a fast double tap must not import everything twice

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    try {
      const result = parseWorkoutExport(await f.text());
      if (result.workouts.length === 0) throw new Error('empty');
      // Re-importing the same file is safe: skip workouts that already exist (same end time ±2 min).
      const { data } = await fetchAll((a, b) => supabase.from('workout_completions').select('id, completed_at').eq('client_id', clientId).order('id').range(a, b));
      const existing = (data ?? []).map((c: { completed_at: string }) => new Date(c.completed_at).getTime());
      const fresh = result.workouts.filter((w) => !existing.some((e) => Math.abs(e - w.end.getTime()) < DUP_WINDOW_MS));
      setStage({ kind: 'preview', result, fresh, dupes: result.workouts.length - fresh.length });
    } catch {
      setStage({ kind: 'error', msg: t('Datei nicht erkannt. Bitte den CSV-Export aus Hevy oder Strong wählen.') });
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  const run = async (fresh: ImportedWorkout[]) => {
    if (runningRef.current) return;
    runningRef.current = true;
    setStage({ kind: 'running', done: 0, total: fresh.length });
    let sets = 0;
    const CHUNK = 50;
    try {
      for (let i = 0; i < fresh.length; i += CHUNK) {
        const batch = fresh.slice(i, i + CHUNK);
        const full = batch.map((w) => ({
          client_id: clientId, plan_day_id: null, completed_at: w.end.toISOString(), title: w.title,
          duration_sec: Math.max(0, Math.round((w.end.getTime() - w.start.getTime()) / 1000)) || null,
        }));
        let res = await supabase.from('workout_completions').insert(full).select('id');
        // older schema without title/duration_sec
        if (res.error) res = await supabase.from('workout_completions').insert(full.map(({ client_id, plan_day_id, completed_at }) => ({ client_id, plan_day_id, completed_at }))).select('id');
        if (res.error || !res.data || res.data.length !== batch.length) throw new Error(res.error?.message ?? 'insert');
        const ids = (res.data as { id: string }[]).map((r) => r.id);
        const logs = batch.flatMap((w, k) => w.sets.map((s) => ({
          client_id: clientId, workout_completion_id: ids[k], plan_day_id: null, exercise_name: s.exercise,
          set_number: s.set_number, weight_kg: s.weight_kg, reps: s.reps, set_type: s.set_type,
          duration_sec: s.duration_sec, distance_km: s.distance_km, created_at: w.end.toISOString(),
        })));
        for (let j = 0; j < logs.length; j += 500) {
          const part = logs.slice(j, j + 500);
          const { error } = await supabase.from('exercise_set_logs').insert(part);
          if (error) {
            const { error: e2 } = await supabase.from('exercise_set_logs').insert(part.map(({ set_type: _t, duration_sec: _d, distance_km: _k, ...r }) => r));
            if (e2) throw new Error(e2.message);
          }
        }
        sets += logs.length;
        setStage({ kind: 'running', done: Math.min(fresh.length, i + CHUNK), total: fresh.length });
      }
      const prs = await seedRecords(clientId, fresh);
      setStage({ kind: 'done', workouts: fresh.length, sets, prs });
    } catch {
      setStage({ kind: 'error', msg: t('Import abgebrochen — bereits importierte Trainings bleiben erhalten. Einfach erneut versuchen.') });
    } finally {
      runningRef.current = false;
    }
  };

  const mapped = stage.kind === 'preview' ? [...stage.result.mapping.entries()] : [];
  const mappedCount = mapped.filter(([, v]) => v).length;

  return (
    <div className="adlr-card p-5 mb-5">
      <p className="text-sm font-medium text-white/80 flex items-center gap-2 mb-1"><Upload size={16} className="text-adlr-gold" /> {t('Trainingsdaten importieren')}</p>
      <p className="text-xs text-white/45 leading-relaxed mb-3">{t('Übernimm deine Historie aus Hevy oder Strong — Kraftkurven und Rekorde laufen nahtlos weiter.')}</p>
      <input ref={fileRef} type="file" accept=".csv,text/csv,text/comma-separated-values" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />

      {(stage.kind === 'idle' || stage.kind === 'error' || stage.kind === 'done') && (
        <>
          {stage.kind === 'error' && <p className="text-xs text-red-400 mb-2">{stage.msg}</p>}
          {stage.kind === 'done' && (
            <p className="text-xs text-emerald-400 mb-2 flex items-center gap-1.5"><Check size={13} />
              {t('{w} Trainings · {s} Sätze importiert', { w: fmtNum(stage.workouts), s: fmtNum(stage.sets) })}{stage.prs ? ` · ${t('{n} Rekorde', { n: stage.prs })}` : ''}
            </p>
          )}
          <button onClick={() => fileRef.current?.click()} className="adlr-tap w-full py-2.5 rounded-xl text-sm font-medium border border-white/10 text-white/80">
            {t('CSV-Datei wählen')}
          </button>
          <details className="mt-3 text-[11px] text-white/40 leading-relaxed">
            <summary className="cursor-pointer">{t('Wo finde ich den Export?')}</summary>
            <p className="mt-1.5"><b>Hevy:</b> {t('Profil → Einstellungen → Daten exportieren & importieren → Workouts exportieren')}</p>
            <p className="mt-1"><b>Strong:</b> {t('Einstellungen → Strong-Daten exportieren')}</p>
          </details>
        </>
      )}

      {stage.kind === 'preview' && (
        <div className="adlr-fade-in">
          <div className="rounded-xl p-3 mb-3 text-sm" style={{ background: 'rgb(var(--text) / 0.04)' }}>
            <p className="text-white font-semibold">{SOURCE_LABEL[stage.result.source]} · {t('{n} Trainings', { n: fmtNum(stage.fresh.length) })}</p>
            {stage.fresh.length > 0 && (
              <p className="text-xs text-white/50 mt-0.5">
                {fmtDate(stage.fresh[0].start, { month: 'short', year: 'numeric' })} – {fmtDate(stage.fresh[stage.fresh.length - 1].start, { month: 'short', year: 'numeric' })}
                {' · '}{t('{n} Sätze', { n: fmtNum(stage.fresh.reduce((a, w) => a + w.sets.length, 0)) })}
              </p>
            )}
            {stage.result.skippedRows > 0 && <p className="text-xs text-amber-400/80 mt-0.5">{t('{n} Zeilen mit unlesbarem Datum übersprungen', { n: stage.result.skippedRows })}</p>}
            {stage.dupes > 0 && <p className="text-xs text-white/40 mt-0.5">{t('{n} bereits vorhanden — werden übersprungen', { n: stage.dupes })}</p>}
            <button onClick={() => setShowMap(!showMap)} className="adlr-tap text-xs text-adlr-gold mt-2 flex items-center gap-1">
              {t('{a} von {b} Übungen zugeordnet', { a: mappedCount, b: mapped.length })} <ChevronDown size={12} className={showMap ? 'rotate-180' : ''} />
            </button>
            {showMap && (
              <div className="mt-2 max-h-48 overflow-y-auto space-y-1">
                {mapped.map(([orig, to]) => (
                  <p key={orig} className="text-[11px] flex justify-between gap-2">
                    <span className="text-white/50 truncate">{orig}</span>
                    <span className={to ? 'text-white/80 shrink-0' : 'text-white/30 shrink-0'}>{to ?? t('übernommen')}</span>
                  </p>
                ))}
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <button disabled={stage.fresh.length === 0} onClick={() => run(stage.fresh)} className="adlr-tap flex-1 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-40" style={{ background: 'rgb(var(--adlr-gold))', color: '#000' }}>
              {t('Importieren')}
            </button>
            <button onClick={() => setStage({ kind: 'idle' })} className="adlr-tap px-4 py-2.5 rounded-xl text-sm bg-white/5 text-white/60">{t('Abbrechen')}</button>
          </div>
        </div>
      )}

      {stage.kind === 'running' && (
        <div>
          <p className="text-xs text-white/60 mb-1.5">{t('Importiere… {a} / {b}', { a: stage.done, b: stage.total })}</p>
          <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full bg-adlr-gold transition-all" style={{ width: `${(stage.done / Math.max(1, stage.total)) * 100}%` }} />
          </div>
        </div>
      )}
    </div>
  );
}

/** Best imported working set per exercise becomes a PR if it beats the existing one —
 *  otherwise the next in-app workout would celebrate "records" below the real history. */
async function seedRecords(clientId: string, workouts: ImportedWorkout[]): Promise<number> {
  const best = new Map<string, { weight_kg: number; reps: number; at: Date }>();
  for (const w of workouts) for (const s of w.sets) {
    if (s.weight_kg == null || s.set_type === 'warmup' || !s.reps || s.reps > 30) continue;
    const cur = best.get(s.exercise);
    if (!cur || s.weight_kg > cur.weight_kg) best.set(s.exercise, { weight_kg: s.weight_kg, reps: s.reps, at: w.end });
  }
  if (best.size === 0) return 0;
  const { data } = await supabase.from('personal_records').select('exercise_name, weight_kg').eq('client_id', clientId);
  const prev = new Map<string, number>();
  for (const p of (data ?? []) as { exercise_name: string; weight_kg: number }[]) prev.set(p.exercise_name, Math.max(prev.get(p.exercise_name) ?? 0, p.weight_kg));
  const rows = [...best.entries()]
    .filter(([name, b]) => b.weight_kg > (prev.get(name) ?? 0))
    .map(([name, b]) => ({ client_id: clientId, exercise_name: name, weight_kg: b.weight_kg, reps: b.reps, achieved_at: b.at.toISOString() }));
  if (rows.length === 0) return 0;
  const { error } = await supabase.from('personal_records').insert(rows);
  return error ? 0 : rows.length;
}
