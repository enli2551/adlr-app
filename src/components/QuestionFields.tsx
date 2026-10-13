import type { AnswerValue, CoachQuestion, CustomAnswer } from '@/lib/coachQuestions';
import { t } from '@/lib/i18n';

/** Inputs for a coach's own questions (intake + weekly check-in). */
export default function QuestionFields({ questions, values, onChange }: {
  questions: CoachQuestion[];
  values: Record<string, AnswerValue>;
  onChange: (id: string, v: AnswerValue) => void;
}) {
  const chip = (active: boolean) => `adlr-tap py-2.5 px-3 rounded-lg text-sm font-semibold border ${active ? 'bg-adlr-gold text-black border-adlr-gold' : 'bg-white/5 text-white/60 border-white/10'}`;
  return (
    <div className="space-y-5">
      {questions.map((q) => {
        const v = values[q.id];
        return (
          <div key={q.id}>
            <p className="text-sm text-white/80 mb-2">{q.label}{q.required && <span className="text-adlr-gold"> *</span>}</p>
            {q.kind === 'text' && (
              <textarea rows={2} value={(v as string) ?? ''} onChange={(e) => onChange(q.id, e.target.value)}
                className="w-full bg-inset border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none resize-none" />
            )}
            {q.kind === 'number' && (
              <input inputMode="decimal" value={v == null ? '' : String(v)}
                onChange={(e) => { const s = e.target.value.replace(',', '.'); onChange(q.id, s === '' ? null : Number.isNaN(Number(s)) ? (v ?? null) : s); }}
                className="w-full bg-inset border border-white/10 rounded-xl px-3 py-2.5 text-white outline-none" />
            )}
            {q.kind === 'scale' && (
              <>
                <div className="grid grid-cols-5 gap-1.5">
                  {[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" onClick={() => onChange(q.id, v === n ? null : n)} className={chip(v === n)}>{n}</button>)}
                </div>
                <div className="flex justify-between text-[10px] text-white/35 mt-1"><span>{t('wenig')}</span><span>{t('sehr')}</span></div>
              </>
            )}
            {q.kind === 'yesno' && (
              <div className="grid grid-cols-2 gap-1.5">
                <button type="button" onClick={() => onChange(q.id, v === true ? null : true)} className={chip(v === true)}>{t('Ja')}</button>
                <button type="button" onClick={() => onChange(q.id, v === false ? null : false)} className={chip(v === false)}>{t('Nein')}</button>
              </div>
            )}
            {q.kind === 'choice' && (
              <div className="flex flex-wrap gap-1.5">
                {(q.options ?? []).map((o) => <button key={o} type="button" onClick={() => onChange(q.id, v === o ? null : o)} className={chip(v === o)}>{o}</button>)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function formatAnswer(a: CustomAnswer): string {
  if (a.kind === 'yesno') return a.a === true ? t('Ja') : a.a === false ? t('Nein') : '—';
  if (a.kind === 'scale') return `${a.a}/5`;
  return a.a == null ? '—' : String(a.a);
}

/** Read-only list of answers (coach side). */
export function AnswerList({ answers }: { answers: CustomAnswer[] }) {
  if (!answers.length) return null;
  return (
    <div className="space-y-1.5">
      {answers.map((a) => (
        <div key={a.id} className="text-xs">
          <p className="text-white/45">{a.q}</p>
          <p className="text-white/80 whitespace-pre-line">{formatAnswer(a)}</p>
        </div>
      ))}
    </div>
  );
}
