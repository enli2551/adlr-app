import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Trophy, Footprints, Moon, Quote, MessageCircle, Target } from 'lucide-react';
import { t, fmtDate, fmtNum } from '@/lib/i18n';
import type { WeeklyRecapData } from '@/lib/weeklyRecap';
import { useCoachName } from '@/lib/auth';

const CARD_STYLE = { background: 'rgb(var(--text) / 0.04)', border: '1px solid rgb(var(--text) / 0.08)' };
const fmtSleep = (m: number) => `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}min`;

/**
 * Swipeable weekly recap: quote → new records → health → Peter's line → next week.
 * `onStart` is the closing "Starte Woche X" action (e.g. continue into the workout).
 */
export default function WeeklyRecap({ data, onClose, onStart }: { data: WeeklyRecapData; onClose: () => void; onStart: () => void }) {
  const coach = useCoachName();
  const scroller = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(0);
  const end = new Date(data.weekStart);
  end.setDate(end.getDate() + 6);
  const range = `${fmtDate(data.weekStart, { day: 'numeric', month: 'short' })} – ${fmtDate(end, { day: 'numeric', month: 'short' })}`;

  const cards: { key: string; node: JSX.Element }[] = [];
  cards.push({
    key: 'quote',
    node: (
      <div className="my-auto">
        <Quote size={34} className="text-adlr-gold mb-5" />
        <p className="text-2xl font-bold text-white leading-snug">„{t(data.quote)}“</p>
        <div className="mt-8 flex items-center gap-3">
          <span className="text-4xl font-extrabold adlr-gold-text">{data.workouts}</span>
          <span className="text-sm text-white/60 leading-tight">
            {data.target > 0 ? t('von {total} Trainings letzte Woche', { total: data.target }) : t('Trainings letzte Woche')}
          </span>
        </div>
      </div>
    ),
  });
  if (data.prs.length > 0) {
    cards.push({
      key: 'prs',
      node: (
        <div className="my-auto">
          <Trophy size={30} className="text-adlr-gold mb-3" />
          <p className="text-xl font-bold text-white mb-5">{data.prs.length === 1 ? t('1 neuer Rekord') : t('{n} neue Rekorde', { n: data.prs.length })}</p>
          <div className="space-y-2.5">
            {data.prs.map((p) => (
              <div key={p.exercise_name} className="flex items-center justify-between gap-3 rounded-2xl px-4 py-3" style={{ background: 'rgb(var(--adlr-gold) / 0.10)', border: '1px solid rgb(var(--adlr-gold) / 0.25)' }}>
                <span className="text-sm text-white font-medium min-w-0 truncate">{t(p.exercise_name)}</span>
                <span className="text-sm font-bold text-adlr-gold shrink-0">{fmtNum(p.weight_kg)} kg × {p.reps}</span>
              </div>
            ))}
          </div>
        </div>
      ),
    });
  }
  if (data.avgSteps != null || data.avgSleepMin != null) {
    cards.push({
      key: 'health',
      node: (
        <div className="my-auto">
          <p className="text-xs uppercase tracking-wider text-white/40 mb-6">{t('Dein Alltag letzte Woche')}</p>
          <div className="space-y-5">
            {data.avgSteps != null && (
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: 'rgb(var(--adlr-gold) / 0.14)' }}><Footprints size={26} className="text-adlr-gold" /></div>
                <div><p className="text-3xl font-bold text-white">{fmtNum(data.avgSteps)}</p><p className="text-xs text-white/50">{t('Schritte pro Tag (Ø)')}</p></div>
              </div>
            )}
            {data.avgSleepMin != null && (
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: 'rgb(var(--adlr-gold) / 0.14)' }}><Moon size={26} className="text-adlr-gold" /></div>
                <div><p className="text-3xl font-bold text-white">{fmtSleep(data.avgSleepMin)}</p><p className="text-xs text-white/50">{t('Schlaf pro Nacht (Ø)')}</p></div>
              </div>
            )}
          </div>
        </div>
      ),
    });
  }
  if (data.coachMessage) {
    cards.push({
      key: 'coach',
      node: (
        <div className="my-auto">
          <MessageCircle size={30} className="text-adlr-gold mb-4" />
          <p className="text-xs uppercase tracking-wider text-white/40 mb-3">{t('{coach} sagt', { coach })}</p>
          <p className="text-xl font-semibold text-white leading-relaxed">{data.coachMessage}</p>
        </div>
      ),
    });
  }
  cards.push({
    key: 'next',
    node: (
      <div className="my-auto text-center">
        <Target size={34} className="text-adlr-gold mx-auto mb-4" />
        <p className="text-xs uppercase tracking-wider text-white/40 mb-2">{t('Diese Woche')}</p>
        <p className="text-3xl font-bold text-white">{data.target > 0 ? t('{n} Trainings', { n: data.target }) : t('Dranbleiben')}</p>
        <p className="text-sm text-white/55 mt-3">{t('Eine neue Woche, eine neue Chance, stärker zu werden.')}</p>
      </div>
    ),
  });

  const onScroll = () => { const el = scroller.current; if (el) setPage(Math.round(el.scrollLeft / el.clientWidth)); };
  const goTo = (i: number) => scroller.current?.scrollTo({ left: i * scroller.current.clientWidth, behavior: 'smooth' });
  const last = page >= cards.length - 1;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex flex-col adlr-fade-in" style={{ background: 'rgb(var(--adlr-black))' }}>
      <div className="max-w-md w-full mx-auto flex flex-col flex-1 min-h-0" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="relative px-5 pt-6 pb-4 text-center">
          <button onClick={onClose} aria-label={t('Schließen')} className="adlr-tap absolute right-4 top-5 p-2 rounded-full bg-white/5 text-white/60"><X size={18} /></button>
          <h2 className="text-2xl font-bold adlr-gold-text">{t('Deine Woche ist da 💪')}</h2>
          <p className="text-sm text-white/55 mt-1">{t('KW {n}', { n: data.isoWeek })} · {range}</p>
        </div>

        <div ref={scroller} onScroll={onScroll} className="flex-1 min-h-0 flex overflow-x-auto snap-x snap-mandatory" style={{ scrollbarWidth: 'none' }}>
          {cards.map((c) => (
            <div key={c.key} className="w-full shrink-0 snap-center px-5 flex">
              <div className="flex-1 rounded-3xl p-6 overflow-y-auto flex flex-col" style={CARD_STYLE}>{c.node}</div>
            </div>
          ))}
        </div>

        <div className="flex justify-center gap-2 py-4">
          {cards.map((c, i) => (
            <button key={c.key} onClick={() => goTo(i)} aria-label={t('Karte {n}', { n: i + 1 })} className="w-2 h-2 rounded-full transition-all"
              style={{ background: i === page ? 'rgb(var(--adlr-gold))' : 'rgb(var(--text) / 0.2)', transform: i === page ? 'scale(1.25)' : 'none' }} />
          ))}
        </div>

        <div className="px-5 pb-5">
          <button
            onClick={() => (last ? onStart() : goTo(page + 1))}
            className="adlr-tap w-full py-3.5 rounded-xl font-semibold text-sm"
            style={{ background: 'linear-gradient(135deg, rgb(var(--adlr-gold)), rgb(var(--adlr-gold-dim)))', color: '#000' }}
          >
            {last ? t('Starte Woche {n}', { n: data.nextWeekNo }) : t('Weiter')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
