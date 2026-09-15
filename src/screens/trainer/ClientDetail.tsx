import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Profile, ProgressEntry, PersonalRecord, ProgressPhoto, Plan, ClientPlan, WorkoutCompletion, ExerciseSetLog } from '@/lib/types';
import { Button, Card, Field, Input, Textarea, Loading, SectionHeader } from '@/components/ui';
import { ArrowLeft, Edit3, ChevronDown, Dumbbell, Clock, UserMinus, BarChart3, ChevronRight } from 'lucide-react';
import MonthlyReport from '@/components/MonthlyReport';
import SignedPhoto from '@/components/SignedPhoto';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';

const GOAL_LABELS: Record<string, string> = {
  nutrition: 'Ernährungs-Analyse',
  body: 'Körperanalyse Session',
  extra: 'Extra Session',
  checkin: 'Monatlicher Check-in Call',
  transformation: 'Transformation Paket',
};

export default function ClientDetail({ clientId, onBack }: { clientId: string; onBack: () => void }) {
  const [client, setClient] = useState<Profile | null>(null);
  const [entries, setEntries] = useState<ProgressEntry[]>([]);
  const [prs, setPrs] = useState<PersonalRecord[]>([]);
  const [photos, setPhotos] = useState<ProgressPhoto[]>([]);
  const [completions, setCompletions] = useState<WorkoutCompletion[]>([]);
  const [setLogs, setSetLogs] = useState<ExerciseSetLog[]>([]);
  const [planDays, setPlanDays] = useState<{ id: string; workout_name: string | null }[]>([]);
  const [expandedSession, setExpandedSession] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [editingPlan, setEditingPlan] = useState(false);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [activePlan, setActivePlan] = useState<ClientPlan | null>(null);

  const load = async () => {
    setLoading(true);
    const [c, e, p, ph, wc, cp, pl, sl] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', clientId).maybeSingle(),
      supabase.from('progress_entries').select('*').eq('client_id', clientId).order('logged_at', { ascending: true }),
      supabase.from('personal_records').select('*').eq('client_id', clientId),
      supabase.from('progress_photos').select('*').eq('client_id', clientId).order('photo_date', { ascending: false }),
      supabase.from('workout_completions').select('*').eq('client_id', clientId).order('completed_at', { ascending: false }),
      supabase.from('client_plans').select('*').eq('client_id', clientId).eq('is_active', true).maybeSingle(),
      supabase.from('plans').select('*'),
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

  useEffect(() => { load(); }, [clientId]);

  const saveNote = async () => {
    if (!client || !note.trim()) return;
    await supabase.from('session_notes').insert({ client_id: clientId, trainer_id: client.trainer_id ?? '', body: note.trim() });
    setNote('');
  };

  // Remove client from this trainer's roster (unlink — keeps the account + data, RLS-safe).
  const removeClient = async () => {
    if (!confirmRemove) { setConfirmRemove(true); setTimeout(() => setConfirmRemove(false), 3500); return; }
    await supabase.from('client_plans').update({ is_active: false }).eq('client_id', clientId);
    await supabase.from('profiles').update({ trainer_id: null }).eq('id', clientId);
    onBack();
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
  if (!client) return <p className="text-white/40 text-center py-12">Klient nicht gefunden.</p>;

  const intake = client.intake ?? {};
  const attendance = completions.length > 0 ? Math.min(100, Math.round((completions.length / 7) * 100)) : 0;
  const chartData = entries.map((e) => ({ date: new Date(e.logged_at).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit' }), gewicht: e.weight_kg }));

  // Workout history: set logs grouped per completed session, newest first.
  const dayNameById = new Map(planDays.map((d) => [d.id, d.workout_name]));
  const logsByCompletion = new Map<string, ExerciseSetLog[]>();
  for (const l of setLogs) {
    if (!l.workout_completion_id) continue;
    const arr = logsByCompletion.get(l.workout_completion_id) ?? [];
    arr.push(l);
    logsByCompletion.set(l.workout_completion_id, arr);
  }
  const groupByExercise = (logs: ExerciseSetLog[]): Map<string, ExerciseSetLog[]> => {
    const m = new Map<string, ExerciseSetLog[]>();
    for (const l of logs) {
      const arr = m.get(l.exercise_name) ?? [];
      arr.push(l);
      m.set(l.exercise_name, arr);
    }
    return m;
  };

  return (
    <div className="adlr-fade-in">
      <button onClick={onBack} className="flex items-center gap-2 text-white/50 text-sm mb-4 adlr-tap">
        <ArrowLeft size={16} /> Zurück
      </button>

      {/* Profile header */}
      <div className="flex items-center gap-4 mb-6">
        <div className="w-16 h-16 rounded-full bg-adlr-gold/20 border border-adlr-gold/30 flex items-center justify-center text-adlr-gold text-xl font-bold overflow-hidden">
          {client.avatar_url ? <img src={client.avatar_url} alt="" className="w-full h-full object-cover" /> : (client.first_name?.[0] ?? '?').toUpperCase()}
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">{client.first_name} {client.last_name}</h1>
          <p className="text-sm text-white/40">{client.age} Jahre · {client.height_cm}cm · {client.weight_kg}kg</p>
          <p className="text-xs text-adlr-gold/70">Streak: {client.streak} · Anwesenheit: {attendance}%</p>
        </div>
      </div>

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
            <p className="text-sm font-semibold text-white">Monatsbericht</p>
            <p className="text-xs text-white/50">Der Monat von {client.first_name} in Zahlen</p>
          </div>
          <ChevronRight size={18} className="text-adlr-gold shrink-0" />
        </button>
      )}
      {showReport && <MonthlyReport clientId={clientId} clientName={client.first_name ?? undefined} onClose={() => setShowReport(false)} />}

      {/* Intake summary */}
      <Card className="mb-4">
        <p className="text-sm font-medium text-white/80 mb-3">Intake Antworten</p>
        <div className="space-y-1.5 text-sm">
          <Row label="Ziele" value={(intake.goals ?? []).join(', ')} />
          <Row label="Erfahrung" value={intake.experience} />
          <Row label="Trainingstage" value={(intake.trainingDays ?? []).length + ' Tage'} />
          <Row label="Equipment" value={intake.equipment} />
          <Row label="Verletzungen" value={(intake.injuries ?? []).join(', ')} />
          <Row label="Ernährung" value={intake.dietRestrictions ? (intake.dietRestrictions).join(', ') : '—'} />
          <Row label="Commitment" value={intake.commitmentLevel ? `${intake.commitmentLevel}/5` : '—'} />
          <Row label="Warum jetzt" value={intake.whyNow} />
        </div>
      </Card>

      {/* Weight chart */}
      {chartData.length > 0 && (
        <Card className="mb-4">
          <p className="text-sm font-medium text-white/80 mb-3">Gewichtsverlauf</p>
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

      {/* Workout history */}
      <Card className="mb-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-medium text-white/80">Trainings-Historie</p>
          <span className="text-xs text-white/40">{completions.length} Einheiten</span>
        </div>
        {completions.length === 0 ? (
          <p className="text-sm text-white/30">Noch keine abgeschlossenen Trainings.</p>
        ) : (
          <div className="space-y-2">
            {completions.slice(0, 30).map((c) => {
              const logs = logsByCompletion.get(c.id) ?? [];
              const byEx = groupByExercise(logs);
              const open = expandedSession === c.id;
              const d = new Date(c.completed_at);
              const name = (c.plan_day_id && dayNameById.get(c.plan_day_id)) || 'Training';
              return (
                <div key={c.id} className="rounded-xl border overflow-hidden" style={{ borderColor: 'rgb(var(--text) / 0.08)', background: 'rgb(var(--text) / 0.03)' }}>
                  <button onClick={() => setExpandedSession(open ? null : c.id)} className="adlr-tap w-full flex items-center justify-between px-3 py-2.5 text-left">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white">
                        {d.toLocaleDateString('de-AT', { weekday: 'short', day: '2-digit', month: '2-digit' })} · {name}
                      </p>
                      <p className="text-xs text-white/40 mt-0.5 flex items-center gap-3">
                        <span className="flex items-center gap-1"><Dumbbell size={11} /> {byEx.size} Übungen</span>
                        {c.duration_sec ? <span className="flex items-center gap-1"><Clock size={11} /> {Math.round(c.duration_sec / 60)} Min</span> : null}
                      </p>
                    </div>
                    <ChevronDown size={16} className="shrink-0 transition-transform" style={{ color: 'rgb(var(--text) / 0.3)', transform: open ? 'rotate(180deg)' : 'none' }} />
                  </button>
                  {open && (
                    <div className="px-3 pb-3 pt-1 space-y-2.5" style={{ borderTop: '1px solid rgb(var(--text) / 0.06)' }}>
                      {byEx.size === 0 ? (
                        <p className="text-xs text-white/30 pt-2">Keine Übungsdaten erfasst.</p>
                      ) : (
                        [...byEx.entries()].map(([exName, ls]) => (
                          <div key={exName} className="pt-1.5">
                            <p className="text-sm text-white/85">{exName}</p>
                            <div className="flex flex-wrap gap-1.5 mt-1">
                              {ls.sort((a, b) => a.set_number - b.set_number).map((l) => (
                                <span key={l.id} className="text-xs bg-inset rounded-md px-2 py-1" style={{ color: 'rgb(var(--text) / 0.6)' }}>
                                  {l.set_number}. {l.weight_kg ?? '—'} kg × {l.reps ?? '—'}
                                </span>
                              ))}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* PRs */}
      {prs.length > 0 && (
        <Card className="mb-4">
          <p className="text-sm font-medium text-white/80 mb-3">Personal Records</p>
          <div className="space-y-1.5 text-sm">
            {prs.map((pr) => (
              <Row key={pr.id} label={pr.exercise_name} value={`${pr.weight_kg} kg × ${pr.reps}`} />
            ))}
          </div>
        </Card>
      )}

      {/* Photos */}
      {photos.length > 0 && (
        <Card className="mb-4">
          <p className="text-sm font-medium text-white/80 mb-3">Fortschrittsfotos</p>
          <div className="grid grid-cols-3 gap-2">
            {photos.map((ph) => (
              <div key={ph.id} className="aspect-square rounded-lg overflow-hidden bg-inset"><SignedPhoto path={ph.storage_path} /></div>
            ))}
          </div>
        </Card>
      )}

      {/* Plan assignment */}
      <Card className="mb-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-medium text-white/80">Trainingsplan</p>
          <button onClick={() => setEditingPlan(!editingPlan)} className="text-adlr-gold text-sm flex items-center gap-1 adlr-tap"><Edit3 size={14} /> Ändern</button>
        </div>
        {activePlan ? (
          <p className="text-sm text-white/60">Aktiv: {plans.find((p) => p.id === activePlan.plan_id)?.name ?? '—'}</p>
        ) : <p className="text-sm text-white/40">Kein Plan zugewiesen.</p>}
        {editingPlan && (
          <div className="mt-3 space-y-2 adlr-fade-in">
            {plans.map((p) => (
              <button key={p.id} onClick={() => assignPlan(p.id)} className="adlr-tap w-full text-left px-4 py-3 rounded-xl bg-white/5 border border-white/10 hover:border-adlr-gold/40 text-sm text-white/80">
                {p.name} {p.is_template && <span className="text-xs text-adlr-gold/60">(Vorlage)</span>}
              </button>
            ))}
            {plans.length === 0 && <p className="text-xs text-white/30">Erstelle zuerst einen Plan im Plan Builder.</p>}
          </div>
        )}
      </Card>

      {/* Session note */}
      <Card className="mb-4">
        <p className="text-sm font-medium text-white/80 mb-3">Private Notiz hinzufügen</p>
        <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Notiz zur letzten Session..." />
        <Button onClick={saveNote} variant="ghost" className="w-full mt-3" disabled={!note.trim()}>Notiz speichern</Button>
      </Card>

      {/* Remove client from roster (unlink — account & data stay) */}
      <button
        onClick={removeClient}
        className="adlr-tap w-full py-3 rounded-xl text-sm font-medium mb-2 flex items-center justify-center gap-2"
        style={{ background: 'rgba(248,113,113,0.10)', color: '#f87171', border: '1px solid rgba(248,113,113,0.3)' }}
      >
        <UserMinus size={15} /> {confirmRemove ? 'Wirklich entfernen? Nochmal tippen' : 'Klient entfernen'}
      </button>
      <p className="text-xs text-white/30 text-center mb-4">Entfernt den Klienten aus deiner Liste — Konto und Daten bleiben erhalten.</p>
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
