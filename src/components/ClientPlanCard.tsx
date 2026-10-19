import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronRight, ClipboardList, Loader2, Repeat, Search, Sparkles, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { ClientPlan, Plan, Profile } from '@/lib/types';
import { programState, type WeekRule } from '@/lib/program';
import { t, fmtDate } from '@/lib/i18n';

type DayRow = { id: string; day_of_week: number; workout_name: string | null; is_rest_day: boolean; exercises: unknown[] | null };

/** Trainer ClientDetail: the client's training plan, front and centre — what's assigned,
 *  the training days at a glance, open it in the Plan Builder or switch to another plan. */
export default function ClientPlanCard({ client, activePlan, plans, onAssign, onOpen, onAi, onToggleCanEdit, canEditErr }: {
  client: Profile;
  activePlan: ClientPlan | null;
  plans: Plan[];
  onAssign: (planId: string) => Promise<boolean>;
  onOpen: (planId: string) => void;
  onAi: () => void;
  onToggleCanEdit: () => void;
  canEditErr: string | null;
}) {
  const plan = activePlan ? plans.find((p) => p.id === activePlan.plan_id) ?? null : null;
  const [days, setDays] = useState<DayRow[] | null>(null);
  const [picker, setPicker] = useState(false);

  useEffect(() => {
    if (!activePlan) { setDays([]); return; }
    setDays(null);
    supabase.from('plan_days').select('id, day_of_week, workout_name, is_rest_day, exercises').eq('plan_id', activePlan.plan_id).order('day_of_week')
      .then(({ data }) => setDays((data ?? []) as DayRow[]));
  }, [activePlan?.plan_id]);

  const training = (days ?? []).filter((d) => !d.is_rest_day && (d.exercises?.length ?? 0) > 0);
  const prog = plan ? programState(plan.weeks, plan.week_rules as WeekRule[] | null | undefined, activePlan?.assigned_at) : null;
  const name = client.first_name ?? '';

  return (
    <div className="adlr-card adlr-gold-border p-5 mb-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] uppercase tracking-wider text-adlr-gold/85 flex items-center gap-1.5"><ClipboardList size={13} /> {t('Trainingsplan')}</p>
        {plan && <button onClick={() => setPicker(true)} className="adlr-tap text-xs font-medium text-white/55 flex items-center gap-1"><Repeat size={13} /> {t('Wechseln')}</button>}
      </div>

      {plan ? (
        <>
          <button onClick={() => onOpen(plan.id)} className="adlr-tap w-full text-left flex items-start gap-2 mb-1">
            <span className="flex-1 min-w-0 text-lg font-bold text-white leading-tight">{plan.name}</span>
            <ChevronRight size={18} className="text-white/30 mt-0.5 shrink-0" />
          </button>
          <p className="text-xs text-white/45 mb-3">
            {[
              t(training.length === 1 ? '1 Trainingstag' : '{n} Trainingstage', { n: training.length }),
              prog ? (prog.finished ? t('Programm abgeschlossen') : t('Woche {n} von {total}', { n: prog.week, total: prog.total })) : null,
              activePlan?.assigned_at ? t('seit {date}', { date: fmtDate(activePlan.assigned_at, { day: 'numeric', month: 'short' }) }) : null,
            ].filter(Boolean).join(' · ')}
          </p>
          {plan.client_edited_at && (
            <p className="text-xs text-adlr-gold/80 mb-3">{t('Vom Klienten angepasst · {date}', { date: fmtDate(plan.client_edited_at, { day: '2-digit', month: '2-digit', year: '2-digit' }) })}</p>
          )}
          {days === null ? (
            <div className="py-3 flex justify-center"><Loader2 size={16} className="animate-spin text-white/30" /></div>
          ) : training.length > 0 ? (
            <div className="space-y-1.5 mb-4">
              {training.map((d, i) => (
                <div key={d.id} className="flex items-center gap-3 rounded-xl px-3 py-2.5" style={{ background: 'rgb(var(--text) / 0.04)' }}>
                  <span className="w-6 h-6 rounded-lg flex items-center justify-center text-[11px] font-bold shrink-0" style={{ background: 'rgb(var(--adlr-gold) / 0.14)', color: 'rgb(var(--adlr-gold))' }}>{i + 1}</span>
                  <span className="flex-1 min-w-0 text-sm text-white/85 truncate">{d.workout_name || t('Training {n}', { n: i + 1 })}</span>
                  <span className="text-[11px] text-white/40 shrink-0">{t('{n} Übungen', { n: d.exercises?.length ?? 0 })}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-white/40 mb-4">{t('Der Plan hat noch keine Übungen.')}</p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => onOpen(plan.id)} className="adlr-tap py-2.5 rounded-xl text-sm font-semibold" style={{ background: 'rgb(var(--adlr-gold))', color: '#000' }}>{t('Plan bearbeiten')}</button>
            <button onClick={() => setPicker(true)} className="adlr-tap py-2.5 rounded-xl text-sm font-medium bg-white/5 text-white/75">{t('Anderen Plan')}</button>
          </div>
        </>
      ) : (
        <>
          <p className="text-base font-semibold text-white mb-1">{t('{name} hat noch keinen Plan', { name })}</p>
          <p className="text-xs text-white/45 mb-4">{t('Weise einen bestehenden Plan zu oder lass einen Entwurf von der KI erstellen.')}</p>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setPicker(true)} className="adlr-tap py-2.5 rounded-xl text-sm font-semibold" style={{ background: 'rgb(var(--adlr-gold))', color: '#000' }}>{t('Plan zuweisen')}</button>
            <button onClick={onAi} className="adlr-tap py-2.5 rounded-xl text-sm font-medium bg-white/5 text-white/75 flex items-center justify-center gap-1.5"><Sparkles size={14} /> {t('Mit KI')}</button>
          </div>
        </>
      )}

      <button onClick={onToggleCanEdit} className="adlr-tap w-full flex items-center justify-between gap-3 mt-4 pt-4 text-left" style={{ borderTop: '1px solid rgb(var(--text) / 0.07)' }}>
        <span className="min-w-0">
          <span className="block text-sm text-white/80">{t('Klient darf Plan selbst anpassen')}</span>
          <span className="block text-xs text-white/40">{t('Übungen tauschen, hinzufügen, Sätze/Wdh ändern — nur aus der Übungsbibliothek.')}</span>
        </span>
        <span className="relative shrink-0 w-11 h-6 rounded-full transition-colors" style={{ background: client.can_edit_plan ? 'rgb(var(--adlr-gold))' : 'rgb(var(--text) / 0.15)' }}>
          <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all" style={{ left: client.can_edit_plan ? 22 : 2 }} />
        </span>
      </button>
      {canEditErr && <p className="text-xs text-red-400 mt-1">{canEditErr}</p>}

      {picker && <PlanPicker name={name} plans={plans} currentId={plan?.id ?? null} onClose={() => setPicker(false)} onPick={onAssign} />}
    </div>
  );
}

function PlanPicker({ name, plans, currentId, onClose, onPick }: {
  name: string; plans: Plan[]; currentId: string | null; onClose: () => void; onPick: (id: string) => Promise<boolean>;
}) {
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState(false);
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const list = useMemo(() => {
    const visible = plans.filter((p) => !q || norm(p.name).includes(norm(q)));
    return [...visible.filter((p) => !p.is_template), ...visible.filter((p) => p.is_template)];
  }, [plans, q]);

  const pick = async (id: string) => {
    if (id === currentId) { onClose(); return; }
    setBusy(id); setErr(false);
    const ok = await onPick(id);
    setBusy(null);
    if (ok) onClose(); else setErr(true);
  };

  return createPortal(
    <div className="fixed inset-0 z-[70] bg-black/70 flex items-end sm:items-center justify-center adlr-fade-in" onClick={onClose}>
      <div className="w-full max-w-md max-h-[85vh] flex flex-col rounded-t-3xl sm:rounded-3xl bg-adlr-anthracite" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between px-5 pt-5 pb-3">
          <div>
            <p className="text-lg font-bold text-white">{t('Plan zuweisen')}</p>
            <p className="text-xs text-white/45">{t('Wird sofort der aktive Plan von {name}.', { name })}</p>
          </div>
          <button onClick={onClose} aria-label={t('Schließen')} className="adlr-tap p-1.5 text-white/40"><X size={18} /></button>
        </div>
        <div className="px-5 pb-3">
          <div className="flex items-center gap-2 bg-inset border border-white/10 rounded-xl px-3 py-2">
            <Search size={15} className="text-white/35" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Plan suchen')} className="flex-1 min-w-0 bg-transparent text-sm text-white placeholder-white/30 outline-none" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-5 space-y-1.5" style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom))' }}>
          {list.map((p) => (
            <button key={p.id} onClick={() => pick(p.id)} disabled={!!busy}
              className="adlr-tap w-full text-left flex items-center gap-3 px-4 py-3 rounded-xl disabled:opacity-60"
              style={p.id === currentId ? { background: 'rgb(var(--adlr-gold) / 0.12)', border: '1px solid rgb(var(--adlr-gold) / 0.4)' } : { background: 'rgb(var(--text) / 0.04)', border: '1px solid rgb(var(--text) / 0.06)' }}>
              <span className="flex-1 min-w-0">
                <span className="block text-sm text-white/90 truncate">{p.name}</span>
                <span className="block text-[11px] text-white/40">
                  {[p.is_template ? t('Vorlage') : null, p.weeks && p.weeks > 1 ? t('{n} Wochen', { n: p.weeks }) : null, p.id === currentId ? t('aktuell aktiv') : null].filter(Boolean).join(' · ') || ' '}
                </span>
              </span>
              {busy === p.id ? <Loader2 size={16} className="animate-spin text-adlr-gold" /> : p.id === currentId ? <Check size={16} className="text-adlr-gold" /> : null}
            </button>
          ))}
          {list.length === 0 && <p className="text-xs text-white/40 text-center py-6">{plans.length ? t('Nichts gefunden.') : t('Erstelle zuerst einen Plan im Plan Builder.')}</p>}
          {err && <p className="text-xs text-red-400 text-center pt-2">{t('Zuweisen fehlgeschlagen. Bitte erneut versuchen.')}</p>}
        </div>
      </div>
    </div>,
    document.body,
  );
}
