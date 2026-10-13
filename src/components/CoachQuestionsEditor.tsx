import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDown, ArrowUp, Loader2, Plus, Trash2, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { loadQuestions, type CoachQuestion, type QuestionContext, type QuestionKind } from '@/lib/coachQuestions';
import { t } from '@/lib/i18n';

const KINDS: { kind: QuestionKind; label: string }[] = [
  { kind: 'text', label: 'Freitext' },
  { kind: 'scale', label: 'Skala 1–5' },
  { kind: 'yesno', label: 'Ja / Nein' },
  { kind: 'choice', label: 'Auswahl' },
  { kind: 'number', label: 'Zahl' },
];

const SUGGESTIONS: Record<QuestionContext, { label: string; kind: QuestionKind; options?: string[] }[]> = {
  intake: [
    { label: 'Wie sah dein Training bisher aus?', kind: 'text' },
    { label: 'Nimmst du Medikamente, die ich kennen sollte?', kind: 'text' },
    { label: 'Wie viele Stunden schläfst du im Schnitt?', kind: 'number' },
    { label: 'Wo trainierst du hauptsächlich?', kind: 'choice', options: ['Studio', 'Zuhause', 'Draußen'] },
  ],
  checkin: [
    { label: 'Wie zufrieden bist du mit deinem Fortschritt?', kind: 'scale' },
    { label: 'Hattest du Schmerzen beim Training?', kind: 'yesno' },
    { label: 'Hast du deine Supplements genommen?', kind: 'yesno' },
    { label: 'Wie viele Schritte hattest du im Schnitt pro Tag?', kind: 'number' },
  ],
};

/** Trainer menu → "Eigene Fragen": extra questions for the intake and the weekly check-in.
 *  Rendered outside the account menu (the menu closes on outside clicks, the sheet is a portal). */
