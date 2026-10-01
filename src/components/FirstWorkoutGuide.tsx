import { useState } from 'react';
import { Dumbbell, Lightbulb, X } from 'lucide-react';
import { t } from '@/lib/i18n';

const DONE_KEY = 'adlr_first_guide_done';

export function firstGuideDismissed(): boolean {
  try { return localStorage.getItem(DONE_KEY) === '1'; } catch { return false; }
}
function dismiss() {
  try { localStorage.setItem(DONE_KEY, '1'); } catch { /* ignore */ }
}

/** Before the very first workout: what happens, and one button to start it. */
export function FirstWorkoutIntro({ dayName, onStart }: { dayName: string; onStart: () => void }) {
  const steps = [
    t('Training starten — die Übungen stehen fertig da.'),
    t('Gewicht & Wiederholungen eintragen, Satz abhaken.'),
    t('Pause läuft automatisch, danach der nächste Satz.'),
    t('Training beenden — du siehst deine Zusammenfassung.'),
  ];
  return (
    <div className="adlr-card adlr-gold-border p-5 mb-5" style={{ background: 'linear-gradient(135deg, rgb(var(--adlr-gold) / 0.12), rgb(var(--adlr-gold) / 0.03))' }}>
      <p className="text-xs text-adlr-gold uppercase tracking-widest mb-1">{t('Dein erstes Training')}</p>
      <p className="text-lg font-bold text-white mb-3">{dayName}</p>
      <ol className="space-y-2 mb-4">
        {steps.map((s, i) => (
          <li key={i} className="flex gap-3 text-sm text-white/75">
            <span className="w-5 h-5 shrink-0 rounded-full bg-adlr-gold/20 text-adlr-gold text-[11px] font-bold flex items-center justify-center">{i + 1}</span>
            {s}
          </li>
        ))}
      </ol>
      <button onClick={onStart} className="adlr-tap w-full py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2" style={{ background: 'rgb(var(--adlr-gold))', color: '#000' }}>
        <Dumbbell size={16} /> {t('Erstes Training starten')}
      </button>
    </div>
  );
}

/** During the first workout: one tip at a time, dismissible for good. */
export function FirstWorkoutTips() {
  const tips = [
    t('Die Zahlen aus deinem Plan sind schon eingetragen — passe sie an, was du wirklich geschafft hast.'),
    t('Hake jeden Satz ab, sobald er fertig ist. Der Pausentimer startet dann von selbst.'),
    t('Unsicher bei einer Übung? Das goldene Symbol neben dem Namen zeigt dir die Ausführung.'),
    t('Alles erledigt? Ganz unten auf „Training beenden“ tippen.'),
  ];
  const [i, setI] = useState(0);
  const [hidden, setHidden] = useState(firstGuideDismissed());
  if (hidden) return null;
  const close = () => { dismiss(); setHidden(true); };
  return (
    <div className="adlr-card adlr-gold-border px-4 py-3 mb-4 flex gap-3 items-start adlr-fade-in">
      <Lightbulb size={16} className="text-adlr-gold mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white/85 leading-snug">{tips[i]}</p>
        <div className="flex items-center gap-3 mt-2">
          <span className="text-[11px] text-white/35">{i + 1} / {tips.length}</span>
          {i < tips.length - 1
            ? <button onClick={() => setI(i + 1)} className="adlr-tap text-xs text-adlr-gold font-medium">{t('Nächster Tipp')}</button>
            : <button onClick={close} className="adlr-tap text-xs text-adlr-gold font-medium">{t('Verstanden')}</button>}
        </div>
      </div>
      <button onClick={close} aria-label={t('Schließen')} className="adlr-tap p-1 text-white/35"><X size={14} /></button>
    </div>
  );
}
