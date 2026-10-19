import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ChevronRight, X, Sparkles, Package as PackageIcon, Dumbbell, UserPlus, ListChecks, ClipboardCheck, Calendar } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { t } from '@/lib/i18n';
import CoachQuestionsEditor from '@/components/CoachQuestionsEditor';
import { loadChecklistStatus, reopenOnboarding, saveOnboardingState, type ChecklistStatus } from '@/lib/coachOnboarding';

type Item = { key: keyof ChecklistStatus; label: string; hint: string; icon: typeof Check; run: () => void };

/** Übersicht: "Dein Start" checklist for a new coach after the setup wizard (dismissable). */
export default function CoachChecklistCard() {
  const { profile, refreshProfile } = useAuth();
  const nav = useNavigate();
  const [status, setStatus] = useState<ChecklistStatus | null>(null);
  const [questions, setQuestions] = useState<'intake' | 'checkin' | null>(null);
  const [hidden, setHidden] = useState(false);
  const state = profile?.coach_onboarding ?? {};
  const visible = !!profile && profile.role === 'trainer' && !!profile.coach_onboarded_at && !state.checklist_dismissed && !hidden;

  useEffect(() => {
    if (visible && profile && !questions) loadChecklistStatus(profile).then(setStatus).catch(() => setStatus(null));
  }, [visible, profile?.id, profile?.brand_color, profile?.brand_logo, questions]);

  if (!visible || !profile) return null;

  const reopen = async (step: number) => { await reopenOnboarding(profile.id, state, step); await refreshProfile(); };
  const dismiss = async () => { setHidden(true); await saveOnboardingState(profile.id, { ...state, checklist_dismissed: true }); refreshProfile(); };

  const items: Item[] = [
    { key: 'branding', label: t('Logo & Farbe festlegen'), hint: t('Deine Marke in der Klienten-App'), icon: Sparkles, run: () => reopen(1) },
    { key: 'package', label: t('Erstes Angebot anlegen'), hint: t('Preisliste im Business-Tab'), icon: PackageIcon, run: () => nav('/trainer/business') },
    { key: 'plan', label: t('Ersten Plan bauen'), hint: t('Aus einer Vorlage oder selbst'), icon: Dumbbell, run: () => nav('/trainer/plan-builder') },
    { key: 'client', label: t('Ersten Klienten einladen'), hint: t('Code teilen — die Verbindung passiert automatisch'), icon: UserPlus, run: () => reopen(4) },
    { key: 'intake', label: t('Eigene Aufnahmefragen'), hint: t('Was neue Klienten bei der Anmeldung beantworten'), icon: ListChecks, run: () => setQuestions('intake') },
    { key: 'checkin', label: t('Wöchentlichen Check-in anpassen'), hint: t('Deine Fragen im wöchentlichen Check-in'), icon: ClipboardCheck, run: () => setQuestions('checkin') },
    { key: 'calendar', label: t('Ersten Termin eintragen'), hint: t('Kalender mit deinen Sessions'), icon: Calendar, run: () => nav('/trainer/klienten?view=kalender') },
  ];
  const doneCount = status ? items.filter((i) => status[i.key]).length : 0;
  // Open items first, done ones at the bottom.
  const sorted = status ? [...items].sort((a, b) => Number(status[a.key]) - Number(status[b.key])) : items;

  return (
    <div data-testid="coach-checklist" className="adlr-card p-4 mb-5 adlr-fade-in" style={{ border: '1px solid rgb(var(--adlr-gold) / 0.3)' }}>
      <div className="flex items-start gap-3 mb-3">
        <div className="flex-1">
          <p className="text-xs uppercase tracking-widest text-adlr-gold mb-0.5">{t('Dein Start')}</p>
          <p className="text-sm font-semibold text-white">{doneCount === items.length ? t('Alles eingerichtet — stark!') : t('{done} von {total} erledigt', { done: doneCount, total: items.length })}</p>
        </div>
        <button onClick={dismiss} className="adlr-tap p-1 -m-1 text-white/35" aria-label={t('Checkliste ausblenden')}><X size={16} /></button>
      </div>
      <div className="h-1 rounded-full mb-3 overflow-hidden" style={{ background: 'rgb(var(--text) / 0.08)' }}>
        <div className="h-full rounded-full bg-adlr-gold transition-all duration-500" style={{ width: `${(doneCount / items.length) * 100}%` }} />
      </div>
      <div className="space-y-1">
        {sorted.map((it) => {
          const ok = !!status?.[it.key];
          const Icon = it.icon;
          return (
            <button key={it.key} onClick={it.run} className="adlr-tap w-full flex items-center gap-3 rounded-xl px-2.5 py-2.5 text-left" style={{ background: ok ? 'transparent' : 'rgb(var(--text) / 0.03)' }}>
              <span className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                style={ok ? { background: 'rgb(34 197 94 / 0.15)', color: '#22c55e' } : { background: 'rgb(var(--adlr-gold) / 0.12)', color: 'rgb(var(--adlr-gold))' }}>
                {ok ? <Check size={14} /> : <Icon size={14} />}
              </span>
              <span className="flex-1 min-w-0">
                <span className={`block text-sm ${ok ? 'text-white/40 line-through' : 'text-white/85'}`}>{it.label}</span>
                {!ok && <span className="block text-[11px] text-white/40 truncate">{it.hint}</span>}
              </span>
              {!ok && <ChevronRight size={15} className="text-white/25 shrink-0" />}
            </button>
          );
        })}
      </div>
      {questions && <CoachQuestionsEditor onClose={() => setQuestions(null)} initialContext={questions} />}
    </div>
  );
}
