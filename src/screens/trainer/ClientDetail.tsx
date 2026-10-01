import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase, isMissingFunction } from '@/lib/supabase';
import { captureError } from '@/lib/monitoring';
import { useNavigate } from 'react-router-dom';
import ClientCheckins from '@/components/ClientCheckins';
import type { Profile, ProgressEntry, PersonalRecord, ProgressPhoto, Plan, ClientPlan, WorkoutCompletion, ExerciseSetLog } from '@/lib/types';
import { Card, Loading, CollapsibleCard } from '@/components/ui';
import { ArrowLeft, Edit3, ChevronDown, Dumbbell, Clock, UserMinus, BarChart3, ChevronRight, Sparkles } from 'lucide-react';
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
import { t, fmtDate } from '@/lib/i18n';
import ProgressReport from '@/components/ProgressReport';

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
  const muscleOf = useCallback((n: string) => muscleByName.get(n) ?? 'Sonstige', [muscleByName]);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [showProgress, setShowProgress] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editingPlan, setEditingPlan] = useState(false);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [activePlan, setActivePlan] = useState<ClientPlan | null>(null);

  const load = async () => {
    if (!profile) return;
    setLoading(true);
    const [c, e, p, ph, wc, cp, pl, sl] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', clientId).maybeSingle(),
      supabase.from('progress_entries').select('*').eq('client_id', clientId).order('logged_at', { ascending: true }),
      supabase.from('personal_records').select('*').eq('client_id', clientId),
      supabase.from('progress_photos').select('*').eq('client_id', clientId).order('photo_date', { ascending: false }),
      supabase.from('workout_completions').select('*').eq('client_id', clientId).order('completed_at', { ascending: false }),
      supabase.from('client_plans').select('*').eq('client_id', clientId).eq('is_active', true).maybeSingle(),
      supabase.from('plans').select('*').eq('trainer_id', profile.id),
      supabase.from('exercise_set_logs').select('*').eq('client_id', clientId).order('created_at', { ascending: true }),
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

  const assignPlan = async (planId: string) => {
    if (activePlan) {
      await supabase.from('client_plans').update({ is_active: false }).eq('id', activePlan.id);
    }
    await supabase.from('client_plans').insert({ client_id: clientId, plan_id: planId, is_active: true });
    setEditingPlan(false);
    load();
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

      {/* Profile header */}
      <div className="flex items-center gap-4 mb-6">
        <div className="w-16 h-16 rounded-full bg-adlr-gold/20 border border-adlr-gold/30 flex items-center justify-center text-adlr-gold text-xl font-bold overflow-hidden">
          {client.avatar_url ? <img src={client.avatar_url} alt="" className="w-full h-full object-cover" /> : (client.first_name?.[0] ?? '?').toUpperCase()}
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">{client.first_name} {client.last_name}</h1>
          <p className="text-sm text-white/40">{t('{n} Jahre', { n: client.age ?? '' })} · {client.height_cm}cm · {client.weight_kg}kg</p>
        </div>
      </div>

      {/* At-a-glance summary + private trainer notes */}
      <ClientSummary client={client} completions={completions} setLogs={setLogs} entries={entries} activePlan={activePlan} muscleOf={muscleOf} />
      <button
        onClick={() => nav(`/trainer/plan-builder?ai=${client.id}`)}
        className="adlr-tap w-full text-left adlr-card adlr-gold-border p-4 mb-4 flex items-center gap-3"
      >
        <Sparkles size={18} className="text-adlr-gold shrink-0" />
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-semibold text-white">{t('Plan mit KI erstellen')}</span>
          <span className="block text-xs text-white/50">{t('Entwurf für {name} in ~30 Sekunden — du prüfst vor dem Zuweisen.', { name: client.first_name ?? '' })}</span>
        </span>
        <ChevronRight size={16} className="text-white/30" />
      </button>
      <ClientCheckins clientId={client.id} />

      {/* Package, sessions used, payments */}
      <ClientPackageCard clientId={clientId} />

      {/* Goal-driven progress report + AI coach summary (draft → edit → approve) */}
      <button
        onClick={() => setShowProgress(true)}
        className="adlr-tap w-full flex items-center gap-3 rounded-2xl px-4 py-3.5 mb-4 text-left"
        style={{ background: 'rgb(var(--text) / 0.04)', border: '1px solid rgb(var(--adlr-gold) / 0.35)' }}
      >
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgb(var(--adlr-gold) / 0.15)' }}>
          <Sparkles size={18} className="text-adlr-gold" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white">{t('Fortschrittsbericht & KI-Zusammenfassung')}</p>
          <p className="text-xs text-white/50">{t('Entwurf in deinem Ton — erst nach deiner Freigabe sichtbar')}</p>
        </div>
        <ChevronRight size={18} className="text-adlr-gold shrink-0" />
      </button>
      {showProgress && <ProgressReport client={client} trainerMode onClose={() => setShowProgress(false)} />}

      {/* Monthly report — only once the client has data from an earlier calendar month */}
      {setLogs.some((l) => { const d = new Date(l.created_at); return d.getFullYear() * 12 + d.getMonth() < new Date().getFullYear() * 12 + new Date().getMonth(); }) && (
        <button
          onClick={() => setShowReport(true)}
          className="adlr-tap w-full flex items-center gap-3 rounded-2xl px-4 py-3.5 mb-4 adlr-gold-border"
          style={{ background: 'linear-gradient(135deg, rgb(var(--adlr-gold) / 0.14), rgb(var(--adlr-gold) / 0.04))' }}
        >
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgb(var(--adlr-gold) / 0.15)' }}>
            <BarChart3 size={18} className="text-adlr-gold" />
          </div>
          <div className="flex-1 text-left">
            <p className="text-sm font-semibold text-white">{t('Monatsbericht')}</p>
            <p className="text-xs text-white/50">{t('Der Monat von {name} in Zahlen', { name: client.first_name ?? '' })}</p>
          </div>
          <ChevronRight size={18} className="text-adlr-gold shrink-0" />
        </button>
      )}
      {showReport && <MonthlyReport clientId={clientId} clientName={client.first_name ?? undefined} onClose={() => setShowReport(false)} />}

      {/* Intake summary */}
      <CollapsibleCard className="mb-4" title={t('Intake Antworten')} subtitle={(intake.goals ?? []).map((x) => t(x)).join(', ') || t('Onboarding-Angaben')}>
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
      </CollapsibleCard>

      {/* Weight chart */}
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

      {/* Apple Health / Health Connect (last 7 days) */}
      <Card className="mb-4">
        <p className="text-sm font-medium text-white/80 mb-3">{t('Gesundheit · letzte 7 Tage')}</p>
        <HealthSummary clientId={clientId} emptyText={t('Noch keine Daten — der Klient kann Apple Health / Health Connect im Profil verbinden.')} />
      </Card>

      {/* Strength curve per exercise */}
      <Card className="mb-4">
        <p className="text-sm font-medium text-white/80 mb-3">{t('Kraftentwicklung')}</p>
        <ExerciseProgress setLogs={setLogs} completions={completions} />
      </Card>

      {/* Workout history */}
      <Card className="mb-4">
        <TrainingHistory completions={completions} setLogs={setLogs} dayNameById={dayNameById} muscleOf={muscleOf} limit={10} collapsible />
      </Card>

      {/* PRs */}
      <Card className="mb-4">
        <PersonalRecords prs={prs} />
      </Card>

      {/* Photos */}
      {photos.length > 0 && (
        <CollapsibleCard className="mb-4" title={t('Fortschrittsfotos')} subtitle={`${t(photos.length === 1 ? '{n} Foto' : '{n} Fotos', { n: photos.length })} · ${t('zuletzt')} ${fmtDate(photos[0].photo_date, { day: '2-digit', month: '2-digit', year: '2-digit' })}`}>
          <div className="grid grid-cols-3 gap-2">
            {photos.map((ph) => (
              <div key={ph.id} className="aspect-square rounded-lg overflow-hidden bg-inset"><SignedPhoto path={ph.storage_path} /></div>
            ))}
          </div>
        </CollapsibleCard>
      )}

      {/* Plan assignment */}
      <Card className="mb-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-medium text-white/80">{t('Trainingsplan')}</p>
          <button onClick={() => setEditingPlan(!editingPlan)} className="text-adlr-gold text-sm flex items-center gap-1 adlr-tap"><Edit3 size={14} /> {t('Ändern')}</button>
        </div>
        {activePlan ? (
          <p className="text-sm text-white/60">{t('Aktiv')}: {plans.find((p) => p.id === activePlan.plan_id)?.name ?? '—'}</p>
        ) : <p className="text-sm text-white/40">{t('Kein Plan zugewiesen.')}</p>}
        {(() => { const ed = plans.find((p) => p.id === activePlan?.plan_id)?.client_edited_at; return ed ? <p className="text-xs text-adlr-gold/80 mt-1">{t('Vom Klienten angepasst · {date}', { date: fmtDate(ed, { day: '2-digit', month: '2-digit', year: '2-digit' }) })}</p> : null; })()}
        <button
          onClick={toggleCanEdit}
          className="adlr-tap w-full flex items-center justify-between gap-3 mt-3 pt-3 text-left"
          style={{ borderTop: '1px solid rgb(var(--text) / 0.07)' }}
        >
          <span className="min-w-0">
            <span className="block text-sm text-white/80">{t('Klient darf Plan selbst anpassen')}</span>
            <span className="block text-xs text-white/40">{t('Übungen tauschen, hinzufügen, Sätze/Wdh ändern — nur aus der Übungsbibliothek.')}</span>
          </span>
          <span className="relative shrink-0 w-11 h-6 rounded-full transition-colors" style={{ background: client.can_edit_plan ? 'rgb(var(--adlr-gold))' : 'rgb(var(--text) / 0.15)' }}>
            <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all" style={{ left: client.can_edit_plan ? 22 : 2 }} />
          </span>
        </button>
        {canEditErr && <p className="text-xs text-red-400 mt-1">{canEditErr}</p>}
        {editingPlan && (
          <div className="mt-3 space-y-2 adlr-fade-in">
            {plans.map((p) => (
              <button key={p.id} onClick={() => assignPlan(p.id)} className="adlr-tap w-full text-left px-4 py-3 rounded-xl bg-white/5 border border-white/10 hover:border-adlr-gold/40 text-sm text-white/80">
                {p.name} {p.is_template && <span className="text-xs text-adlr-gold/60">({t('Vorlage')})</span>}
              </button>
            ))}
            {plans.length === 0 && <p className="text-xs text-white/30">{t('Erstelle zuerst einen Plan im Plan Builder.')}</p>}
          </div>
        )}
      </Card>


      {/* Remove client from roster (unlink — account & data stay) */}
      <button
        onClick={removeClient}
        className="adlr-tap w-full py-3 rounded-xl text-sm font-medium mb-2 flex items-center justify-center gap-2"
        style={{ background: 'rgba(248,113,113,0.10)', color: '#f87171', border: '1px solid rgba(248,113,113,0.3)' }}
      >
        <UserMinus size={15} /> {confirmRemove ? t('Wirklich entfernen? Nochmal tippen') : t('Klient entfernen')}
      </button>
      {removeErr && <p className="text-xs text-red-400 text-center mb-2">{removeErr}</p>}
      <p className="text-xs text-white/30 text-center mb-4">{t('Entfernt den Klienten aus deiner Liste — Konto und Daten bleiben erhalten.')}</p>
    </div>
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
