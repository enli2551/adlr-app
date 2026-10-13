import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2, Video, Trash2, Plus } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { fetchExercises, refreshCoachLibrary, MUSCLE_GROUPS, type ExerciseRow } from '@/lib/exercises';
import { uploadCoachVideo, removeCoachVideoFile, MAX_VIDEO_BYTES } from '@/lib/coachVideos';
import { useAsyncData } from '@/lib/useAsyncData';
import { t } from '@/lib/i18n';

/** Coach: create or edit an own exercise (visible to them and their clients) incl. video. */
export default function CoachExerciseSheet({ initial, onClose, onSaved }: { initial?: ExerciseRow | null; onClose: () => void; onSaved?: (row: ExerciseRow) => void }) {
  const { profile } = useAuth();
  const { data: lib } = useAsyncData(fetchExercises, []);
  const equipmentOptions = useMemo(() => {
    const set = new Set((lib ?? []).map((e) => e.equipment).filter(Boolean));
    return [...set].sort((a, b) => t(a).localeCompare(t(b)));
  }, [lib]);
  const [name, setName] = useState(initial?.name ?? '');
  const [group, setGroup] = useState(initial?.muscle_group ?? 'Brust');
  const [equipment, setEquipment] = useState(initial?.equipment ?? 'Kurzhantel');
  const [sets, setSets] = useState(String(initial?.default_sets ?? 3));
  const [reps, setReps] = useState(String(initial?.default_reps ?? 10));
  const [rest, setRest] = useState(String(initial?.default_rest_sec ?? 90));
  const [cues, setCues] = useState<string[]>(initial?.cues?.length ? [...initial.cues] : ['']);
  const [video, setVideo] = useState<File | null>(null);
  const [removeVideo, setRemoveVideo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!profile) return null;

  const save = async () => {
    const n = name.trim();
    if (!n) { setErr(t('Bitte gib einen Namen ein.')); return; }
    // Names are the key for plans and logs — no duplicates with the library or own exercises.
    const clash = (lib ?? []).find((e) => e.id !== initial?.id && (e.name.toLowerCase() === n.toLowerCase() || t(e.name).toLowerCase() === n.toLowerCase()));
    if (clash) { setErr(t('„{name}“ gibt es schon in der Bibliothek.', { name: t(clash.name) })); return; }
    if (video && video.size > MAX_VIDEO_BYTES) { setErr(t('Das Video ist zu groß (max. 50 MB). Nimm ein kürzeres auf.')); return; }
    setBusy(true); setErr(null);
    let videoPath = removeVideo ? null : initial?.video_path ?? null;
    if (video) {
      const up = await uploadCoachVideo(profile.id, n, video);
      if (!up.path) { setBusy(false); setErr(t('Video konnte nicht hochgeladen werden ({msg}).', { msg: up.error ?? '' })); return; }
      videoPath = up.path;
    }
    const row = {
      name: n, muscle_group: group, equipment, tempo: initial?.tempo ?? '2-1-2',
      default_sets: Math.max(1, Math.min(10, Number(sets) || 3)), default_reps: Math.max(1, Math.min(100, Number(reps) || 10)),
      default_rest_sec: Math.max(0, Math.min(600, Number(rest) || 0)), exercise_id: initial?.exercise_id ?? 'custom',
      cues: cues.map((c) => c.trim()).filter(Boolean).slice(0, 6), trainer_id: profile.id, video_path: videoPath,
    };
    const res = initial
      ? await supabase.from('exercises').update(row).eq('id', initial.id).select('*').single()
      : await supabase.from('exercises').insert(row).select('*').single();
    if (res.error || !res.data) {
      if (video && videoPath) await removeCoachVideoFile(videoPath);
      setBusy(false);
      setErr(t('Speichern fehlgeschlagen. Ist die Migration für eigene Übungen ausgeführt?'));
      return;
    }
    if (initial?.video_path && initial.video_path !== videoPath) await removeCoachVideoFile(initial.video_path);
    // Renamed: the plans keep working with the old name — they store names, so update them too.
    if (initial && initial.name !== n) await supabase.rpc('rename_coach_exercise', { p_old: initial.name, p_new: n }).then(() => {}, () => {});
    await refreshCoachLibrary();
    setBusy(false);
    onSaved?.(res.data as ExerciseRow);
    onClose();
  };

  const remove = async () => {
    if (!initial) return;
    if (!confirmDel) { setConfirmDel(true); return; }
    setBusy(true);
    const { error } = await supabase.from('exercises').delete().eq('id', initial.id);
    if (!error) await removeCoachVideoFile(initial.video_path);
    await refreshCoachLibrary();
    setBusy(false);
    if (error) { setErr(t('Löschen fehlgeschlagen ({msg}).', { msg: error.message })); return; }
    onClose();
  };

  const input = 'w-full bg-inset border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-white/25 outline-none';
  const chip = (active: boolean) => (active ? { background: 'rgb(var(--adlr-gold))', color: '#000' } : { background: 'rgb(var(--text) / 0.05)', color: 'rgb(var(--text) / 0.6)' });

  return createPortal(
    <div className="fixed inset-0 z-[85] bg-black/70 flex items-end sm:items-center justify-center adlr-fade-in" onClick={() => !busy && onClose()}>
      <div className="w-full max-w-md max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl p-5 bg-adlr-anthracite" style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom))' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-lg font-bold text-white">{initial ? t('Eigene Übung bearbeiten') : t('Eigene Übung')}</p>
            <p className="text-xs text-white/45">{t('Sehen nur du und deine Klienten.')}</p>
          </div>
          <button onClick={onClose} aria-label={t('Schließen')} className="adlr-tap p-1.5 text-white/40"><X size={18} /></button>
        </div>
        <div className="space-y-4">
          <input value={name} onChange={(e) => setName(e.target.value.slice(0, 60))} name="adlr-exercise-name" autoComplete="off" placeholder={t('Name der Übung')} className={input} />
          <div>
            <p className="text-xs text-white/50 mb-1.5">{t('Muskelgruppe')}</p>
            <div className="flex flex-wrap gap-1.5">
              {MUSCLE_GROUPS.map((g) => <button key={g} onClick={() => setGroup(g)} className="adlr-tap px-2.5 py-1.5 rounded-lg text-xs font-medium" style={chip(group === g)}>{t(g)}</button>)}
            </div>
          </div>
          <div>
            <p className="text-xs text-white/50 mb-1.5">{t('Equipment')}</p>
            <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
              {equipmentOptions.map((q) => <button key={q} onClick={() => setEquipment(q)} className="adlr-tap px-2.5 py-1.5 rounded-lg text-xs font-medium" style={chip(equipment === q)}>{t(q)}</button>)}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {([[t('Sätze'), sets, setSets], [t('Wdh'), reps, setReps], [t('Pause (s)'), rest, setRest]] as const).map(([label, val, set]) => (
              <label key={label} className="block">
                <span className="text-[11px] text-white/45">{label}</span>
                <input inputMode="numeric" value={val} onChange={(e) => set(e.target.value.replace(/[^\d]/g, ''))} className={`${input} mt-1 text-center`} />
              </label>
            ))}
          </div>
          <div>
            <p className="text-xs text-white/50 mb-1.5">{t('Ausführungshinweise')}</p>
            <div className="space-y-1.5">
              {cues.map((c, i) => (
                <div key={i} className="flex gap-1.5">
                  <input value={c} onChange={(e) => setCues((arr) => arr.map((x, j) => (j === i ? e.target.value.slice(0, 120) : x)))} placeholder={t('z.B. Schulterblätter zusammen')} className={input} />
                  {cues.length > 1 && <button onClick={() => setCues((arr) => arr.filter((_, j) => j !== i))} className="adlr-tap px-2 text-white/35" aria-label={t('Entfernen')}><X size={15} /></button>}
                </div>
              ))}
              {cues.length < 6 && <button onClick={() => setCues((arr) => [...arr, ''])} className="adlr-tap text-xs text-adlr-gold flex items-center gap-1"><Plus size={13} /> {t('Hinweis hinzufügen')}</button>}
            </div>
          </div>
          <div>
            <p className="text-xs text-white/50 mb-1.5">{t('Video (optional, max. 50 MB)')}</p>
            {(video || (initial?.video_path && !removeVideo)) ? (
              <div className="flex items-center gap-2 rounded-xl px-3 py-2.5" style={{ background: 'rgb(var(--text) / 0.04)' }}>
                <Video size={16} className="text-adlr-gold shrink-0" />
                <span className="flex-1 text-sm text-white/80 truncate">{video ? video.name : t('Video gespeichert')}</span>
                <button onClick={() => { setVideo(null); if (initial?.video_path) setRemoveVideo(true); }} className="adlr-tap p-1 text-white/40" aria-label={t('Video entfernen')}><Trash2 size={15} /></button>
              </div>
            ) : (
              <label className="adlr-tap flex items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm text-adlr-gold border border-dashed cursor-pointer" style={{ borderColor: 'rgb(var(--adlr-gold) / 0.4)' }}>
                <Video size={16} /> {t('Video aufnehmen oder auswählen')}
                <input type="file" accept="video/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) { setVideo(f); setRemoveVideo(false); } }} />
              </label>
            )}
          </div>
          {err && <p className="text-xs text-red-400">{err}</p>}
          <button onClick={save} disabled={busy} className="adlr-tap w-full py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50" style={{ background: 'rgb(var(--adlr-gold))', color: '#000' }}>
            {busy && <Loader2 size={15} className="animate-spin" />} {t('Speichern')}
          </button>
          {initial && (
            <button onClick={remove} disabled={busy} className={`adlr-tap w-full py-2.5 rounded-xl text-sm font-medium border ${confirmDel ? 'bg-red-500 text-white border-red-500' : 'bg-red-500/10 text-red-400 border-red-500/30'}`}>
              {confirmDel ? t('Wirklich löschen? Nochmal tippen') : t('Übung löschen')}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
