import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { MessageCircleQuestion, X } from 'lucide-react';
import { useAuth, useCoachName } from '@/lib/auth';
import { loadQuestions, missingRequired, openIntakeQuestions, saveIntakeAnswers, type AnswerValue, type CoachQuestion } from '@/lib/coachQuestions';
import QuestionFields from '@/components/QuestionFields';
import { t } from '@/lib/i18n';

/** Client Training screen: the coach's intake questions the client hasn't answered yet
 *  (added after the client signed up, or skipped). */
export default function IntakeQuestionsCard() {
  const { profile, refreshProfile } = useAuth();
  const coach = useCoachName();
  const [questions, setQuestions] = useState<CoachQuestion[]>([]);
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, AnswerValue>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!profile?.trainer_id) return;
    loadQuestions(profile.trainer_id, 'intake').then((qs) => setQuestions(openIntakeQuestions(qs, profile.intake)));
  }, [profile?.trainer_id, profile?.intake]);

  if (!profile || questions.length === 0) return null;

  const submit = async () => {
    setBusy(true); setErr(null);
    const { error } = await saveIntakeAnswers(profile.id, profile.intake, questions, values);
    setBusy(false);
    if (error) { setErr(t('Konnte nicht gespeichert werden.')); return; }
    setOpen(false);
    setQuestions([]);
    refreshProfile();
  };

  return (
    <>
      <button onClick={() => setOpen(true)} className="adlr-tap w-full adlr-card adlr-gold-border p-4 mb-4 flex items-center gap-3 text-left">
        <MessageCircleQuestion size={20} className="text-adlr-gold shrink-0" />
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-semibold text-white">{questions.length === 1 ? t('{coach} hat eine Frage an dich', { coach }) : t('{coach} hat {n} Fragen an dich', { coach, n: questions.length })}</span>
          <span className="block text-xs text-white/55">{t('Damit dein Training noch besser passt.')}</span>
        </span>
        <span className="text-xs font-semibold text-adlr-gold">{t('Los')}</span>
      </button>
      {open && createPortal(
        <div className="fixed inset-0 z-[70] bg-black/70 flex items-end justify-center adlr-fade-in" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md max-h-[92vh] overflow-y-auto rounded-t-3xl p-5 bg-adlr-anthracite" style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom))' }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <p className="text-lg font-bold text-white">{t('Fragen von {coach}', { coach })}</p>
              <button onClick={() => setOpen(false)} aria-label={t('Schließen')} className="adlr-tap p-1.5 text-white/40"><X size={18} /></button>
            </div>
            <QuestionFields questions={questions} values={values} onChange={(id, v) => setValues((s) => ({ ...s, [id]: v }))} />
            {err && <p className="text-xs text-red-400 mt-3">{err}</p>}
            <button onClick={submit} disabled={busy || missingRequired(questions, values)} className="adlr-tap w-full mt-5 py-3 rounded-xl text-sm font-semibold disabled:opacity-50" style={{ background: 'rgb(var(--adlr-gold))', color: '#000' }}>
              {busy ? '…' : t('Absenden')}
            </button>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
