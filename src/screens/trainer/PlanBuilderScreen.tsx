import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import type { Plan, PlanDay, Exercise, Profile } from '@/lib/types';
import { Loading } from '@/components/ui';
import { Plus, Trash2, Copy, X, Search, Dumbbell, Play, ChevronDown, ChevronUp, Check, ArrowUp, ArrowDown, Pencil } from 'lucide-react';
import { ExerciseLibrary, ExerciseDemoModal } from '@/components/ExerciseLibrary';
import { fetchExercises, type ExerciseRow } from '@/lib/exercises';
import { useAsyncData } from '@/lib/useAsyncData';

const DAY_NAMES = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];

type Mode = 'list' | 'edit';

export default function PlanBuilderScreen() {
  const { profile } = useAuth();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [clients, setClients] = useState<Profile[]>([]);
  const [activePlan, setActivePlan] = useState<Plan | null>(null);
  const [days, setDays] = useState<PlanDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<Mode>('list');
  const [newPlanName, setNewPlanName] = useState('');
  const [selectedClientId, setSelectedClientId] = useState('');
  const [assignSuccess, setAssignSuccess] = useState(false);
  const [assignError, setAssignError] = useState(false);
  const [expandedDay, setExpandedDay] = useState<number | null>(0);
  const [showAddEx, setShowAddEx] = useState(false);
  const [exForm, setExForm] = useState<Exercise>({ name: '', sets: 3, reps: 12, rest_sec: 60, tempo: '' });
  const [demoEx, setDemoEx] = useState<ExerciseRow | null>(null);
  const [altPicker, setAltPicker] = useState<{ dayIdx: number; exIdx: number; slot: number } | null>(null);
  const [savingDay, setSavingDay] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [renamingPlanId, setRenamingPlanId] = useState<string | null>(null);
  const [templateMsg, setTemplateMsg] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const { data: lib } = useAsyncData(fetchExercises, []);
  const libByName = useMemo(() => (lib ? new Map(lib.map((e) => [e.name, e])) : null), [lib]);

  useEffect(() => { load(); }, [profile?.id]);

  const load = async () => {
    if (!profile) return;
    setLoading(true);
    const [{ data: pl }, { data: cl }] = await Promise.all([
      supabase.from('plans').select('*').eq('trainer_id', profile.id).order('created_at', { ascending: false }),
      supabase.from('profiles').select('*').eq('role', 'client').eq('trainer_id', profile.id).order('first_name'),
    ]);
    const planList = (pl ?? []) as Plan[];
    setPlans(planList);
    setClients((cl ?? []) as Profile[]);
    setLoading(false);
  };

  const selectPlan = async (plan: Plan) => {
    setActivePlan(plan);
    setMode('edit');
    setExpandedDay(0);
    const { data: pd } = await supabase.from('plan_days').select('*').eq('plan_id', plan.id).order('day_of_week');
    setDays((pd ?? []) as PlanDay[]);
  };

  const createPlan = async (nameOverride?: string) => {
    const name = (nameOverride ?? newPlanName).trim();
    if (!profile || !name) return;
    setCreating(true);
    setCreateError(null);
    const { data, error } = await supabase.from('plans').insert({ trainer_id: profile.id, name }).select().single();
    if (error || !data) {
      setCreateError(error?.message ?? 'Plan konnte nicht erstellt werden');
      setCreating(false);
      return;
    }
    const dayInserts = Array.from({ length: 7 }, (_, i) => ({ plan_id: data.id, day_of_week: i, is_rest_day: i >= 5 }));
    const { data: pd, error: dErr } = await supabase.from('plan_days').insert(dayInserts).select();
    if (dErr) {
      setCreateError(dErr.message);
      setCreating(false);
      return;
    }
    setNewPlanName('');
    setPlans((prev) => [data as Plan, ...prev]);
    setActivePlan(data as Plan);
    setDays((pd ?? []) as PlanDay[]);
    setMode('edit');
    setExpandedDay(0);
    setCreating(false);
  };

  const saveAsTemplate = async (nameOverride?: string) => {
    const name = (nameOverride ?? newPlanName).trim();
    if (!profile || !name) return;
    setCreating(true);
    setCreateError(null);
    const { data, error } = await supabase.from('plans').insert({ trainer_id: profile.id, name, is_template: true }).select().single();
    if (error || !data) {
      setCreateError(error?.message ?? 'Vorlage konnte nicht erstellt werden');
      setCreating(false);
      return;
    }
    const dayInserts = Array.from({ length: 7 }, (_, i) => ({ plan_id: data.id, day_of_week: i, is_rest_day: i >= 5 }));
    const { data: pd, error: dErr } = await supabase.from('plan_days').insert(dayInserts).select();
    if (dErr) {
      setCreateError(dErr.message);
      setCreating(false);
      return;
    }
    setNewPlanName('');
    setPlans((prev) => [data as Plan, ...prev]);
    setActivePlan(data as Plan);
    setDays((pd ?? []) as PlanDay[]);
    setMode('edit');
    setExpandedDay(0);
    setCreating(false);
  };

  const assignPlan = async () => {
    if (!activePlan || !selectedClientId) return;
    // Deactivate any other active plans for this client so only one is active.
    await supabase.from('client_plans').update({ is_active: false }).eq('client_id', selectedClientId).neq('plan_id', activePlan.id);
    const { error } = await supabase.from('client_plans').upsert(
      { client_id: selectedClientId, plan_id: activePlan.id, is_active: true },
      { onConflict: 'client_id,plan_id' }
    );
    if (error) {
      console.error('assignPlan', error);
      setAssignError(true);
      setTimeout(() => setAssignError(false), 3000);
      return;
    }
    setAssignSuccess(true);
    setTimeout(() => setAssignSuccess(false), 2000);
  };

  const updateDay = async (idx: number, patch: Partial<PlanDay>) => {
    const day = days[idx];
    if (!day) return;
    setSavingDay(idx);
    const { data, error } = await supabase.from('plan_days').update(patch).eq('id', day.id).select('*').single();
    if (error || !data) {
      console.error('updateDay', error);
      setSavingDay(null);
      return;
    }
    setDays((d) => d.map((x, i) => (i === idx ? (data as PlanDay) : x)));
    setSavingDay(null);
  };

  const addExercise = async (dayIdx: number) => {
    const day = days[dayIdx];
    if (!day || !exForm.name.trim()) return;
    const newExercises = [...(day.exercises ?? []), { ...exForm }];
    await updateDay(dayIdx, { exercises: newExercises });
    setExForm({ name: '', sets: 3, reps: 12, rest_sec: 60, tempo: '' });
    setShowAddEx(false);
  };

  const addLibExercise = async (dayIdx: number, ex: ExerciseRow) => {
    const day = days[dayIdx];
    if (!day) return;
    const newEx: Exercise = { name: ex.name, sets: ex.default_sets, reps: ex.default_reps, rest_sec: ex.default_rest_sec, tempo: ex.tempo };
    await updateDay(dayIdx, { exercises: [...(day.exercises ?? []), newEx] });
  };

  const updateExercise = async (dayIdx: number, exIdx: number, patch: Partial<Exercise>) => {
    const day = days[dayIdx];
    if (!day) return;
    const exs = [...(day.exercises ?? [])];
    exs[exIdx] = { ...exs[exIdx], ...patch };
    await updateDay(dayIdx, { exercises: exs });
  };

  // Per-set weight/reps helpers (pyramid sets etc.)
  const setDetailsOf = (ex: Exercise): { weight_kg?: number; reps?: number }[] => {
    const n = Math.max(1, ex.sets ?? 1);
    const base = ex.set_details ?? [];
    return Array.from({ length: n }, (_, i) => base[i] ?? { weight_kg: ex.weight_kg, reps: ex.reps });
  };

  const updateSetsCount = async (dayIdx: number, exIdx: number, raw: number) => {
    const ex = days[dayIdx]?.exercises?.[exIdx];
    if (!ex) return;
    const n = Math.max(1, Math.min(20, Math.floor(raw) || 1));
    const cur = setDetailsOf(ex);
    const next = Array.from({ length: n }, (_, i) => cur[i] ?? cur[cur.length - 1] ?? { weight_kg: ex.weight_kg, reps: ex.reps });
    await updateExercise(dayIdx, exIdx, { sets: n, set_details: next });
  };

  const updateSetDetail = async (dayIdx: number, exIdx: number, setIdx: number, patch: { weight_kg?: number; reps?: number }) => {
    const ex = days[dayIdx]?.exercises?.[exIdx];
    if (!ex) return;
    const cur = setDetailsOf(ex).map((s, i) => (i === setIdx ? { ...s, ...patch } : s));
    await updateExercise(dayIdx, exIdx, { set_details: cur });
  };

  const removeExercise = async (dayIdx: number, exIdx: number) => {
    const day = days[dayIdx];
    if (!day) return;
    await updateDay(dayIdx, { exercises: day.exercises.filter((_, i) => i !== exIdx) });
  };

  const moveExercise = async (dayIdx: number, exIdx: number, dir: -1 | 1) => {
    const day = days[dayIdx];
    if (!day) return;
    const exs = [...(day.exercises ?? [])];
    const target = exIdx + dir;
    if (target < 0 || target >= exs.length) return;
    [exs[exIdx], exs[target]] = [exs[target], exs[exIdx]];
    await updateDay(dayIdx, { exercises: exs });
  };

  const renamePlan = async (plan: Plan, name: string) => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === plan.name) { setRenaming(false); return; }
    const { data, error } = await supabase.from('plans').update({ name: trimmed }).eq('id', plan.id).select('*').single();
    if (error || !data) { console.error('renamePlan', error); setRenaming(false); return; }
    setPlans((prev) => prev.map((p) => (p.id === plan.id ? (data as Plan) : p)));
    if (activePlan?.id === plan.id) setActivePlan(data as Plan);
    setRenaming(false);
  };

  // Two-tap inline delete confirmation (robust everywhere; no blocking confirm() dialog).
  const requestDelete = (plan: Plan) => {
    if (pendingDelete === plan.id) {
      setPendingDelete(null);
      deletePlan(plan);
    } else {
      setPendingDelete(plan.id);
      setTimeout(() => setPendingDelete((cur) => (cur === plan.id ? null : cur)), 3000);
    }
  };

  const deletePlan = async (plan: Plan) => {
    await supabase.from('client_plans').delete().eq('plan_id', plan.id);
    await supabase.from('plan_days').delete().eq('plan_id', plan.id);
    const { error } = await supabase.from('plans').delete().eq('id', plan.id);
    if (error) { console.error('deletePlan', error); return; }
    if (activePlan?.id === plan.id) { setActivePlan(null); setMode('list'); }
    await load();
  };

  // Deep-copy a plan's days into a freshly created plan (shared by duplicate / template flows).
  const clonePlanDays = async (fromPlanId: string, toPlanId: string) => {
    const { data: pds } = await supabase.from('plan_days').select('*').eq('plan_id', fromPlanId);
    for (const d of (pds ?? [])) {
      await supabase.from('plan_days').insert({
        plan_id: toPlanId, day_of_week: d.day_of_week, workout_name: d.workout_name,
        focus: d.focus, difficulty: d.difficulty, duration_min: d.duration_min,
        notes: d.notes, exercises: d.exercises, is_rest_day: d.is_rest_day,
      });
    }
  };

  const copyPlan = async (plan: Plan) => {
    if (!profile) return;
    const { data } = await supabase.from('plans').insert({ trainer_id: profile.id, name: `${plan.name} (Kopie)` }).select().single();
    if (!data) return;
    await clonePlanDays(plan.id, data.id);
    await load();
  };

  // Save the currently open plan (with all its days/exercises) as a reusable template.
  const saveCurrentAsTemplate = async () => {
    if (!profile || !activePlan) return;
    const baseName = activePlan.name.replace(/\s*\(Vorlage\)\s*$/, '');
    const { data } = await supabase.from('plans').insert({ trainer_id: profile.id, name: `${baseName} (Vorlage)`, is_template: true }).select().single();
    if (!data) { setTemplateMsg('Fehler beim Speichern'); setTimeout(() => setTemplateMsg(null), 2500); return; }
    await clonePlanDays(activePlan.id, data.id);
    await load();
    setTemplateMsg('Als Vorlage gespeichert');
    setTimeout(() => setTemplateMsg(null), 2500);
  };

  // Create a new assignable plan from a template (copies its days), then open it.
  const createFromTemplate = async (tpl: Plan) => {
    if (!profile) return;
    const baseName = tpl.name.replace(/\s*\(Vorlage\)\s*$/, '');
    const { data } = await supabase.from('plans').insert({ trainer_id: profile.id, name: baseName, is_template: false }).select().single();
    if (!data) return;
    await clonePlanDays(tpl.id, data.id);
    await load();
    await selectPlan(data as Plan);
  };

  if (loading) return <Loading />;

  // ── LIST VIEW ──────────────────────────────────────────────────────────────
  if (mode === 'list') {
    return (
      <div className="adlr-fade-in pb-6">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">Plan Builder</h1>
            <p className="text-sm text-white/40 mt-0.5">Baue Wochenpläne für deine Klienten</p>
          </div>
          <button
            onClick={async () => { setNewPlanName('Neuer Plan'); await createPlan('Neuer Plan'); }}
            disabled={creating}
            className="adlr-tap flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border disabled:opacity-50"
            style={{ background: 'rgb(var(--adlr-gold) / 0.08)', borderColor: 'rgb(var(--adlr-gold) / 0.3)', color: 'rgb(var(--adlr-gold))' }}
          >
            {creating ? <span className="animate-pulse">…</span> : <Plus size={15} />} Neuer Plan
          </button>
        </div>

        <div className="rounded-2xl p-4 mb-5" style={{ background: 'rgb(var(--text) / 0.04)', border: '1px solid rgb(var(--text) / 0.08)' }}>
          <input
            value={newPlanName}
            onChange={(e) => setNewPlanName(e.target.value)}
            placeholder="Plan Name (z.B. Push/Pull/Legs Woche 1)"
            className="w-full bg-transparent text-white text-base placeholder-white/25 outline-none mb-3"
          />
          <div className="h-px mb-3" style={{ background: 'rgb(var(--text) / 0.07)' }} />
          <select
            value={selectedClientId}
            onChange={(e) => setSelectedClientId(e.target.value)}
            className="w-full bg-transparent text-sm outline-none mb-3"
            style={{ color: selectedClientId ? 'rgb(var(--text))' : 'rgb(var(--text) / 0.35)' }}
          >
            <option value="">Klient wählen...</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id} className="bg-zinc-900">{c.first_name} {c.last_name}</option>
            ))}
          </select>
          <div className="h-px mb-3" style={{ background: 'rgb(var(--text) / 0.07)' }} />
          <div className="flex items-center gap-3">
            <button
              onClick={createPlan}
              disabled={!newPlanName.trim()}
              className="adlr-tap flex-1 py-3 rounded-xl text-sm font-semibold transition-all disabled:opacity-40"
              style={{ background: 'linear-gradient(135deg, rgb(var(--adlr-gold)), rgb(var(--adlr-gold-dim)))', color: '#000' }}
            >
              Plan zuweisen
            </button>
            <button
              onClick={saveAsTemplate}
              disabled={!newPlanName.trim()}
              className="adlr-tap flex items-center gap-1.5 text-sm whitespace-nowrap disabled:opacity-40"
              style={{ color: 'rgb(var(--text) / 0.5)' }}
            >
              <Copy size={13} /> Als Vorlage
            </button>
          </div>
        </div>

        {plans.some((p) => p.is_template) && (
          <div className="space-y-2 mb-5">
            <p className="text-xs uppercase tracking-wider text-white/30 mb-3">Vorlagen</p>
            {plans.filter((p) => p.is_template).map((p) => (
              <div
                key={p.id}
                className="w-full flex items-center justify-between rounded-xl px-4 py-3.5"
                style={{ background: 'rgb(var(--adlr-gold) / 0.06)', border: '1px solid rgb(var(--adlr-gold) / 0.2)' }}
              >
                {renamingPlanId === p.id ? (
                  <>
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={() => { renamePlan(p, renameValue); setRenamingPlanId(null); }}
                      onKeyDown={(e) => { if (e.key === 'Enter') { renamePlan(p, renameValue); setRenamingPlanId(null); } if (e.key === 'Escape') setRenamingPlanId(null); }}
                      className="flex-1 bg-inset border border-white/15 rounded-lg px-2 py-1 text-sm font-medium text-white outline-none"
                    />
                    <button onClick={() => { renamePlan(p, renameValue); setRenamingPlanId(null); }} className="adlr-tap p-1.5 rounded-lg ml-2" style={{ color: 'rgb(var(--adlr-gold))' }}>
                      <Check size={14} />
                    </button>
                  </>
                ) : (
                  <>
                    <button onClick={() => selectPlan(p)} className="flex-1 min-w-0 text-left">
                      <p className="text-sm font-medium text-white">{p.name.replace(/\s*\(Vorlage\)\s*$/, '')}</p>
                      <p className="text-xs mt-0.5" style={{ color: 'rgb(var(--adlr-gold) / 0.7)' }}>Vorlage</p>
                    </button>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={(e) => { e.stopPropagation(); createFromTemplate(p); }}
                        className="adlr-tap flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium"
                        style={{ background: 'rgb(var(--adlr-gold) / 0.15)', color: 'rgb(var(--adlr-gold))' }}
                        title="Plan aus Vorlage erstellen"
                      >
                        <Plus size={13} /> Plan
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setRenameValue(p.name.replace(/\s*\(Vorlage\)\s*$/, '')); setRenamingPlanId(p.id); }}
                        className="adlr-tap p-1.5 rounded-lg"
                        style={{ color: 'rgb(var(--text) / 0.3)' }}
                        title="Umbenennen"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); requestDelete(p); }}
                        className="adlr-tap p-1.5 rounded-lg"
                        style={{ color: pendingDelete === p.id ? '#f87171' : 'rgba(248,113,113,0.4)' }}
                        title={pendingDelete === p.id ? 'Nochmal tippen zum Löschen' : 'Löschen'}
                      >
                        {pendingDelete === p.id ? <Check size={14} /> : <Trash2 size={14} />}
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        {plans.some((p) => !p.is_template) && (
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wider text-white/30 mb-3">Bestehende Pläne</p>
            {plans.filter((p) => !p.is_template).map((p) => (
              <div
                key={p.id}
                className="w-full flex items-center justify-between rounded-xl px-4 py-3.5 text-left transition-all"
                style={{ background: 'rgb(var(--text) / 0.04)', border: '1px solid rgb(var(--text) / 0.07)' }}
              >
                {renamingPlanId === p.id ? (
                  <>
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={() => { renamePlan(p, renameValue); setRenamingPlanId(null); }}
                      onKeyDown={(e) => { if (e.key === 'Enter') { renamePlan(p, renameValue); setRenamingPlanId(null); } if (e.key === 'Escape') setRenamingPlanId(null); }}
                      className="flex-1 bg-inset border border-white/15 rounded-lg px-2 py-1 text-sm font-medium text-white outline-none"
                    />
                    <button
                      onClick={() => { renamePlan(p, renameValue); setRenamingPlanId(null); }}
                      className="adlr-tap p-1.5 rounded-lg ml-2"
                      style={{ color: 'rgb(var(--adlr-gold))' }}
                    >
                      <Check size={14} />
                    </button>
                  </>
                ) : (
                  <>
                    <button onClick={() => selectPlan(p)} className="flex-1 min-w-0 text-left">
                      <p className="text-sm font-medium text-white">{p.name}</p>
                      <p className="text-xs text-white/30 mt-0.5">{p.is_template ? 'Vorlage' : '7-Tage Plan'}</p>
                    </button>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => { e.stopPropagation(); copyPlan(p); }}
                        className="adlr-tap p-1.5 rounded-lg"
                        style={{ color: 'rgb(var(--text) / 0.3)' }}
                        title="Duplizieren"
                      >
                        <Copy size={14} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setRenameValue(p.name); setRenamingPlanId(p.id); }}
                        className="adlr-tap p-1.5 rounded-lg"
                        style={{ color: 'rgb(var(--text) / 0.3)' }}
                        title="Umbenennen"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); requestDelete(p); }}
                        className="adlr-tap p-1.5 rounded-lg"
                        style={{ color: pendingDelete === p.id ? '#f87171' : 'rgba(248,113,113,0.4)' }}
                        title={pendingDelete === p.id ? 'Nochmal tippen zum Löschen' : 'Löschen'}
                      >
                        {pendingDelete === p.id ? <Check size={14} /> : <Trash2 size={14} />}
                      </button>
                      <ChevronDown size={14} style={{ color: 'rgb(var(--text) / 0.3)' }} />
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        {createError && (
          <div className="rounded-xl px-4 py-3 mb-4" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}>
            <p className="text-sm text-red-400">{createError}</p>
          </div>
        )}

        {plans.length === 0 && !createError && (
          <div className="text-center py-16">
            <Dumbbell size={32} className="mx-auto mb-3 text-white/15" />
            <p className="text-sm text-white/30">Noch keine Pläne. Erstelle deinen ersten.</p>
          </div>
        )}
      </div>
    );
  }

  // ── EDIT VIEW ──────────────────────────────────────────────────────────────
  const activeDay = expandedDay !== null ? days[expandedDay] : null;
  const canAdd = expandedDay !== null && days[expandedDay] && !days[expandedDay].is_rest_day;
  void canAdd;

  return (
    <div className="adlr-fade-in pb-6">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={() => { setMode('list'); setActivePlan(null); }} className="adlr-tap p-1.5 rounded-lg" style={{ color: 'rgb(var(--text) / 0.4)' }}>
          <ChevronDown size={18} className="rotate-90" />
        </button>
        <div className="flex-1 min-w-0">
          {renaming && activePlan ? (
            <input
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={() => renamePlan(activePlan, renameValue)}
              onKeyDown={(e) => { if (e.key === 'Enter') renamePlan(activePlan, renameValue); if (e.key === 'Escape') setRenaming(false); }}
              className="w-full bg-inset border border-white/15 rounded-lg px-2 py-1 text-lg font-bold text-white outline-none"
            />
          ) : (
            <h1 className="text-lg font-bold text-white truncate">{activePlan?.name ?? 'Neuer Plan'}</h1>
          )}
          <p className="text-xs flex items-center gap-1">
            {savingDay !== null ? (
              <span className="text-adlr-gold/80">Speichern…</span>
            ) : (
              <span className="text-green-500/70 flex items-center gap-1"><Check size={11} /> Automatisch gespeichert</span>
            )}
          </p>
        </div>
        {activePlan && (
          <>
            <button onClick={() => { setRenameValue(activePlan.name); setRenaming(true); }} className="adlr-tap p-1.5 rounded-lg" style={{ color: 'rgb(var(--text) / 0.35)' }} title="Umbenennen">
              <Pencil size={16} />
            </button>
            <button onClick={() => copyPlan(activePlan)} className="adlr-tap p-1.5 rounded-lg" style={{ color: 'rgb(var(--text) / 0.35)' }} title="Duplizieren">
              <Copy size={16} />
            </button>
            <button onClick={() => deletePlan(activePlan)} className="adlr-tap p-1.5 rounded-lg" style={{ color: 'rgba(248,113,113,0.4)' }} title="Plan löschen">
              <Trash2 size={16} />
            </button>
          </>
        )}
      </div>

      {activePlan && (
        <div className="rounded-xl px-4 py-3 mb-5 flex items-center gap-3" style={{ background: 'rgb(var(--text) / 0.04)', border: '1px solid rgb(var(--text) / 0.07)' }}>
          <select
            value={selectedClientId}
            onChange={(e) => setSelectedClientId(e.target.value)}
            className="flex-1 bg-transparent text-sm outline-none"
            style={{ color: selectedClientId ? 'rgb(var(--text))' : 'rgb(var(--text) / 0.35)' }}
          >
            <option value="">Klient wählen...</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id} className="bg-zinc-900">{c.first_name} {c.last_name}</option>
            ))}
          </select>
          <button
            onClick={assignPlan}
            disabled={!selectedClientId}
            className="adlr-tap px-4 py-2 rounded-lg text-xs font-semibold disabled:opacity-40 transition-all flex items-center gap-1.5"
            style={assignError
              ? { background: 'rgba(239,68,68,0.2)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }
              : assignSuccess
              ? { background: 'rgba(34,197,94,0.2)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)' }
              : { background: 'rgb(var(--adlr-gold) / 0.15)', color: 'rgb(var(--adlr-gold))', border: '1px solid rgb(var(--adlr-gold) / 0.25)' }}
          >
            {assignError ? 'Fehler' : assignSuccess ? <><Check size={12} /> Zugewiesen</> : 'Zuweisen'}
          </button>
        </div>
      )}

      {days.length > 0 && (
        <div className="mb-2">
          <p className="text-xs uppercase tracking-wider text-white/30 mb-2">Trainingstage · tippe einen Tag an, um Übungen hinzuzufügen</p>
        </div>
      )}
      {days.length > 0 && (
        <div className="space-y-2 mb-6">
          {days.map((day, idx) => {
            const isOpen = expandedDay === idx;
            const exCount = (day.exercises ?? []).length;
            return (
              <div
                key={day.id}
                className="rounded-2xl overflow-hidden transition-all"
                style={{ background: 'rgb(var(--text) / 0.04)', border: isOpen ? '1px solid rgb(var(--adlr-gold) / 0.25)' : '1px solid rgb(var(--text) / 0.07)' }}
              >
                <button
                  onClick={() => setExpandedDay(isOpen ? null : idx)}
                  className="w-full flex items-center justify-between px-4 py-3.5"
                >
                  <div className="text-left">
                    <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: isOpen ? 'rgb(var(--adlr-gold))' : 'rgb(var(--text) / 0.4)' }}>
                      {DAY_NAMES[day.day_of_week]}
                    </p>
                    <p className="text-sm font-semibold text-white mt-0.5">
                      {day.is_rest_day ? 'Ruhetag' : (day.workout_name || 'Training')}
                    </p>
                    {!day.is_rest_day && (
                      <p className="text-xs text-white/30 mt-0.5">
                        {exCount > 0 ? `${exCount} ${exCount === 1 ? 'Übung' : 'Übungen'}` : 'Tippen zum Hinzufügen'}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); updateDay(idx, { is_rest_day: !day.is_rest_day }); }}
                      className="adlr-tap px-2.5 py-1 rounded-md text-xs border"
                      style={day.is_rest_day
                        ? { background: 'rgb(var(--text) / 0.05)', color: 'rgb(var(--text) / 0.4)', borderColor: 'rgb(var(--text) / 0.1)' }
                        : { background: 'rgb(var(--adlr-gold) / 0.1)', color: 'rgb(var(--adlr-gold))', borderColor: 'rgb(var(--adlr-gold) / 0.25)' }}
                    >
                      {day.is_rest_day ? 'Ruhe' : 'Aktiv'}
                    </button>
                    {isOpen ? <ChevronUp size={14} className="text-white/30" /> : <ChevronDown size={14} className="text-white/30" />}
                  </div>
                </button>

                {isOpen && !day.is_rest_day && (
                  <div className="px-4 pb-4 space-y-3 adlr-fade-in">
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        value={day.workout_name ?? ''}
                        onChange={(e) => updateDay(idx, { workout_name: e.target.value })}
                        placeholder="Workout Name"
                        className="bg-inset border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-white/25 outline-none"
                      />
                      <input
                        value={day.focus ?? ''}
                        onChange={(e) => updateDay(idx, { focus: e.target.value })}
                        placeholder="Fokus (z.B. Rücken)"
                        className="bg-inset border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-white/25 outline-none"
                      />
                    </div>

                    {(day.exercises ?? []).length > 0 && (
                      <div className="space-y-1.5">
                        {day.exercises.map((ex, exIdx) => (
                          <div
                            key={exIdx}
                            className="flex items-start gap-3 rounded-xl px-3 py-2.5"
                            style={{ background: 'rgb(var(--adlr-gold) / 0.06)', border: '1px solid rgb(var(--adlr-gold) / 0.12)' }}
                          >
                            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5" style={{ background: 'rgb(var(--adlr-gold) / 0.15)' }}>
                              <Dumbbell size={14} style={{ color: 'rgb(var(--adlr-gold))' }} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-white mb-2">{ex.name}</p>
                              <div className="space-y-2">
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <p className="text-[10px] text-white/40 uppercase tracking-wide mb-1 text-center">Sätze</p>
                                    <input
                                      type="number"
                                      value={ex.sets ?? ''}
                                      onChange={(e) => updateSetsCount(idx, exIdx, Number(e.target.value))}
                                      className="w-full bg-inset border border-white/10 rounded-md px-1 py-2 text-sm text-white outline-none text-center"
                                    />
                                  </div>
                                  <div>
                                    <p className="text-[10px] text-white/40 uppercase tracking-wide mb-1 text-center">Pause (s)</p>
                                    <input
                                      type="number"
                                      value={ex.rest_sec ?? ''}
                                      onChange={(e) => updateExercise(idx, exIdx, { rest_sec: Number(e.target.value) })}
                                      className="w-full bg-inset border border-white/10 rounded-md px-1 py-2 text-sm text-white outline-none text-center"
                                    />
                                  </div>
                                </div>
                                {/* Per-set weight × reps (pyramid etc.) */}
                                <div className="space-y-1.5 pt-0.5">
                                  <div className="flex items-center gap-2 px-0.5">
                                    <span className="w-11 shrink-0" />
                                    <span className="w-16 text-[9px] text-adlr-gold/60 uppercase tracking-wide text-center">Gewicht</span>
                                    <span className="w-4" />
                                    <span className="w-16 text-[9px] text-white/40 uppercase tracking-wide text-center">Wdh</span>
                                  </div>
                                  {setDetailsOf(ex).map((sd, si) => (
                                    <div key={si} className="flex items-center gap-2">
                                      <span className="text-[10px] text-white/40 w-11 shrink-0">Satz {si + 1}</span>
                                      <input
                                        type="number"
                                        value={sd.weight_kg ?? ''}
                                        onChange={(e) => updateSetDetail(idx, exIdx, si, { weight_kg: e.target.value === '' ? undefined : Number(e.target.value) })}
                                        placeholder="kg"
                                        className="w-16 bg-adlr-gold/5 border border-adlr-gold/25 rounded-md px-1 py-1.5 text-sm text-white placeholder-white/25 outline-none text-center"
                                      />
                                      <span className="w-4 text-center text-white/25 text-xs">×</span>
                                      <input
                                        type="number"
                                        value={sd.reps ?? ''}
                                        onChange={(e) => updateSetDetail(idx, exIdx, si, { reps: e.target.value === '' ? undefined : Number(e.target.value) })}
                                        placeholder="Wdh"
                                        className="w-16 bg-inset border border-white/10 rounded-md px-1 py-1.5 text-sm text-white placeholder-white/25 outline-none text-center"
                                      />
                                    </div>
                                  ))}
                                </div>
                              </div>
                              {/* Alternatives — searchable picker, for when a machine is occupied */}
                              <div className="mt-2.5">
                                <p className="text-[10px] text-white/40 uppercase tracking-wide mb-1">Alternativen · bei besetztem Gerät</p>
                                <div className="space-y-1.5">
                                  {[0, 1].map((ai) => {
                                    const val = ex.alternatives?.[ai] ?? '';
                                    return (
                                      <div key={ai} className="flex items-center gap-2">
                                        <button
                                          onClick={() => setAltPicker({ dayIdx: idx, exIdx, slot: ai })}
                                          className="adlr-tap flex-1 min-w-0 text-left px-3 py-2 rounded-md text-sm border flex items-center gap-2"
                                          style={val
                                            ? { background: 'rgb(var(--adlr-gold) / 0.06)', borderColor: 'rgb(var(--adlr-gold) / 0.2)', color: 'rgb(var(--text))' }
                                            : { background: 'rgb(var(--text) / 0.03)', borderColor: 'rgb(var(--text) / 0.1)', color: 'rgb(var(--text) / 0.4)' }}
                                        >
                                          <Search size={13} className="shrink-0 opacity-60" />
                                          <span className="truncate">{val || `Alternative ${ai + 1} wählen…`}</span>
                                        </button>
                                        {val && (
                                          <button
                                            onClick={() => { const alts = [...(ex.alternatives ?? ['', ''])]; alts[ai] = ''; updateExercise(idx, exIdx, { alternatives: alts }); }}
                                            className="adlr-tap p-1.5 rounded-lg shrink-0"
                                            style={{ color: 'rgba(248,113,113,0.5)' }}
                                          >
                                            <X size={14} />
                                          </button>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                            <div className="flex flex-col items-center gap-1 shrink-0">
                              {libByName?.get(ex.name)?.exercise_id && (
                                <button
                                  onClick={() => setDemoEx(libByName.get(ex.name)!)}
                                  className="adlr-tap p-1.5 rounded-lg"
                                  style={{ color: 'rgb(var(--adlr-gold))' }}
                                  title="Vorschau"
                                >
                                  <Play size={13} />
                                </button>
                              )}
                              <button
                                onClick={() => moveExercise(idx, exIdx, -1)}
                                disabled={exIdx === 0}
                                className="adlr-tap p-1.5 rounded-lg disabled:opacity-20"
                                style={{ color: 'rgb(var(--text) / 0.4)' }}
                              >
                                <ArrowUp size={13} />
                              </button>
                              <button
                                onClick={() => moveExercise(idx, exIdx, 1)}
                                disabled={exIdx === (day.exercises ?? []).length - 1}
                                className="adlr-tap p-1.5 rounded-lg disabled:opacity-20"
                                style={{ color: 'rgb(var(--text) / 0.4)' }}
                              >
                                <ArrowDown size={13} />
                              </button>
                              <button
                                onClick={() => removeExercise(idx, exIdx)}
                                className="adlr-tap p-1.5 rounded-lg"
                                style={{ color: 'rgba(248,113,113,0.5)' }}
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Exercise library inline — search & add from saved exercises */}
                    <ExerciseLibrary
                      onAdd={(ex) => addLibExercise(idx, ex)}
                      onDemo={(ex) => setDemoEx(ex)}
                      canAdd={true}
                    />

                    {showAddEx && expandedDay === idx ? (
                      <div className="rounded-xl p-3 space-y-2 adlr-fade-in" style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgb(var(--text) / 0.1)' }}>
                        <div className="flex justify-between items-center">
                          <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'rgb(var(--adlr-gold))' }}>Eigene Übung</p>
                          <button onClick={() => setShowAddEx(false)}><X size={14} className="text-white/40" /></button>
                        </div>
                        <input
                          value={exForm.name}
                          onChange={(e) => setExForm({ ...exForm, name: e.target.value })}
                          placeholder="Übungsname"
                          className="w-full bg-inset border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-white/25 outline-none"
                        />
                        <div className="grid grid-cols-2 gap-2">
                          {[
                            { label: 'Sätze', key: 'sets' as const },
                            { label: 'Wdh', key: 'reps' as const },
                            { label: 'Gewicht kg', key: 'weight_kg' as const },
                            { label: 'Pause (s)', key: 'rest_sec' as const },
                          ].map(({ label, key }) => (
                            <input
                              key={key}
                              type="number"
                              value={exForm[key] ?? ''}
                              onChange={(e) => setExForm({ ...exForm, [key]: Number(e.target.value) })}
                              placeholder={label}
                              className="bg-inset border border-white/10 rounded-lg px-2 py-2.5 text-sm text-white placeholder-white/25 outline-none text-center"
                            />
                          ))}
                        </div>
                        <button
                          onClick={() => addExercise(idx)}
                          disabled={!exForm.name.trim()}
                          className="adlr-tap w-full py-2.5 rounded-lg text-sm font-semibold disabled:opacity-40"
                          style={{ background: 'rgb(var(--adlr-gold) / 0.15)', color: 'rgb(var(--adlr-gold))', border: '1px solid rgb(var(--adlr-gold) / 0.25)' }}
                        >
                          Zum Tag hinzufügen
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setShowAddEx(true); setExpandedDay(idx); }}
                        className="adlr-tap w-full py-2.5 rounded-xl text-sm border border-dashed flex items-center justify-center gap-2"
                        style={{ borderColor: 'rgb(var(--text) / 0.12)', color: 'rgb(var(--text) / 0.35)' }}
                      >
                        <Plus size={14} /> Eigene Übung hinzufügen
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!activePlan && (
        <div className="rounded-2xl p-4 mb-5" style={{ background: 'rgb(var(--text) / 0.04)', border: '1px solid rgb(var(--text) / 0.08)' }}>
          <input
            value={newPlanName}
            onChange={(e) => setNewPlanName(e.target.value)}
            placeholder="Plan Name (z.B. Push/Pull/Legs Woche 1)"
            className="w-full bg-transparent text-white text-base placeholder-white/25 outline-none mb-3"
            autoFocus
          />
          <div className="h-px mb-3" style={{ background: 'rgb(var(--text) / 0.07)' }} />
          <select
            value={selectedClientId}
            onChange={(e) => setSelectedClientId(e.target.value)}
            className="w-full bg-transparent text-sm outline-none mb-3"
            style={{ color: selectedClientId ? 'rgb(var(--text))' : 'rgb(var(--text) / 0.35)' }}
          >
            <option value="">Klient wählen...</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id} className="bg-zinc-900">{c.first_name} {c.last_name}</option>
            ))}
          </select>
          <div className="h-px mb-3" style={{ background: 'rgb(var(--text) / 0.07)' }} />
          <div className="flex items-center gap-3">
            <button
              onClick={createPlan}
              disabled={!newPlanName.trim()}
              className="adlr-tap flex-1 py-3 rounded-xl text-sm font-semibold transition-all disabled:opacity-40"
              style={{ background: 'linear-gradient(135deg, rgb(var(--adlr-gold)), rgb(var(--adlr-gold-dim)))', color: '#000' }}
            >
              Plan zuweisen
            </button>
            <button
              onClick={saveAsTemplate}
              disabled={!newPlanName.trim()}
              className="adlr-tap flex items-center gap-1.5 text-sm whitespace-nowrap disabled:opacity-40"
              style={{ color: 'rgb(var(--text) / 0.5)' }}
            >
              <Copy size={13} /> Als Vorlage
            </button>
          </div>
        </div>
      )}

      {days.length > 0 && expandedDay === null && (
        <div className="mb-4 px-4 py-3 rounded-xl text-center adlr-fade-in" style={{ background: 'rgb(var(--adlr-gold) / 0.06)', border: '1px dashed rgb(var(--adlr-gold) / 0.25)' }}>
          <p className="text-sm" style={{ color: 'rgb(var(--adlr-gold))' }}>Tippe oben auf einen Trainingstag (z.B. Montag), um Übungen hinzuzufügen</p>
        </div>
      )}
      {days.length === 0 && (
        <div className="mb-4 px-4 py-3 rounded-xl text-center" style={{ background: 'rgb(var(--text) / 0.04)', border: '1px solid rgb(var(--text) / 0.08)' }}>
          <p className="text-sm text-white/40">Erstelle zuerst einen Plan, um Trainingstage zu sehen.</p>
        </div>
      )}
      {activePlan && days.length > 0 && (
        <>
          {!activePlan.is_template && (
            <button
              onClick={saveCurrentAsTemplate}
              className="adlr-tap w-full py-3 rounded-xl text-sm font-medium mb-3 flex items-center justify-center gap-2"
              style={{ background: 'rgb(var(--adlr-gold) / 0.08)', color: 'rgb(var(--adlr-gold))', border: '1px solid rgb(var(--adlr-gold) / 0.3)' }}
            >
              <Copy size={15} /> {templateMsg ?? 'Als Vorlage speichern'}
            </button>
          )}
          <button
            onClick={() => { setMode('list'); setActivePlan(null); }}
            className="adlr-tap w-full py-3.5 rounded-xl text-sm font-semibold mb-4 flex items-center justify-center gap-2"
            style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)' }}
          >
            <Check size={16} /> Fertig — alles gespeichert
          </button>
        </>
      )}
      {altPicker && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm sm:p-4" onClick={() => setAltPicker(null)}>
          <div className="w-full max-w-md max-h-[85vh] overflow-hidden bg-[rgb(var(--surface-2))] rounded-t-2xl sm:rounded-2xl border border-white/10 adlr-fade-in flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 shrink-0">
              <p className="text-sm font-semibold text-white">Alternative {altPicker.slot + 1} wählen</p>
              <button onClick={() => setAltPicker(null)} className="adlr-tap p-1 text-white/50"><X size={18} /></button>
            </div>
            <div className="overflow-y-auto p-3">
              <ExerciseLibrary
                canAdd={true}
                onDemo={(exRow) => setDemoEx(exRow)}
                onAdd={(exRow) => {
                  const target = days[altPicker.dayIdx]?.exercises?.[altPicker.exIdx];
                  const alts = [...(target?.alternatives ?? ['', ''])];
                  alts[altPicker.slot] = exRow.name;
                  updateExercise(altPicker.dayIdx, altPicker.exIdx, { alternatives: alts });
                  setAltPicker(null);
                }}
              />
            </div>
          </div>
        </div>
      )}
      {demoEx && <ExerciseDemoModal ex={demoEx} onClose={() => setDemoEx(null)} />}
    </div>
  );
}
