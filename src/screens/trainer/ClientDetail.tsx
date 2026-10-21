import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase, isMissingFunction } from '@/lib/supabase';
import { fetchAll } from '@/lib/fetchAll';
import { captureError } from '@/lib/monitoring';
import { useNavigate } from 'react-router-dom';
import ClientCheckins from '@/components/ClientCheckins';
import { AnswerList } from '@/components/QuestionFields';
import { intakeAnswers } from '@/lib/coachQuestions';
import type { Profile, ProgressEntry, PersonalRecord, ProgressPhoto, Plan, ClientPlan, WorkoutCompletion, ExerciseSetLog } from '@/lib/types';
import { Card, Loading, CollapsibleCard } from '@/components/ui';
import { ArrowLeft, ChevronDown, Dumbbell, Clock, UserMinus, BarChart3, ChevronRight, Sparkles, MessageSquare, FileText, Activity, StickyNote, ClipboardCheck, Wallet, TrendingUp, Utensils, HeartPulse } from 'lucide-react';
import ClientPlanCard from '@/components/ClientPlanCard';
import BottomSheet from '@/components/BottomSheet';
import FoodDiary from '@/components/food/FoodDiary';
import MonthlyReport from '@/components/MonthlyReport';
import TrainingHistory from '@/components/TrainingHistory';
import ExerciseProgress from '@/components/ExerciseProgress';
import PersonalRecords from '@/components/PersonalRecords';
import ClientSummary from '@/components/ClientSummary';
import ClientPackageCard from '@/components/business/ClientPackageCard';
import HealthSummary from '@/components/HealthSummary';
import { fetchExercises } from '@/lib/exercises';
import { useAsyncData } from '@/lib/useAsyncData';
import SignedPhoto from '@/components/SignedPhoto';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { t, fmtDate, tUserTitle } from '@/lib/i18n';
import ProgressReport from '@/components/ProgressReport';
import { guessMuscle } from '@/lib/muscleGuess';

const GOAL_LABELS: Record<string, string> = {
  nutrition: 'Ernährungs-Analyse',
  body: 'Körperanalyse Session',
  extra: 'Extra Session',
  checkin: 'Monatlicher Check-in Call',
  transformation: 'Transformation Paket',
};

