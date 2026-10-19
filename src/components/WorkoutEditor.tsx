import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Plus, Trash2, Loader2 } from 'lucide-react';
import type { WorkoutCompletion, ExerciseSetLog } from '@/lib/types';
import { deleteWorkout, saveWorkoutEdit, isPendingUpload, type EditExercise, type EditSet } from '@/lib/workoutEdit';
import { ExerciseLibrary, ExerciseDemoModal } from '@/components/ExerciseLibrary';
import { fetchExercises, type ExerciseRow } from '@/lib/exercises';
import { useAsyncData } from '@/lib/useAsyncData';
import { haptic } from '@/lib/haptics';
import { t } from '@/lib/i18n';

interface Props {
  completion: WorkoutCompletion;
  logs: ExerciseSetLog[];
  /** shown as the name of a plan-day workout (its name comes from the plan, not editable here) */
  name: string;
  onClose: () => void;
  /** after a save or delete — reload the list */
  onChanged: () => void;
}

const TYPE_CYCLE: EditSet['type'][] = ['working', 'warmup', 'dropset'];
const pad = (n: number) => String(n).padStart(2, '0');
const toLocalInput = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const blankSet = (): EditSet => ({ weight: '', reps: '', type: 'working', min: '', km: '' });

/** Edit or delete a saved workout (client log/calendar and coach ClientDetail). */
export default function WorkoutEditor({ completion, logs, name, onClose, onChanged }: Props) {
  const isFree = !completion.plan_day_id;
  const { data: lib } = useAsyncData(fetchExercises, []);
  const cardio = useMemo(() => new Set((lib ?? []).filter((e) => e.muscle_group === 'Cardio').map((e) => e.name)), [lib]);
  const [title, setTitle] = useState(completion.title && completion.title !== 'Freies Training' ? completion.title : '');
  const [when, setWhen] = useState(toLocalInput(completion.completed_at));
  const [minutes, setMinutes] = useState(completion.duration_sec ? String(Math.round(completion.duration_sec / 60)) : '');
  const [gym, setGym] = useState(completion.gym ?? '');
  const [exercises, setExercises] = useState<EditExercise[]>(() => {
    const byEx = new Map<string, ExerciseSetLog[]>();
    for (const l of [...logs].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.set_number - b.set_number)) {
      byEx.set(l.exercise_name, [...(byEx.get(l.exercise_name) ?? []), l]);
    }
    return [...byEx.entries()].map(([n, ls]) => ({
      name: n,
      sets: ls.sort((a, b) => a.set_number - b.set_number).map((l) => ({
        weight: l.weight_kg?.toString() ?? '', reps: l.reps?.toString() ?? '', type: (l.set_type ?? 'working') as EditSet['type'],
        min: l.duration_sec ? String(Math.round(l.duration_sec / 60)) : '', km: l.distance_km?.toString() ?? '',
        effort: l.rir != null ? String(l.rir) : l.rpe != null ? String(l.rpe) : '', effortIsRir: l.rir != null,
      })),
    }));
  });
  const [picker, setPicker] = useState(false);
  const [demo, setDemo] = useState<ExerciseRow | null>(null);
  const [busy, setBusy] = useState<'save' | 'delete' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const pending = isPendingUpload(completion.id);

  const setField = (ei: number, si: number, patch: Partial<EditSet>) =>
    setExercises((xs) => xs.map((x, i) => (i !== ei ? x : { ...x, sets: x.sets.map((s, j) => (j === si ? { ...s, ...patch } : s)) })));
  const addSet = (ei: number) => setExercises((xs) => xs.map((x, i) => (i !== ei ? x : { ...x, sets: [...x.sets, x.sets.length ? { ...x.sets[x.sets.length - 1], type: 'working' } : blankSet()] })));
  const removeSet = (ei: number, si: number) => setExercises((xs) => xs.map((x, i) => (i !== ei ? x : { ...x, sets: x.sets.filter((_, j) => j !== si) })).filter((x) => x.sets.length > 0));
  const removeExercise = (ei: number) => setExercises((xs) => xs.filter((_, i) => i !== ei));
  const addExercise = (row: ExerciseRow) => {
    if (exercises.some((x) => x.name === row.name)) return;
    setExercises((xs) => [...xs, { name: row.name, sets: Array.from({ length: row.default_sets || 3 }, () => ({ ...blankSet(), reps: row.default_reps ? String(row.default_reps) : '' })) }]);
  };

  const save = async () => {
    const at = new Date(when);
    if (Number.isNaN(at.getTime())) { setErr(t('Bitte gib ein gültiges Datum ein.')); return; }
    if (at.getTime() > Date.now() + 5 * 60000) { setErr(t('Das Datum liegt in der Zukunft.')); return; }
    setBusy('save'); setErr(null);
    const mins = minutes.trim() ? Math.round(Number(minutes.replace(',', '.'))) : null;
    const e = await saveWorkoutEdit(completion, logs, {
      completed_at: at.toISOString(),
      duration_sec: mins != null && mins > 0 ? mins * 60 : null,
      title: isFree ? (title.trim() || 'Freies Training') : (completion.title ?? null),
      gym: gym.trim() || null,
    }, exercises);
    setBusy(null);
    if (e) { setErr(t('Speichern fehlgeschlagen ({msg}).', { msg: e })); return; }
    haptic.success();
    onChanged();
  };

  const remove = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setBusy('delete'); setErr(null);
    const e = await deleteWorkout(completion);
    setBusy(null);
    if (e) { setErr(t('Löschen fehlgeschlagen ({msg}).', { msg: e })); return; }
    haptic.success();
    onChanged();
  };

  const input = 'bg-inset border border-white/10 rounded-lg px-2 py-2 text-sm text-white placeholder-white/20 outline-none';

  return createPortal(
    <div className="fixed inset-0 z-[75] flex flex-col adlr-fade-in" style={{ background: 'rgb(var(--adlr-black))', paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="max-w-md w-full mx-auto flex flex-col flex-1 min-h-0">
        <div className="flex items-center justify-between px-5 py-4">
          <div className="min-w-0">
            <p className="text-lg font-bold text-white">{t('Training bearbeiten')}</p>
            {!isFree && <p className="text-xs text-white/45 truncate">{t(name)}</p>}
          </div>
          <button onClick={onClose} aria-label={t('Schließen')} className="adlr-tap p-2 rounded-full bg-white/5 text-white/60"><X size={18} /></button>
        </div>

        {pending ? (
          <p className="px-5 text-sm text-white/60">{t('Dieses Training wird noch hochgeladen. Bearbeiten geht, sobald du wieder online bist.')}</p>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-6 space-y-4">
            <div className="adlr-card p-4 space-y-3">
              {isFree && (
                <label className="block">
                  <span className="text-xs text-white/50">{t('Name')}</span>
                  <input value={title} onChange={(e) => setTitle(e.target.value.slice(0, 60))} placeholder={t('Freies Training')} className={`mt-1 w-full ${input}`} />
                </label>
              )}
              <div className="grid grid-cols-[1fr_6rem] gap-2">
                <label className="block min-w-0">
                  <span className="text-xs text-white/50">{t('Datum & Uhrzeit')}</span>
                  <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className={`mt-1 w-full ${input}`} />
                </label>
                <label className="block">
                  <span className="text-xs text-white/50">{t('Dauer (Min)')}</span>
                  <input inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value.replace(/[^\d]/g, ''))} placeholder="—" className={`mt-1 w-full text-center ${input}`} />
                </label>
              </div>
              <label className="block">
                <span className="text-xs text-white/50">{t('Studio')}</span>
                <input value={gym} onChange={(e) => setGym(e.target.value.slice(0, 60))} placeholder={t('Kein bestimmtes Studio')} className={`mt-1 w-full ${input}`} />
              </label>
            </div>

            {exercises.map((ex, ei) => {
              const isCardio = cardio.has(ex.name) || ex.sets.some((s) => s.min || s.km);
              return (
                <div key={ex.name} className="adlr-card p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <p className="text-sm font-semibold text-white">{t(ex.name)}</p>
                    <button onClick={() => removeExercise(ei)} className="adlr-tap p-1 text-white/35 hover:text-red-400" aria-label={t('Übung entfernen')}><Trash2 size={15} /></button>
                  </div>
                  <div className="space-y-1.5">
                    {ex.sets.map((s, si) => (
                      <div key={si} className="flex items-center gap-2">
                        <button
                          onClick={() => setField(ei, si, { type: TYPE_CYCLE[(TYPE_CYCLE.indexOf(s.type) + 1) % TYPE_CYCLE.length] })}
                          className={`adlr-tap shrink-0 w-11 text-[10px] font-semibold rounded py-1 ${s.type === 'warmup' ? 'text-amber-400' : s.type === 'dropset' ? 'text-red-400' : 'text-white/40'}`}
                          title={t('Aufwärmen / Arbeitssatz / Dropset')}
                        >
                          {s.type === 'warmup' ? 'WU' : s.type === 'dropset' ? 'DS' : t('Satz {n}', { n: si + 1 })}
                        </button>
                        {isCardio ? (
                          <>
                            <input inputMode="decimal" value={s.min} onChange={(e) => setField(ei, si, { min: e.target.value })} placeholder={t('Min')} className={`w-16 text-center ${input}`} />
                            <span className="text-xs text-white/30">·</span>
                            <input inputMode="decimal" value={s.km} onChange={(e) => setField(ei, si, { km: e.target.value })} placeholder="km" className={`w-16 text-center ${input}`} />
                          </>
                        ) : (
                          <>
                            <input inputMode="decimal" value={s.weight} onChange={(e) => setField(ei, si, { weight: e.target.value })} placeholder="kg" className={`w-16 text-center ${input}`} />
                            <span className="text-xs text-white/30">×</span>
                            <input inputMode="numeric" value={s.reps} onChange={(e) => setField(ei, si, { reps: e.target.value })} placeholder={t('Wdh')} className={`w-16 text-center ${input}`} />
                            {ex.sets.some((x) => x.effort) && (
                              <input inputMode="decimal" value={s.effort ?? ''} onChange={(e) => setField(ei, si, { effort: e.target.value, effortIsRir: ex.sets.some((x) => x.effortIsRir) })} placeholder={ex.sets.some((x) => x.effortIsRir) ? 'RIR' : 'RPE'} className={`w-12 text-center ${input}`} />
                            )}
                          </>
                        )}
                        <button onClick={() => removeSet(ei, si)} className="adlr-tap ml-auto p-1 text-white/30 hover:text-red-400" aria-label={t('Satz entfernen')}><X size={14} /></button>
                      </div>
                    ))}
                  </div>
                  <button onClick={() => addSet(ei)} className="adlr-tap mt-2 text-xs font-medium text-adlr-gold flex items-center gap-1"><Plus size={13} /> {t('Satz hinzufügen')}</button>
                </div>
              );
            })}

            <button onClick={() => setPicker(true)} className="adlr-tap w-full py-3 rounded-xl text-sm font-medium border border-dashed text-adlr-gold flex items-center justify-center gap-1.5" style={{ borderColor: 'rgb(var(--adlr-gold) / 0.4)' }}>
              <Plus size={15} /> {t('Übung hinzufügen')}
            </button>

            <button onClick={remove} disabled={busy !== null}
              className={`adlr-tap w-full py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 border ${confirmDelete ? 'bg-red-500 text-white border-red-500' : 'bg-red-500/10 text-red-400 border-red-500/30'}`}>
              {busy === 'delete' ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
              {confirmDelete ? t('Wirklich löschen? Nochmal tippen') : t('Training löschen')}
            </button>
          </div>
        )}

        {!pending && (
          <div className="px-5 pb-5 pt-2">
            {err && <p className="text-xs text-red-400 mb-2">{err}</p>}
            <button onClick={save} disabled={busy !== null}
              className="adlr-tap w-full py-3.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, rgb(var(--adlr-gold)), rgb(var(--adlr-gold-dim)))', color: '#000' }}>
              {busy === 'save' && <Loader2 size={15} className="animate-spin" />} {t('Änderungen speichern')}
            </button>
          </div>
        )}
      </div>

      {picker && (
        <div className="fixed inset-0 z-[78] flex flex-col bg-adlr-black adlr-fade-in" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
          <div className="max-w-md w-full mx-auto flex flex-col flex-1 min-h-0 px-4">
            <div className="flex items-center justify-between py-4">
              <p className="text-lg font-semibold text-white">{t('Übung hinzufügen')}</p>
              <button onClick={() => setPicker(false)} className="adlr-tap px-4 py-2 rounded-xl text-sm font-semibold" style={{ background: 'rgb(var(--adlr-gold))', color: '#000' }}>{t('Fertig')}</button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto pb-4">
              <ExerciseLibrary onAdd={addExercise} onDemo={setDemo} canAdd />
            </div>
          </div>
        </div>
      )}
      {demo && <ExerciseDemoModal ex={demo} onClose={() => setDemo(null)} />}
    </div>,
    document.body,
  );
}
