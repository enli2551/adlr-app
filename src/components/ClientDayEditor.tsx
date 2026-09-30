import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ArrowUp, ArrowDown, Trash2, Shuffle, Plus, Check } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { t } from '@/lib/i18n';
import { haptic } from '@/lib/haptics';
import type { Exercise, PlanDay } from '@/lib/types';
import type { ExerciseRow } from '@/lib/exercises';
import { ExerciseLibrary, ExerciseDemoModal } from '@/components/ExerciseLibrary';

/**
 * Client-side editor for ONE day of the client's own plan (only when the trainer
 * enabled profiles.can_edit_plan). Clients can swap, add, remove and reorder
 * exercises from the library and adjust sets/reps. Saving goes through the
 * `client_update_plan_day` RPC, which validates everything server-side and forks a
 * personal copy if the plan is shared with other clients.
 */
export default function ClientDayEditor({ day, onClose, onSaved }: { day: PlanDay; onClose: () => void; onSaved: () => void }) {
  const [items, setItems] = useState<Exercise[]>(() => (day.exercises ?? []).map((e) => ({ ...e })));
  // null = list view; -1 = picking an exercise to ADD; >= 0 = picking a replacement for that index
  const [picking, setPicking] = useState<number | null>(null);
  const [demoEx, setDemoEx] = useState<ExerciseRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (i: number, patch: Partial<Exercise>) => setItems((arr) => arr.map((e, idx) => (idx === i ? { ...e, ...patch } : e)));
  const move = (i: number, dir: -1 | 1) => setItems((arr) => {
    const j = i + dir;
    if (j < 0 || j >= arr.length) return arr;
    const next = [...arr];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });
  const remove = (i: number) => setItems((arr) => arr.filter((_, idx) => idx !== i));

  const pick = (row: ExerciseRow) => {
    if (picking === null) return;
    if (picking === -1) {
      setItems((arr) => [...arr, { name: row.name, sets: row.default_sets || 3, reps: row.default_reps || 10, rest_sec: row.default_rest_sec || 60 }]);
    } else {
      // Swapped exercise: keep the prescription volume, drop exercise-specific details.
      setItems((arr) => arr.map((e, idx) => (idx === picking
        ? { name: row.name, sets: e.sets, reps: e.reps, rest_sec: e.rest_sec ?? row.default_rest_sec }
        : e)));
    }
    haptic.light();
    setPicking(null);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    // set_details/weight must match the (possibly changed) set count — trim per-set details.
    const payload = items.map((e) => {
      const sets = Math.max(1, Math.min(20, Math.round(e.sets ?? 1)));
      const out: Exercise = { ...e, sets, reps: e.reps ? Math.max(1, Math.round(e.reps)) : e.reps };
      if (out.set_details) out.set_details = out.set_details.slice(0, sets);
      return out;
    });
    const { error: err } = await supabase.rpc('client_update_plan_day', { p_day_id: day.id, p_exercises: payload });
    setSaving(false);
    if (err) {
      setError(/not_allowed/.test(err.message) ? t('Dein Coach hat die Bearbeitung nicht freigegeben.') : t('Speichern fehlgeschlagen. Bitte versuche es erneut.'));
      return;
    }
    haptic.success();
    onSaved();
  };

  return createPortal(
    <div className="fixed inset-0 z-[65] flex flex-col bg-adlr-black adlr-fade-in" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="max-w-md w-full mx-auto flex flex-col flex-1 min-h-0 px-4">
        <div className="flex items-center justify-between py-4 gap-3">
          <div className="min-w-0">
            <p className="text-lg font-semibold text-white truncate">
              {picking === null ? t('Tag bearbeiten') : picking === -1 ? t('Übung hinzufügen') : t('Übung tauschen')}
            </p>
            <p className="text-xs text-white/45 truncate">{t(day.workout_name ?? 'Training')}</p>
          </div>
          <button
            onClick={() => (picking === null ? onClose() : setPicking(null))}
            className="adlr-tap p-2 rounded-xl bg-white/5 text-white/60 shrink-0"
            aria-label={t('Schließen')}
          >
            <X size={18} />
          </button>
        </div>

        {picking !== null ? (
          <div className="flex-1 min-h-0 overflow-y-auto pb-4">
            {picking >= 0 && (
              <p className="text-xs text-white/50 mb-3">{t('Ersetzt: {name}', { name: t(items[picking]?.name ?? '') })}</p>
            )}
            <ExerciseLibrary onAdd={pick} onDemo={setDemoEx} canAdd />
          </div>
        ) : (
          <>
            <div className="flex-1 min-h-0 overflow-y-auto pb-4 space-y-2">
              {items.length === 0 && <p className="text-sm text-white/35 py-6 text-center">{t('Noch keine Übungen — füge deine erste hinzu.')}</p>}
              {items.map((e, i) => (
                <div key={`${e.name}-${i}`} className="rounded-xl p-3" style={{ background: 'rgb(var(--text) / 0.04)', border: '1px solid rgb(var(--text) / 0.08)' }}>
                  <div className="flex items-start gap-2">
                    <p className="flex-1 min-w-0 text-sm font-medium text-white leading-snug">{t(e.name)}</p>
                    <div className="flex items-center gap-0.5 shrink-0 text-white/45">
                      <button onClick={() => move(i, -1)} disabled={i === 0} className="adlr-tap p-1.5 rounded-md disabled:opacity-25" aria-label={t('Nach oben')}><ArrowUp size={15} /></button>
                      <button onClick={() => move(i, 1)} disabled={i === items.length - 1} className="adlr-tap p-1.5 rounded-md disabled:opacity-25" aria-label={t('Nach unten')}><ArrowDown size={15} /></button>
                      <button onClick={() => setPicking(i)} className="adlr-tap p-1.5 rounded-md text-adlr-gold" aria-label={t('Übung tauschen')}><Shuffle size={15} /></button>
                      <button onClick={() => remove(i)} className="adlr-tap p-1.5 rounded-md text-red-400/80" aria-label={t('Entfernen')}><Trash2 size={15} /></button>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 mt-2 text-xs text-white/50">
                    <label className="flex items-center gap-1.5">
                      <input
                        type="number" inputMode="numeric" min={1} max={20}
                        value={e.sets ?? ''}
                        onChange={(ev) => update(i, { sets: ev.target.value === '' ? undefined : Number(ev.target.value) })}
                        className="w-14 bg-inset border border-white/10 rounded-md px-2 py-1.5 text-sm text-white text-center outline-none"
                      />
                      {t('Sätze')}
                    </label>
                    <span className="text-white/25">×</span>
                    <label className="flex items-center gap-1.5">
                      <input
                        type="number" inputMode="numeric" min={1} max={100}
                        value={e.reps ?? ''}
                        onChange={(ev) => update(i, { reps: ev.target.value === '' ? undefined : Number(ev.target.value) })}
                        className="w-14 bg-inset border border-white/10 rounded-md px-2 py-1.5 text-sm text-white text-center outline-none"
                      />
                      {t('Wdh')}
                    </label>
                  </div>
                </div>
              ))}
              <button
                onClick={() => setPicking(-1)}
                className="adlr-tap w-full py-3 rounded-xl text-sm font-medium border border-dashed text-adlr-gold flex items-center justify-center gap-1.5"
                style={{ borderColor: 'rgb(var(--adlr-gold) / 0.4)' }}
              >
                <Plus size={15} /> {t('Übung hinzufügen')}
              </button>
              <p className="text-[11px] text-white/35 text-center pt-1">{t('Dein Coach sieht deine Änderungen.')}</p>
            </div>
            <div className="py-3">
              {error && <p className="text-xs text-red-400 mb-2 text-center">{error}</p>}
              <button
                onClick={save}
                disabled={saving || items.length === 0}
                className="adlr-tap w-full py-3.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, rgb(var(--adlr-gold)), rgb(var(--adlr-gold-dim)))', color: '#000' }}
              >
                <Check size={16} /> {saving ? t('Speichert...') : t('Änderungen speichern')}
              </button>
            </div>
          </>
        )}
      </div>
      {demoEx && <ExerciseDemoModal ex={demoEx} onClose={() => setDemoEx(null)} />}
    </div>,
    document.body,
  );
}