export default function ClientDetail({ clientId, onBack }: { clientId: string; onBack: () => void }) {
  const nav = useNavigate();
  const { profile } = useAuth();
  const [client, setClient] = useState<Profile | null>(null);
  const [entries, setEntries] = useState<ProgressEntry[]>([]);
  const [prs, setPrs] = useState<PersonalRecord[]>([]);
  const [photos, setPhotos] = useState<ProgressPhoto[]>([]);
  const [completions, setCompletions] = useState<WorkoutCompletion[]>([]);
  const [setLogs, setSetLogs] = useState<ExerciseSetLog[]>([]);
  const [planDays, setPlanDays] = useState<{ id: string; workout_name: string | null }[]>([]);
  const { data: library } = useAsyncData(fetchExercises, []);
  const muscleByName = useMemo(() => new Map((library ?? []).map((e) => [e.name, e.muscle_group])), [library]);
  const muscleOf = useCallback((n: string) => muscleByName.get(n) ?? guessMuscle(n) ?? 'Sonstige', [muscleByName]);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [showProgress, setShowProgress] = useState(false);
  const [loading, setLoading] = useState(true);
  // Sections as tabs — the page used to be one long scroll with the plan hidden at the bottom.
  const [tab, setTab] = useState<Tab>(() => { try { return (sessionStorage.getItem('adlr_client_tab') as Tab) || 'overview'; } catch { return 'overview'; } });
  const [sheet, setSheet] = useState<null | 'status' | 'notes' | 'checkins' | 'package' | 'food'>(null);
  const [checkinInfo, setCheckinInfo] = useState<{ total: number; open: number } | null>(null);
  useEffect(() => {
    supabase.from('weekly_checkins').select('replied_at').eq('client_id', clientId).order('week_start', { ascending: false }).limit(12)
      .then(({ data, error }) => setCheckinInfo(error ? null : { total: (data ?? []).length, open: (data ?? []).filter((r: { replied_at: string | null }) => !r.replied_at).length }));
  }, [clientId, sheet]);
  const pickTab = (x: Tab) => { setTab(x); try { sessionStorage.setItem('adlr_client_tab', x); } catch { /* ignore */ } };
  const [plans, setPlans] = useState<Plan[]>([]);
  const [activePlan, setActivePlan] = useState<ClientPlan | null>(null);

  // quiet = refresh in place (after editing a workout) — no spinner, the page keeps its open sections
  const load = async (quiet = false) => {
    if (!profile) return;
    if (!quiet) setLoading(true);
    const [c, e, p, ph, wc, cp, pl, sl] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', clientId).maybeSingle(),
      supabase.from('progress_entries').select('*').eq('client_id', clientId).order('logged_at', { ascending: true }),
      supabase.from('personal_records').select('*').eq('client_id', clientId),
      supabase.from('progress_photos').select('*').eq('client_id', clientId).order('photo_date', { ascending: false }),
      supabase.from('workout_completions').select('*').eq('client_id', clientId).order('completed_at', { ascending: false }),
      supabase.from('client_plans').select('*').eq('client_id', clientId).eq('is_active', true).maybeSingle(),
      supabase.from('plans').select('*').eq('trainer_id', profile.id),
      fetchAll((a, b) => supabase.from('exercise_set_logs').select('*').eq('client_id', clientId).order('created_at', { ascending: true }).order('id').range(a, b)),
    ]);
    setClient(c.data as Profile | null);
    setEntries((e.data ?? []) as ProgressEntry[]);
    setPrs((p.data ?? []) as PersonalRecord[]);
    setPhotos((ph.data ?? []) as ProgressPhoto[]);
    const wcList = (wc.data ?? []) as WorkoutCompletion[];
    setCompletions(wcList);
    setSetLogs((sl.data ?? []) as ExerciseSetLog[]);
    setActivePlan((cp.data as ClientPlan | null) ?? null);
    setPlans((pl.data ?? []) as Plan[]);
    // Fetch workout-day names for the sessions in the history
    const dayIds = [...new Set(wcList.map((w) => w.plan_day_id).filter(Boolean))] as string[];
    if (dayIds.length > 0) {
      const { data: pds } = await supabase.from('plan_days').select('id, workout_name').in('id', dayIds);
      setPlanDays((pds ?? []) as { id: string; workout_name: string | null }[]);
    } else {
      setPlanDays([]);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [clientId, profile?.id]);


  // Remove client from this trainer's roster (unlink — keeps the account + data, RLS-safe).
  const [removeErr, setRemoveErr] = useState<string | null>(null);
  const removeClient = async () => {
    if (!confirmRemove) { setConfirmRemove(true); setTimeout(() => setConfirmRemove(false), 3500); return; }
    setRemoveErr(null);
    let { error } = await supabase.rpc('trainer_remove_client', { p_client: clientId });
    if (error && isMissingFunction(error)) {
      // Migration 20261002_trainer_delete_fix.sql not run yet — old client-side path.
      await supabase.from('client_plans').update({ is_active: false }).eq('client_id', clientId);
      const res = await supabase.from('profiles').update({ trainer_id: null }).eq('id', clientId).select('id');
      error = res.error ?? (res.data?.length ? null : { message: 'nothing updated' } as typeof error);
    }
    if (error) {
      captureError(error, { action: 'trainer_remove_client' });
      setRemoveErr(t('Klient konnte nicht entfernt werden.'));
      return;
    }
    onBack();
  };

  const [canEditErr, setCanEditErr] = useState<string | null>(null);
  const toggleCanEdit = async () => {
    if (!client) return;
    const next = !client.can_edit_plan;
    setCanEditErr(null);
    setClient({ ...client, can_edit_plan: next });
    const { error } = await supabase.from('profiles').update({ can_edit_plan: next }).eq('id', client.id);
    if (error) { setClient({ ...client, can_edit_plan: !next }); setCanEditErr(t('Speichern fehlgeschlagen (Migration ausgeführt?)')); }
  };

  const assignPlan = async (planId: string): Promise<boolean> => {
    // New assignment first, then retire the old one — never leave the client without a plan.
    const { error } = await supabase.from('client_plans').upsert({ client_id: clientId, plan_id: planId, is_active: true, assigned_at: new Date().toISOString() }, { onConflict: 'client_id,plan_id' });
    if (error) { captureError(error, { action: 'assign_plan' }); return false; }
    await supabase.from('client_plans').update({ is_active: false }).eq('client_id', clientId).neq('plan_id', planId);
    await load(true);
    return true;
  };

  if (loading) return <Loading />;
  if (!client) return <p className="text-white/40 text-center py-12">{t('Klient nicht gefunden.')}</p>;

  const intake = client.intake ?? {};
  const chartData = entries.map((e) => ({ date: fmtDate(e.logged_at, { day: '2-digit', month: '2-digit' }), gewicht: e.weight_kg }));

  const dayNameById = new Map(planDays.map((d) => [d.id, d.workout_name ?? t('Training')]));

  return (
    <div className="adlr-fade-in">
      <button onClick={onBack} className="flex items-center gap-2 text-white/50 text-sm mb-4 adlr-tap">
        <ArrowLeft size={16} /> {t('Zurück')}
      </button>

      {/* Header */}
      <div className="flex items-center gap-4 mb-4">
        <div className="w-16 h-16 rounded-full bg-adlr-gold/20 border border-adlr-gold/30 flex items-center justify-center text-adlr-gold text-xl font-bold overflow-hidden shrink-0">
          {client.avatar_url ? <img src={client.avatar_url} alt="" className="w-full h-full object-cover" /> : (client.first_name?.[0] ?? '?').toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-white truncate">{client.first_name} {client.last_name}</h1>
          <p className="text-sm text-white/40 truncate">{[client.age ? t('{n} Jahre', { n: client.age }) : null, client.height_cm ? `${client.height_cm} cm` : null, client.weight_kg ? `${client.weight_kg} kg` : null].filter(Boolean).join(' · ')}</p>
        </div>
        <button onClick={() => nav(`/trainer/nachrichten?client=${client.id}`)} aria-label={t('Nachricht')} className="adlr-tap w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ background: 'rgb(var(--adlr-gold) / 0.14)', color: 'rgb(var(--adlr-gold))' }}>
          <MessageSquare size={17} />
        </button>
      </div>

      {/* Tabs */}
      <div className="sticky top-[calc(env(safe-area-inset-top)+3.5rem)] z-10 -mx-5 px-5 pt-1 pb-3 mb-1 bg-adlr-black">
        <div className="grid grid-cols-4 gap-1 p-1 rounded-xl" style={{ background: 'rgb(var(--text) / 0.05)' }}>
          {TABS.map((x) => (
            <button key={x.id} onClick={() => pickTab(x.id)} className="adlr-tap py-2 rounded-lg text-xs font-semibold transition-colors"
              style={tab === x.id ? { background: 'rgb(var(--adlr-gold))', color: '#000' } : { color: 'rgb(var(--text) / 0.55)' }}>
              {t(x.label)}
            </button>
          ))}
        </div>
      </div>

      <div key={tab} className="adlr-fade-in">
      {tab === 'overview' && (
        <>
          {/* Like Everfit/Trainerize: a few key numbers, the plan, tiles that open details — nothing expanded by default */}
          <ClientSummary part="glance" client={client} completions={completions} setLogs={setLogs} entries={entries} activePlan={activePlan} muscleOf={muscleOf} />
          <ClientPlanCard client={client} activePlan={activePlan} plans={plans} onAssign={assignPlan}
            onOpen={(id) => nav(`/trainer/plan-builder?plan=${id}&client=${client.id}`)} onAi={() => nav(`/trainer/plan-builder?ai=${client.id}`)} />
          <div className="grid grid-cols-2 gap-2 mb-4">
            <Tile icon={Activity} title={t('Status & Ernährung')} hint={t('Compliance, Kalorien, Zahlen')} onClick={() => setSheet('status')} />
            <Tile icon={StickyNote} title={t('Notizen')} hint={t('nur für dich sichtbar')} onClick={() => setSheet('notes')} />
            <Tile icon={ClipboardCheck} title={t('Check-ins')} onClick={() => setSheet('checkins')}
              hint={!checkinInfo || checkinInfo.total === 0 ? t('Noch keiner') : checkinInfo.open > 0 ? t('{n} unbeantwortet', { n: checkinInfo.open }) : t('Alle beantwortet')}
              badge={!!checkinInfo && checkinInfo.open > 0} />
            <Tile icon={Utensils} title={t('Ernährungstagebuch')} hint={t('Was {name} gegessen hat', { name: client.first_name ?? '' })} onClick={() => setSheet('food')} />
            <Tile icon={Wallet} title={t('Paket & Zahlungen')} hint={t('Einheiten, offene Beträge')} onClick={() => setSheet('package')} />
          </div>
          {completions.length > 0 && (
            <div className="adlr-card p-4 mb-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[11px] uppercase tracking-wider text-white/40">{t('Letzte Trainings')}</p>
                <button onClick={() => pickTab('training')} className="adlr-tap text-xs font-medium text-adlr-gold flex items-center gap-0.5">{t('Alle')} <ChevronRight size={13} /></button>
              </div>
              {completions.slice(0, 3).map((c) => (
                <div key={c.id} className="flex items-center gap-3 py-2" style={{ borderTop: '1px solid rgb(var(--text) / 0.05)' }}>
                  <Dumbbell size={14} className="text-white/35 shrink-0" />
                  <span className="flex-1 min-w-0 text-sm text-white/80 truncate">{c.plan_day_id ? dayNameById.get(c.plan_day_id) ?? t('Training') : tUserTitle(c.title) || t('Freies Training')}</span>
                  <span className="text-[11px] text-white/40 shrink-0">{[c.duration_sec ? `${Math.round(c.duration_sec / 60)} min` : null, fmtDate(c.completed_at, { day: 'numeric', month: 'short' })].filter(Boolean).join(' · ')}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'training' && (
        <>
          <Card className="mb-4">
            <TrainingHistory completions={completions} setLogs={setLogs} dayNameById={dayNameById} muscleOf={muscleOf} limit={10} collapsible onChanged={() => load(true)} />
          </Card>
          <CollapsibleCard id="cd_strength" className="mb-4" icon={TrendingUp} title={t('Kraftentwicklung')} subtitle={t('Verlauf je Übung')}>
            <ExerciseProgress setLogs={setLogs} completions={completions} />
          </CollapsibleCard>
          <Card className="mb-4">
            <PersonalRecords prs={prs} />
          </Card>
          <ActionRow icon={Sparkles} title={t('Plan mit KI erstellen')} subtitle={t('Entwurf für {name} in ~30 Sekunden — du prüfst vor dem Zuweisen.', { name: client.first_name ?? '' })} onClick={() => nav(`/trainer/plan-builder?ai=${client.id}`)} />
        </>
      )}

      {tab === 'progress' && (
        <>
          <ActionRow icon={FileText} title={t('Fortschrittsbericht & KI-Zusammenfassung')} subtitle={t('Entwurf in deinem Ton — erst nach deiner Freigabe sichtbar')} onClick={() => setShowProgress(true)} />
          {setLogs.some((l) => { const d = new Date(l.created_at); return d.getFullYear() * 12 + d.getMonth() < new Date().getFullYear() * 12 + new Date().getMonth(); }) && (
            <ActionRow icon={BarChart3} title={t('Monatsbericht')} subtitle={t('Der Monat von {name} in Zahlen', { name: client.first_name ?? '' })} onClick={() => setShowReport(true)} />
          )}
          {chartData.length > 0 && (
            <Card className="mb-4">
              <p className="text-sm font-medium text-white/80 mb-3">{t('Gewichtsverlauf')}</p>
              <ResponsiveContainer width="100%" height={140}>
                <LineChart data={chartData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                  <Line type="monotone" dataKey="gewicht" stroke="rgb(var(--adlr-gold))" strokeWidth={2} dot={{ fill: 'rgb(var(--adlr-gold))', r: 3 }} />
                  <XAxis dataKey="date" stroke="rgb(var(--text) / 0.25)" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis stroke="rgb(var(--text) / 0.25)" fontSize={10} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ background: 'rgb(var(--adlr-anthracite))', border: '1px solid rgb(var(--text) / 0.12)', borderRadius: 8, fontSize: 12 }} />
                </LineChart>
              </ResponsiveContainer>
            </Card>
          )}
          <CollapsibleCard id="cd_health" className="mb-4" icon={HeartPulse} title={t('Gesundheit · letzte 7 Tage')} subtitle={t('Schritte, Schlaf, Kalorien')}>
            <HealthSummary clientId={clientId} emptyText={t('Noch keine Daten — der Klient kann Apple Health / Health Connect im Profil verbinden.')} />
          </CollapsibleCard>
          {photos.length > 0 && (
            <CollapsibleCard className="mb-4" title={t('Fortschrittsfotos')} subtitle={`${t(photos.length === 1 ? '{n} Foto' : '{n} Fotos', { n: photos.length })} · ${t('zuletzt')} ${fmtDate(photos[0].photo_date, { day: '2-digit', month: '2-digit', year: '2-digit' })}`}>
              <div className="grid grid-cols-3 gap-2">
                {photos.map((ph) => (
                  <div key={ph.id} className="aspect-square rounded-lg overflow-hidden bg-inset"><SignedPhoto path={ph.storage_path} /></div>
                ))}
              </div>
            </CollapsibleCard>
          )}
        </>
      )}

      {tab === 'profile' && (
        <>
          <Card className="mb-4">
            <button onClick={toggleCanEdit} className="adlr-tap w-full flex items-center justify-between gap-3 text-left">
              <span className="min-w-0">
                <span className="block text-sm text-white/80">{t('Klient darf Plan selbst anpassen')}</span>
                <span className="block text-xs text-white/40">{t('Übungen tauschen, hinzufügen, Sätze/Wdh ändern — nur aus der Übungsbibliothek.')}</span>
              </span>
              <span className="relative shrink-0 w-11 h-6 rounded-full transition-colors" style={{ background: client.can_edit_plan ? 'rgb(var(--adlr-gold))' : 'rgb(var(--text) / 0.15)' }}>
                <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all" style={{ left: client.can_edit_plan ? 22 : 2 }} />
              </span>
            </button>
            {canEditErr && <p className="text-xs text-red-400 mt-1">{canEditErr}</p>}
          </Card>
          <CollapsibleCard id="cd_intake" className="mb-4" title={t('Intake Antworten')} subtitle={(intake.goals ?? []).map((x) => t(x)).join(', ') || t('Onboarding-Angaben')}>
            <div className="space-y-1.5 text-sm">
              <Row label={t('Ziele')} value={(intake.goals ?? []).map((x) => t(x)).join(', ')} />
              <Row label={t('Erfahrung')} value={intake.experience && t(`exp|${intake.experience}`)} />
              <Row label={t('Trainingstage')} value={t('{n} Tage', { n: (intake.trainingDays ?? []).length })} />
              <Row label={t('Equipment')} value={intake.equipment && t(intake.equipment)} />
              <Row label={t('Verletzungen')} value={(intake.injuries ?? []).map((x) => t(x)).join(', ')} />
              <Row label={t('Ernährung')} value={intake.dietRestrictions ? intake.dietRestrictions.map((x) => t(x)).join(', ') : '—'} />
              <Row label={t('Commitment')} value={intake.commitmentLevel ? `${intake.commitmentLevel}/5` : '—'} />
              <Row label={t('Warum jetzt')} value={intake.whyNow} />
            </div>
            {intakeAnswers(intake).length > 0 && (
              <div className="mt-3 pt-3 border-t border-white/5">
                <p className="text-[11px] uppercase tracking-wider text-adlr-gold/80 mb-2">{t('Deine eigenen Fragen')}</p>
                <AnswerList answers={intakeAnswers(intake)} />
              </div>
            )}
          </CollapsibleCard>
          <Card className="mb-4">
            <p className="text-sm font-medium text-white/80 mb-2">{t('Kontakt')}</p>
            <div className="space-y-1.5 text-sm">
              <Row label={t('E-Mail')} value={client.email} />
              <Row label={t('Telefon')} value={client.phone} />
              <Row label={t('Dabei seit')} value={fmtDate(client.created_at, { day: 'numeric', month: 'long', year: 'numeric' })} />
            </div>
          </Card>

          {/* Remove client from roster (unlink — account & data stay) */}
          <button
            onClick={removeClient}
            className="adlr-tap w-full py-3 rounded-xl text-sm font-medium mb-2 mt-6 flex items-center justify-center gap-2"
            style={{ background: 'rgba(248,113,113,0.10)', color: '#f87171', border: '1px solid rgba(248,113,113,0.3)' }}
          >
            <UserMinus size={15} /> {confirmRemove ? t('Wirklich entfernen? Nochmal tippen') : t('Klient entfernen')}
          </button>
          {removeErr && <p className="text-xs text-red-400 text-center mb-2">{removeErr}</p>}
          <p className="text-xs text-white/30 text-center mb-4">{t('Entfernt den Klienten aus deiner Liste — Konto und Daten bleiben erhalten.')}</p>
        </>
      )}
      </div>
      {sheet && (
        <BottomSheet onClose={() => setSheet(null)} title={sheet === 'status' ? t('Status & Ernährung') : sheet === 'notes' ? t('Notizen') : sheet === 'checkins' ? t('Check-ins') : sheet === 'food' ? t('Ernährungstagebuch') : t('Paket & Zahlungen')}>
          {sheet === 'status' && <ClientSummary part="details" client={client} completions={completions} setLogs={setLogs} entries={entries} activePlan={activePlan} muscleOf={muscleOf} />}
          {sheet === 'notes' && <ClientSummary part="notes" client={client} completions={completions} setLogs={setLogs} entries={entries} activePlan={activePlan} muscleOf={muscleOf} />}
          {sheet === 'checkins' && (checkinInfo && checkinInfo.total > 0
            ? <ClientCheckins clientId={client.id} kcalTarget={client.kcal_target ?? null} />
            : <p className="text-sm text-white/45 text-center py-8">{t('{name} hat noch keinen Check-in ausgefüllt.', { name: client.first_name ?? '' })}</p>)}
          {sheet === 'package' && <ClientPackageCard clientId={clientId} embedded />}
          {sheet === 'food' && <FoodDiary clientId={clientId} readOnly />}
        </BottomSheet>
      )}
      {showProgress && <ProgressReport client={client} trainerMode onClose={() => setShowProgress(false)} />}
      {showReport && <MonthlyReport clientId={clientId} clientName={client.first_name ?? undefined} onClose={() => setShowReport(false)} />}
    </div>
  );
}

type Tab = 'overview' | 'training' | 'progress' | 'profile';
const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Überblick' },
  { id: 'training', label: 'Training' },
  { id: 'progress', label: 'Fortschritt' },
  { id: 'profile', label: 'Profil' },
];

function Tile({ icon: Icon, title, hint, onClick, badge }: { icon: typeof Sparkles; title: string; hint: string; onClick: () => void; badge?: boolean }) {
  return (
    <button onClick={onClick} className="adlr-tap adlr-card p-3.5 text-left relative">
      {badge && <span className="absolute top-3 right-3 w-2 h-2 rounded-full" style={{ background: 'rgb(var(--adlr-gold))' }} />}
      <Icon size={17} className="text-adlr-gold mb-2" />
      <p className="text-sm font-semibold text-white leading-tight">{title}</p>
      <p className="text-[11px] text-white/40 mt-0.5 truncate">{hint}</p>
    </button>
  );
}

function ActionRow({ icon: Icon, title, subtitle, onClick }: { icon: typeof Sparkles; title: string; subtitle: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="adlr-tap w-full flex items-center gap-3 rounded-2xl px-4 py-3.5 mb-4 text-left adlr-card">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgb(var(--adlr-gold) / 0.15)' }}>
        <Icon size={18} className="text-adlr-gold" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white">{title}</p>
        <p className="text-xs text-white/50">{subtitle}</p>
      </div>
      <ChevronRight size={18} className="text-white/30 shrink-0" />
    </button>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1">
      <span className="text-white/40 flex-shrink-0">{label}</span>
      <span className="text-white/80 text-right">{value || '—'}</span>
    </div>
  );
}