export default function CoachQuestionsEditor({ onClose }: { onClose: () => void }) {
  const { profile } = useAuth();
  const open = true;
  const setOpen = (v: boolean) => { if (!v) onClose(); };
  const [ctx, setCtx] = useState<QuestionContext>('intake');
  const [rows, setRows] = useState<CoachQuestion[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    if (!profile) return;
    setRows(await loadQuestions(profile.id, ctx));
  };
  useEffect(() => { setRows(null); load(); }, [ctx]);

  const fail = () => setErr(t('Speichern fehlgeschlagen. Ist die Migration für eigene Fragen ausgeführt?'));
  const add = async (s?: { label: string; kind: QuestionKind; options?: string[] }) => {
    if (!profile || !rows) return;
    setBusy(true); setErr(null);
    const { data, error } = await supabase.from('coach_questions').insert({
      trainer_id: profile.id, context: ctx, label: s?.label ?? t('Neue Frage'), kind: s?.kind ?? 'text',
      options: s?.options ?? null, position: rows.length ? Math.max(...rows.map((r) => r.position)) + 1 : 0,
    }).select('*').single();
    setBusy(false);
    if (error || !data) { fail(); return; }
    setRows([...rows, data as CoachQuestion]);
  };
  const patch = async (id: string, p: Partial<CoachQuestion>) => {
    setRows((prev) => prev?.map((r) => (r.id === id ? { ...r, ...p } : r)) ?? prev);
    const { error } = await supabase.from('coach_questions').update(p).eq('id', id);
    if (error) fail();
  };
  const remove = async (id: string) => {
    setRows((prev) => prev?.filter((r) => r.id !== id) ?? prev);
    const { error } = await supabase.from('coach_questions').delete().eq('id', id);
    if (error) { fail(); load(); }
  };
  const move = async (i: number, dir: -1 | 1) => {
    if (!rows) return;
    const j = i + dir;
    if (j < 0 || j >= rows.length) return;
    const next = [...rows];
    [next[i], next[j]] = [next[j], next[i]];
    const renumbered = next.map((r, k) => ({ ...r, position: k }));
    setRows(renumbered);
    await Promise.all([renumbered[i], renumbered[j]].map((r) => supabase.from('coach_questions').update({ position: r.position }).eq('id', r.id)));
  };

  const used = new Set((rows ?? []).map((r) => r.label));
  const inputCls = 'w-full bg-inset border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/25 outline-none';

  return (
    <>
      {open && createPortal(
        <div className="fixed inset-0 z-[70] bg-black/70 flex items-end sm:items-center justify-center adlr-fade-in" onClick={() => setOpen(false)}>
          <div className="w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl p-5 bg-adlr-anthracite" style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom))' }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-1">
              <p className="text-lg font-bold text-white">{t('Eigene Fragen')}</p>
              <button onClick={() => setOpen(false)} aria-label={t('Schließen')} className="adlr-tap p-1.5 text-white/40"><X size={18} /></button>
            </div>
            <p className="text-xs text-white/45 mb-4">{t('Zusätzlich zu den Standardfragen — deine Klienten sehen sie in deinem Namen.')}</p>
            <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl mb-4" style={{ background: 'rgb(var(--text) / 0.05)' }}>
              {([['intake', t('Kennenlernen')], ['checkin', t('Wöchentlicher Check-in')]] as const).map(([c, label]) => (
                <button key={c} onClick={() => setCtx(c)} className="adlr-tap py-2 rounded-lg text-xs font-semibold"
                  style={ctx === c ? { background: 'rgb(var(--adlr-gold))', color: '#000' } : { color: 'rgb(var(--text) / 0.55)' }}>{label}</button>
              ))}
            </div>
            <p className="text-[11px] text-white/40 mb-3">
              {ctx === 'intake' ? t('Einmalig: neue Klienten beantworten sie bei der Anmeldung, bestehende Klienten bekommen sie im Training-Tab.') : t('Jede Woche im Check-in, nach den Standardfragen.')}
            </p>
            {!rows ? (
              <div className="py-6 flex justify-center"><Loader2 size={18} className="animate-spin text-white/40" /></div>
            ) : (
              <div className="space-y-3">
                {rows.map((q, i) => (
                  <div key={q.id} className="rounded-xl p-3 space-y-2" style={{ background: 'rgb(var(--text) / 0.04)', border: '1px solid rgb(var(--text) / 0.07)' }}>
                    <div className="flex gap-1.5">
                      <input defaultValue={q.label} key={`${q.id}-l`} onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== q.label) patch(q.id, { label: v.slice(0, 300) }); }} className={inputCls} />
                      <div className="flex flex-col">
                        <button onClick={() => move(i, -1)} disabled={i === 0} aria-label={t('Nach oben')} className="adlr-tap p-0.5 text-white/40 disabled:opacity-20"><ArrowUp size={13} /></button>
                        <button onClick={() => move(i, 1)} disabled={i === rows.length - 1} aria-label={t('Nach unten')} className="adlr-tap p-0.5 text-white/40 disabled:opacity-20"><ArrowDown size={13} /></button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {KINDS.map((k) => (
                        <button key={k.kind} onClick={() => patch(q.id, { kind: k.kind, options: k.kind === 'choice' ? (q.options ?? []) : null })}
                          className="adlr-tap px-2 py-1 rounded-md text-[11px] font-medium"
                          style={q.kind === k.kind ? { background: 'rgb(var(--adlr-gold) / 0.18)', color: 'rgb(var(--adlr-gold))' } : { background: 'rgb(var(--text) / 0.05)', color: 'rgb(var(--text) / 0.5)' }}>{t(k.label)}</button>
                      ))}
                    </div>
                    {q.kind === 'choice' && (
                      <input defaultValue={(q.options ?? []).join(', ')} key={`${q.id}-o`} placeholder={t('Antworten, mit Komma getrennt')}
                        onBlur={(e) => patch(q.id, { options: e.target.value.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 12) })} className={inputCls} />
                    )}
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2 text-xs text-white/60">
                        <input type="checkbox" checked={q.required} onChange={(e) => patch(q.id, { required: e.target.checked })} className="accent-[rgb(var(--adlr-gold))]" />
                        {t('Pflichtfrage')}
                      </label>
                      <button onClick={() => remove(q.id)} aria-label={t('Löschen')} className="adlr-tap p-1.5 text-white/35 hover:text-red-400"><Trash2 size={14} /></button>
                    </div>
                  </div>
                ))}
                {rows.length === 0 && <p className="text-xs text-white/40 text-center py-2">{t('Noch keine eigenen Fragen.')}</p>}
                <button onClick={() => add()} disabled={busy} className="adlr-tap w-full py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50"
                  style={{ background: 'rgb(var(--adlr-gold) / 0.12)', color: 'rgb(var(--adlr-gold))' }}>
                  <Plus size={15} /> {t('Frage hinzufügen')}
                </button>
                {SUGGESTIONS[ctx].some((s) => !used.has(t(s.label))) && (
                  <div>
                    <p className="text-[11px] text-white/40 mb-1.5">{t('Vorschläge')}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {SUGGESTIONS[ctx].filter((s) => !used.has(t(s.label))).map((s) => (
                        <button key={s.label} onClick={() => add({ ...s, label: t(s.label), options: s.options?.map((o) => t(o)) })} disabled={busy}
                          className="adlr-tap px-2.5 py-1.5 rounded-lg text-[11px] text-left bg-white/5 text-white/65">+ {t(s.label)}</button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            {err && <p className="text-xs text-red-400 mt-3">{err}</p>}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
