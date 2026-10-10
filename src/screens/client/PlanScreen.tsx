import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useAuth, useCoachName } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { fetchAll } from '@/lib/fetchAll';
import type { PlanDay, WorkoutCompletion, ExerciseSetLog, PersonalRecord, Exercise, Session } from '@/lib/types';
import Celebration from '@/components/Celebration';
import WorkoutSummary from '@/components/WorkoutSummary';
import { summarizeSession, type SessionSummary } from '@/lib/workoutSummary';
import { useNavigate } from 'react-router-dom';
import { SectionHeader, EmptyState, Loading } from '@/components/ui';
import { Flame, ChevronDown, Clock, Check, Play, Timer, Square, Dumbbell, Footprints, Moon, CircleDashed, Repeat, Calendar, MapPin, History, ChevronRight, Plus, Shuffle, Pencil, CloudOff, ShieldCheck, Trash2, X, StickyNote, SkipForward } from 'lucide-react';
import { FirstWorkoutIntro, FirstWorkoutTips } from '@/components/FirstWorkoutGuide';
import WeeklyCheckinCard from '@/components/WeeklyCheckinCard';
import { loadFrozenWeeks, applyStreakFreeze, mondayKey, scheduleStreakReminder } from '@/lib/engagement';
import { cacheGet, cacheSet, flushOutbox, isNetworkError, onOutboxChange, outbox, queueWorkout, uuid, type QueuedWorkout } from '@/lib/offline';
import { ExerciseDemoModal as LibDemoModal, hasDemo, ExerciseLibrary } from '@/components/ExerciseLibrary';
import { fetchExercises, isGymDependent, type ExerciseRow } from '@/lib/exercises';
import { useAsyncData } from '@/lib/useAsyncData';
import { haptic } from '@/lib/haptics';
import { localDateKey } from '@/lib/dates';
import { syncSessionReminders } from '@/lib/sessionReminders';
import { requestNotificationPermission } from '@/lib/restTimerNotifications';
import { startRestFlow, stopRestFlow, drainRestFlow, setRestFlowForeground, onRestFlowAction, removeRestFlowListener, type RestStep } from '@/lib/restChrono';
import { playRestAlarm, unlockRestAlarm } from '@/lib/restAlarm';
import { t, fmtDate, fmtTime } from '@/lib/i18n';
import ClientDayEditor from '@/components/ClientDayEditor';
import WeeklyRecap from '@/components/WeeklyRecap';
import { loadWeeklyRecap, recapSeenThisWeek, markRecapSeen, scheduleWeeklyRecapNotification, type WeeklyRecapData } from '@/lib/weeklyRecap';
import { weeklyStreak } from '@/lib/streak';
import { takeRepeat, type RepeatWorkout } from '@/lib/repeatWorkout';
import { guessMuscle } from '@/lib/muscleGuess';

const NOTIF_PROMPT_KEY = 'adlr_notif_prompted';
const ACTIVE_TRAINING_KEY = 'adlr_active_training';
// A training session shouldn't realistically span longer than this — guards against
// resuming a stale session from days ago if the app was never properly closed out.
const ACTIVE_TRAINING_MAX_AGE_MS = 6 * 60 * 60 * 1000;

type SetType = 'warmup' | 'working' | 'dropset';
const SET_TYPE_CYCLE: SetType[] = ['working', 'warmup', 'dropset'];
const SET_TYPE_LABEL: Record<SetType, string> = { working: '', warmup: 'WU', dropset: 'DS' };

interface SetInput {
  weight: string;
  reps: string;
  type: SetType;
  min?: string; // cardio: duration in minutes
  km?: string;  // cardio: distance
}

// Resolve an exercise's per-set prescription (falls back to uniform sets×reps@weight).
function effectiveSets(ex: Exercise): { weight_kg?: number; reps?: number }[] {
  const n = Math.max(1, ex.sets ?? 1);
  const base = ex.set_details ?? [];
  return Array.from({ length: n }, (_, i) => base[i] ?? { weight_kg: ex.weight_kg, reps: ex.reps });
}
function setsVary(arr: { weight_kg?: number; reps?: number }[]): boolean {
  return arr.some((s, i) => i > 0 && (s.weight_kg !== arr[0].weight_kg || s.reps !== arr[0].reps));
}

interface PersistedTraining {
  dayId: string;
  freeDay?: PlanDay; // ad-hoc free workout (not part of the plan)
  /** plan day edited during the session (exercises/sets added or removed) — the plan itself is untouched */
  sessionExercises?: PlanDay['exercises'];
  checkedSets: string[];
  setInputs: Record<string, SetInput[]>;
  trainingStartAt: number;
  notes?: Record<string, string>;
  restEndAt?: number | null;
  restTotal?: number;
}

// Rest timer preferences (per device): auto-start on ticking a set, and per-exercise
// rest overrides in seconds (0 = no rest timer for that exercise).
const REST_PREFS_KEY = 'adlr_rest_prefs';
interface RestPrefs { auto: boolean; overrides: Record<string, number> }
const REST_OPTIONS = [0, 30, 45, 60, 75, 90, 120, 150, 180, 240, 300];
function fmtRest(sec: number): string {
  return sec >= 60 ? `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}` : `${sec}s`;
}

// Composite key for the per-set checked state, e.g. "Kniebeugen#0" for the first set.
// Selected Studio (gym) — remembered per device; known gyms = this list + gyms from history.
const GYM_KEY = 'adlr_gym';
const GYMS_KEY = 'adlr_gyms';
function readLS<T>(key: string, fallback: T): T {
  try { const raw = localStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : fallback; } catch { return fallback; }
}
function writeLS(key: string, value: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage blocked */ }
}

function setKey(exerciseName: string, setIdx: number): string {
  return `${exerciseName}#${setIdx}`;
}

function persistActiveTraining(state: PersistedTraining | null): void {
  try {
    if (state) localStorage.setItem(ACTIVE_TRAINING_KEY, JSON.stringify(state));
    else localStorage.removeItem(ACTIVE_TRAINING_KEY);
  } catch { /* ignore quota errors */ }
}

function getPersistedActiveTraining(): PersistedTraining | null {
  try {
    const raw = localStorage.getItem(ACTIVE_TRAINING_KEY);
    return raw ? (JSON.parse(raw) as PersistedTraining) : null;
  } catch {
    return null;
  }
}

export default function PlanScreen() {
  const { profile, refreshProfile } = useAuth();
  const coach = useCoachName();
  const [days, setDays] = useState<PlanDay[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [completions, setCompletions] = useState<WorkoutCompletion[]>([]);
  const [setLogs, setSetLogs] = useState<ExerciseSetLog[]>([]);
  const [prs, setPrs] = useState<PersonalRecord[]>([]);
  const [celebrate, setCelebrate] = useState(false);
  const [newPRs, setNewPRs] = useState<{ exercise_name: string; weight_kg: number; reps: number; gym?: string | null }[]>([]);
  const [milestoneMsg, setMilestoneMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);
  // Post-workout recap (swipeable summary cards) shown after 'Training beenden'.
  const [finished, setFinished] = useState<{ summary: SessionSummary; all: WorkoutCompletion[] } | null>(null);
  const nav = useNavigate();
  const [demoEx, setDemoEx] = useState<ExerciseRow | null>(null);
  const [offline, setOffline] = useState(false);
  const [frozen, setFrozen] = useState<{ weeks: Set<string>; usedThisMonth: boolean }>({ weeks: new Set(), usedThisMonth: false });
  const [freezeMsg, setFreezeMsg] = useState<string | null>(null);
  const [queuedCount, setQueuedCount] = useState(() => outbox().length);
  const { data: lib } = useAsyncData(fetchExercises, []);
  // Cardio exercises log time/distance instead of kg × reps.
  const cardioNames = useMemo(() => new Set((lib ?? []).filter((e) => e.muscle_group === 'Cardio').map((e) => e.name)), [lib]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editingDay, setEditingDay] = useState<PlanDay | null>(null);
  // Clients the coach allows to edit their plan get asked whether this session's changes
  // (added/removed exercises or sets) should stay in the plan.
  const [planSaveOffer, setPlanSaveOffer] = useState<{ dayId: string; exercises: Exercise[] } | null>(null);
  const [planSaveBusy, setPlanSaveBusy] = useState(false);
  const [planSaveError, setPlanSaveError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Saving takes a moment (notification + several requests); repeated taps on "Beenden" used to
  // store the same workout several times ("Training + Training + Training" with tripled sets).
  const finishingRef = useRef(false);
  const [finishing, setFinishing] = useState(false);
  // Weekly recap of LAST week: banner + auto-shown before the first workout of the week.
  const [recap, setRecap] = useState<WeeklyRecapData | null>(null);
  const [recapSeen, setRecapSeen] = useState(recapSeenThisWeek());
  const [recapOpen, setRecapOpen] = useState<{ startIdx: number | null } | null>(null);
  const libMap = lib ? new Map(lib.map((e) => [e.name, e])) : null;

  // Active training session state
  const [activeDayIdx, setActiveDayIdx] = useState<number | null>(null);
  const [checkedSets, setCheckedSets] = useState<Set<string>>(new Set());
  const [gym, setGymState] = useState<string | null>(() => readLS<string | null>(GYM_KEY, null));
  const [savedGyms, setSavedGyms] = useState<string[]>(() => readLS<string[]>(GYMS_KEY, []));
  const [addingGym, setAddingGym] = useState(false);
  const [gymSheet, setGymSheet] = useState(false);
  // With several Studios the client is asked where they train before a session starts.
  const [gymStart, setGymStart] = useState<{ run: (g: string | null) => void } | null>(null);
  // Per-exercise notes of the running session (e.g. "Sitz Stufe 4"); saved with the workout.
  const [exNotes, setExNotes] = useState<Record<string, string>>({});
  const [noteEditing, setNoteEditing] = useState<string | null>(null);
  const [nameEditing, setNameEditing] = useState(false);
  const [restPrefs, setRestPrefsState] = useState<RestPrefs>(() => ({ auto: true, overrides: {}, ...readLS<Partial<RestPrefs>>(REST_PREFS_KEY, {}) }));
  const setRestPrefs = (p: RestPrefs) => { setRestPrefsState(p); writeLS(REST_PREFS_KEY, p); };
  const [restSheet, setRestSheet] = useState<Exercise | null>(null);
  const [newGym, setNewGym] = useState('');
  const setGym = (g: string | null) => { setGymState(g); writeLS(GYM_KEY, g); };
  const knownGyms = [...new Set([...savedGyms, ...completions.map((c) => c.gym).filter((g): g is string => !!g)])];
  // Safety dialog before finishing with un-ticked sets, or before discarding a session.
  const [confirm, setConfirm] = useState<
    | { kind: 'finish'; dayIdx: number; open: { name: string; missing: number }[] }
    | { kind: 'cancel' }
    | null
  >(null);
  const [setInputs, setSetInputs] = useState<Record<string, SetInput[]>>({});
  // Rest timer: absolute end time (survives the app sleeping — a decrementing counter froze
  // while the phone was locked), total length for the progress bar.
  const [restEndAt, setRestEndAt] = useState<number | null>(null);
  const [restTotal, setRestTotal] = useState(0);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [trainingStartAt, setTrainingStartAt] = useState<number | null>(null);
  const [trainingElapsed, setTrainingElapsed] = useState(0);
  const [notifPermissionDenied, setNotifPermissionDenied] = useState(false);
  const [starterBusy, setStarterBusy] = useState(false);
  // Exercises as stored in the plan — session edits are rolled back to these when the session ends.
  const planExercises = useRef<Map<string, PlanDay['exercises']>>(new Map());
  const notifPromptShown = useRef(false);

  // Restores a training that was active when the app got closed (initial load only).
  const applyPlanDays = (planDays: PlanDay[]) => {
    planExercises.current = new Map(planDays.map((d) => [d.id, d.exercises]));
    // A reload during a running session (e.g. back online) must not drop the session's
    // added/removed exercises or the free workout.
    if (activeDayIdx !== null) {
      setDays((prev) => {
        const active = prev[activeDayIdx];
        if (!active) return planDays;
        if (active.is_free) return [...planDays, active];
        return planDays.map((d) => (d.id === active.id ? { ...d, exercises: active.exercises } : d));
      });
      return;
    }
    // Resume a training session that was active when the app got closed/killed —
    // only on the initial load (activeDayIdx is still null at that point).
    let persisted = getPersistedActiveTraining();
    if (persisted && Date.now() - persisted.trainingStartAt > ACTIVE_TRAINING_MAX_AGE_MS) {
      persistActiveTraining(null);
      stopRestFlow();
      persisted = null;
    }
    let loadedDays = persisted?.freeDay ? [...planDays, persisted.freeDay] : planDays;
    if (persisted?.sessionExercises) {
      loadedDays = loadedDays.map((d) => (d.id === persisted!.dayId ? { ...d, exercises: persisted!.sessionExercises! } : d));
    }
    const idx = persisted ? loadedDays.findIndex((d) => d.id === persisted!.dayId) : -1;
    if (persisted && idx === -1) {
      persistActiveTraining(null);
      stopRestFlow();
      persisted = null;
    }
    setDays(persisted ? loadedDays : planDays);
    if (persisted) {
      setActiveDayIdx(idx);
      setCheckedSets(new Set(persisted.checkedSets));
      setSetInputs(persisted.setInputs);
      setTrainingStartAt(persisted.trainingStartAt);
      setExNotes(persisted.notes ?? {});
      if (persisted.restEndAt && persisted.restEndAt > Date.now()) {
        setRestEndAt(persisted.restEndAt);
        setRestTotal(persisted.restTotal ?? 0);
      }
      setExpanded(idx);
    }
  };

  // Workouts finished offline and not yet synced still count (history, "last time", streak).
  const withPending = (wcs: WorkoutCompletion[], logs: ExerciseSetLog[]) => {
    // A row that's already uploaded but still waits for its sets shows them from the outbox.
    const mine = outbox().filter((q) => q.client_id === profile?.id);
    const pending = mine.filter((q) => !q.remoteId);
    return {
      completions: [...pending.map((q) => ({ id: q.localId, client_id: q.client_id, plan_day_id: q.plan_day_id, completed_at: q.completed_at, duration_sec: q.duration_sec, gym: q.gym, title: q.title, exercise_notes: q.exercise_notes ?? null })), ...wcs],
      logs: [...mine.filter((q) => !q.logsSent).flatMap((q) => q.logs.map((l, i) => ({ ...l, id: l.id ?? `${q.localId}-${i}`, client_id: q.client_id, workout_completion_id: q.remoteId ?? q.localId, created_at: q.completed_at, set_type: l.set_type as ExerciseSetLog['set_type'] }))), ...logs],
    };
  };

  const load = async () => {
    if (!profile) return;
    setLoading(true);
    if (outbox().length > 0) await flushOutbox().catch(() => 0);
    let trainingDaysInPlan = 0;
    const { data: cp, error: cpErr } = await supabase
      .from('client_plans')
      .select('plan_id')
      .eq('client_id', profile.id)
      .eq('is_active', true)
      .maybeSingle();
    if (cpErr && isNetworkError(cpErr)) {
      // Offline: open from the last snapshot so the client can still train.
      const snap = cacheGet<{ days: PlanDay[]; completions: WorkoutCompletion[]; setLogs: ExerciseSetLog[]; prs: PersonalRecord[]; sessions: Session[] }>(profile.id, 'plan');
      if (snap) {
        applyPlanDays(snap.days);
        const merged = withPending(snap.completions, snap.setLogs);
        setCompletions(merged.completions);
        setSetLogs(merged.logs);
        setPrs(snap.prs);
        setSessions(snap.sessions);
      }
      setOffline(true);
      setLoading(false);
      return;
    }
    setOffline(false);
    loadFrozenWeeks(profile.id).then(setFrozen).catch(() => {});
    let planDays: PlanDay[] = [];
    if (cp) {
      const { data: pd } = await supabase.from('plan_days').select('*').eq('plan_id', cp.plan_id).order('day_of_week');
      planDays = (pd ?? []) as PlanDay[];
      trainingDaysInPlan = planDays.filter((d) => !d.is_rest_day).length;
    }
    // Also without a plan: a running free workout has to be restored.
    applyPlanDays(planDays);
    const { data: wc } = await supabase.from('workout_completions').select('*').eq('client_id', profile.id).order('completed_at', { ascending: false });
    const { data: sl } = await fetchAll((a, b) => supabase.from('exercise_set_logs').select('*').eq('client_id', profile.id).order('created_at', { ascending: false }).order('id').range(a, b));
    const merged = withPending((wc ?? []) as WorkoutCompletion[], (sl ?? []) as ExerciseSetLog[]);
    setCompletions(merged.completions);
    setSetLogs(merged.logs);
    const { data: pr } = await supabase.from('personal_records').select('*').eq('client_id', profile.id);
    setPrs((pr ?? []) as PersonalRecord[]);
    // Upcoming PT sessions (from today), for the "Nächste Termine" card + reminders
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const { data: ss } = await supabase
      .from('sessions')
      .select('*')
      .eq('client_id', profile.id)
      .neq('status', 'cancelled')
      .gte('scheduled_at', todayStart.toISOString())
      .order('scheduled_at', { ascending: true });
    const sessList = (ss ?? []) as Session[];
    setSessions(sessList);
    cacheSet(profile.id, 'plan', { days: planDays, completions: wc ?? [], setLogs: (sl ?? []).slice(0, 1500), prs: pr ?? [], sessions: sessList });
    syncSessionReminders(sessList);
    scheduleWeeklyRecapNotification();
    if (!recapSeenThisWeek()) loadWeeklyRecap(profile.id, trainingDaysInPlan).then(setRecap).catch(() => {});
    setLoading(false);
  };

  useEffect(() => { load(); }, [profile?.id]);

  // A repeat request from the history ("Nochmal trainieren") — start it once the screen is ready.
  useEffect(() => {
    if (loading || activeDayIdx !== null) return;
    const rep = takeRepeat();
    if (rep && rep.exercises.length > 0) startRepeatTraining(rep);
  }, [loading]);
  useEffect(() => onOutboxChange(() => setQueuedCount(outbox().length)), []);
  // Saturday nudge while this week's goal is still open (recomputed on every load).
  useEffect(() => {
    if (loading || days.length === 0) return;
    const target = days.filter((d) => !d.is_rest_day && !d.is_free).length;
    const monday = mondayKey(new Date());
    const doneThisWeek = completions.filter((c) => localDateKey(c.completed_at) >= monday).length;
    scheduleStreakReminder(weeklyStreak(completions.map((c) => c.completed_at), target, frozen.weeks), frozen.weeks.has(monday) ? 0 : target - doneThisWeek);
  }, [loading, days, completions, frozen]);
  // Back online with an open screen: sync queued workouts, then refresh from the server.
  useEffect(() => {
    const onOnline = () => { if (outbox().length > 0 || offline) load(); };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  });

  // Keep the active training session persisted so it survives the app being
  // backgrounded/killed and reopened (Android may kill the WebView process).
  useEffect(() => {
    if (activeDayIdx === null || trainingStartAt === null) return;
    const day = days[activeDayIdx];
    if (!day) return;
    persistActiveTraining({
      dayId: day.id,
      freeDay: day.is_free ? day : undefined,
      sessionExercises: day.is_free ? undefined : day.exercises,
      checkedSets: Array.from(checkedSets),
      setInputs,
      trainingStartAt,
      notes: exNotes,
      restEndAt,
      restTotal,
    });
  }, [activeDayIdx, checkedSets, setInputs, trainingStartAt, days, exNotes, restEndAt, restTotal]);

  // Live elapsed-time counter while a training session is active
  useEffect(() => {
    if (trainingStartAt === null) { setTrainingElapsed(0); return; }
    const id = setInterval(() => setTrainingElapsed(Math.floor((Date.now() - trainingStartAt) / 1000)), 1000);
    return () => clearInterval(id);
  }, [trainingStartAt]);

  // Rest countdown from the absolute end time. Beep + buzz when it runs out while the app is
  // open (in the background the native lock-screen flow alerts instead).
  useEffect(() => {
    if (restEndAt === null) return;
    const tick = () => {
      const now = Date.now();
      setNowTick(now);
      if (now >= restEndAt) {
        if (document.visibilityState === 'visible' && now - restEndAt < 4000) playRestAlarm();
        setRestEndAt(null);
      }
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [restEndAt]);
  const restLeft = restEndAt !== null ? Math.max(0, Math.ceil((restEndAt - nowTick) / 1000)) : null;

  // ── Lock-screen flow (rest countdown → next set with ✓, see lib/restChrono.ts) ──
  const restFor = (ex: Exercise) => restPrefs.overrides[ex.name] ?? ex.rest_sec ?? 0;
  const setLine = (ex: Exercise, i: number, inputs: Record<string, SetInput[]>) => {
    const s = inputs[ex.name]?.[i];
    const parts = [t('Satz {n}/{total}', { n: i + 1, total: ex.sets ?? 1 })];
    if (cardioNames.has(ex.name)) {
      if (s?.min) parts.push(`${s.min} min`);
      if (s?.km) parts.push(`${s.km} km`);
    } else if (s?.weight || s?.reps) {
      parts.push(`${s.weight || '—'} kg × ${s.reps || '—'}`);
    }
    return parts.join(' · ');
  };
  // Every set not ticked yet, in training order — the lock screen walks through these.
  const buildSteps = (day: PlanDay, checked: Set<string>, inputs: Record<string, SetInput[]>): RestStep[] => {
    const steps: RestStep[] = [];
    for (const ex of day.exercises ?? []) {
      for (let i = 0; i < (ex.sets ?? 1); i++) {
        const key = setKey(ex.name, i);
        if (checked.has(key)) continue;
        steps.push({ key, title: t(ex.name), body: setLine(ex, i, inputs), rest: restPrefs.auto ? restFor(ex) : 0 });
      }
    }
    return steps;
  };
  // Mirror the session to the lock screen whenever it changes (debounced: typing weights).
  useEffect(() => {
    if (activeDayIdx === null || loading) return;
    const day = days[activeDayIdx];
    if (!day) return;
    const id = setTimeout(() => startRestFlow(restEndAt ?? Date.now(), buildSteps(day, checkedSets, setInputs)), 400);
    return () => clearTimeout(id);
  }, [activeDayIdx, loading, days, checkedSets, setInputs, restEndAt, restPrefs]);

  // Apply what was tapped on the lock screen (sets ticked, rest adjusted) to the session.
  const applyLockScreen = useRef<() => void>(() => {});
  applyLockScreen.current = async () => {
    if (activeDayIdx === null) return;
    const { events, state } = await drainRestFlow();
    const done = events.flatMap((e) => (e.type === 'done' ? [e.key] : []));
    if (done.length > 0) setCheckedSets((prev) => new Set([...prev, ...done]));
    if (events.length === 0) return;
    if (state.phase === 'rest' && state.endTime > Date.now()) {
      setRestTotal(Math.max(1, Math.round((state.endTime - events[events.length - 1].at) / 1000)));
      setRestEndAt(state.endTime);
    } else {
      setRestEndAt(null);
    }
  };
  useEffect(() => {
    onRestFlowAction(() => applyLockScreen.current());
    const onVisibility = () => {
      const visible = document.visibilityState === 'visible';
      setRestFlowForeground(visible);
      if (visible) applyLockScreen.current();
    };
    setRestFlowForeground(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', onVisibility);
    return () => { removeRestFlowListener(); document.removeEventListener('visibilitychange', onVisibility); };
  }, []);
  // A restored session may have been continued on the lock screen meanwhile.
  useEffect(() => { if (!loading && activeDayIdx !== null) applyLockScreen.current(); }, [loading, activeDayIdx !== null]);

  const adjustRest = (delta: number) => {
    if (restEndAt === null) return;
    const next = restEndAt + delta * 1000;
    if (next <= Date.now() + 1000) { setRestEndAt(null); return; }
    setRestEndAt(next);
    setRestTotal((r) => Math.max(1, r + delta));
    haptic.light();
  };
  const stopRestTimer = () => setRestEndAt(null);

  const ensureNotificationPermission = async () => {
    if (notifPromptShown.current) return;
    notifPromptShown.current = true;
    try { localStorage.setItem(NOTIF_PROMPT_KEY, '1'); } catch { /* ignore */ }
    const granted = await requestNotificationPermission();
    if (!granted) setNotifPermissionDenied(true);
  };

  // Get last session's logs for a specific exercise on a specific plan day
  // Last logged sets for an exercise — preferably from the SAME Studio (machine weights
  // differ between gyms), from any plan day. Falls back to the latest session anywhere.
  const getLastSessionLogs = useCallback((exerciseName: string, inGym: string | null = gym): { logs: ExerciseSetLog[]; gym: string | null; otherGym: boolean } => {
    const byTime = [...completions].sort((x, y) => new Date(y.completed_at).getTime() - new Date(x.completed_at).getTime());
    const logsFor = (cId: string) => setLogs
      .filter((l) => l.workout_completion_id === cId && l.exercise_name === exerciseName)
      .sort((x, y) => x.set_number - y.set_number);
    for (const c of byTime) {
      if ((c.gym ?? null) !== inGym) continue;
      const ls = logsFor(c.id);
      if (ls.length > 0) return { logs: ls, gym: c.gym ?? null, otherGym: false };
    }
    for (const c of byTime) {
      const ls = logsFor(c.id);
      if (ls.length > 0) return { logs: ls, gym: c.gym ?? null, otherGym: true };
    }
    return { logs: [], gym: null, otherGym: false };
  }, [completions, setLogs, gym]);

  // Latest note written for an exercise — same Studio first (seat/pin settings differ per gym).
  const lastNoteFor = useCallback((exerciseName: string): string | null => {
    const byTime = [...completions].sort((x, y) => new Date(y.completed_at).getTime() - new Date(x.completed_at).getTime());
    const hit = byTime.find((c) => (c.gym ?? null) === gym && c.exercise_notes?.[exerciseName])
      ?? byTime.find((c) => c.exercise_notes?.[exerciseName]);
    return hit?.exercise_notes?.[exerciseName] ?? null;
  }, [completions, gym]);

  // Studio switched mid-session (forgot to pick it): sets still showing the old Studio's
  // weights get the new Studio's last weights. Ticked or hand-typed sets stay as they are.
  const changeGym = (g: string | null) => {
    if (activeDayIdx !== null && g !== gym) {
      const day = days[activeDayIdx];
      setSetInputs((prev) => {
        const next = { ...prev };
        for (const ex of day?.exercises ?? []) {
          const fresh = getLastSessionLogs(ex.name, g);
          if (fresh.otherGym || fresh.logs.length === 0) continue;
          const old = getLastSessionLogs(ex.name, gym).logs;
          next[ex.name] = (prev[ex.name] ?? []).map((s, i) => {
            if (checkedSets.has(setKey(ex.name, i)) || !fresh.logs[i]) return s;
            const w = s.weight === '' || s.weight === (old[i]?.weight_kg?.toString() ?? '');
            const r = s.reps === '' || s.reps === (old[i]?.reps?.toString() ?? '');
            return {
              ...s,
              weight: w ? fresh.logs[i].weight_kg?.toString() ?? s.weight : s.weight,
              reps: r ? fresh.logs[i].reps?.toString() ?? s.reps : s.reps,
            };
          });
        }
        return next;
      });
    }
    setGym(g);
  };

  // Several Studios known → ask where today's session happens before it starts.
  const requestStart = (run: (g: string | null) => void) => {
    if (activeDayIdx === null && knownGyms.length >= 2) {
      setGymStart({ run });
      setGymSheet(true);
    } else {
      run(gym);
    }
  };

  // "Freies Training": an ad-hoc session with exercises picked from the library.
  const startFreeTraining = () => {
    const fd: PlanDay = {
      id: `free-${Date.now()}`, plan_id: '', day_of_week: 99, workout_name: 'Freies Training', focus: null,
      difficulty: 1, duration_min: null, notes: null, exercises: [], is_rest_day: false, is_free: true,
    };
    ensureNotificationPermission();
    unlockRestAlarm();
    const idx = days.filter((d) => !d.is_free).length;
    setDays((prev) => [...prev.filter((d) => !d.is_free), fd]);
    setSetInputs({});
    setExNotes({});
    setCheckedSets(new Set());
    setActiveDayIdx(idx);
    setExpanded(idx);
    setTrainingStartAt(Date.now());
    setPickerOpen(true);
    haptic.medium();
  };
  // "Nochmal trainieren": start a past session again as a free workout, prefilled.
  const startRepeatTraining = (rep: RepeatWorkout) => {
    const fd: PlanDay = {
      id: `free-${Date.now()}`, plan_id: '', day_of_week: 99, workout_name: rep.title || 'Freies Training', focus: null,
      difficulty: 1, duration_min: null, notes: null, is_rest_day: false, is_free: true,
      exercises: rep.exercises.map((e) => ({ name: e.name, sets: e.sets.length, reps: Number(e.sets[0]?.reps) || undefined, rest_sec: libMap?.get(e.name)?.default_rest_sec || 90 })),
    };
    ensureNotificationPermission();
    const idx = days.filter((d) => !d.is_free).length;
    setDays((prev) => [...prev.filter((d) => !d.is_free), fd]);
    setSetInputs(Object.fromEntries(rep.exercises.map((e) => [e.name, e.sets.map((s) => ({ ...s }))])));
    setExNotes({});
    setCheckedSets(new Set());
    setActiveDayIdx(idx);
    setExpanded(idx);
    setTrainingStartAt(Date.now());
    haptic.medium();
  };
  // Session editing (free workout AND a started plan day): only this session changes, never the plan.
  const sessionDayId = activeDayIdx !== null ? days[activeDayIdx]?.id ?? null : null;
  // The written plan is the default: only clients the coach unlocked (can_edit_plan) may change
  // a plan day's exercises/sets mid-session. A free workout is always theirs to build.
  const canEditSession = (d: PlanDay) => !!d.is_free || !!profile?.can_edit_plan;
  const isSessionDay = (d: PlanDay) => d.id === sessionDayId;
  const addFreeExercise = (row: ExerciseRow) => {
    const active = activeDayIdx !== null ? days[activeDayIdx] : undefined;
    if (!active || (active.exercises ?? []).some((e) => e.name === row.name)) return;
    const sets = row.default_sets || 3;
    setDays((prev) => prev.map((d) => (isSessionDay(d)
      ? { ...d, exercises: [...(d.exercises ?? []), { name: row.name, sets, reps: row.default_reps || undefined, rest_sec: row.default_rest_sec || 90 }] }
      : d)));
    const lastLogs = getLastSessionLogs(row.name).logs;
    setSetInputs((prev) => ({
      ...prev,
      [row.name]: Array.from({ length: sets }, (_, i) => ({
        weight: lastLogs[i]?.weight_kg?.toString() ?? '',
        reps: lastLogs[i]?.reps?.toString() ?? (row.default_reps ? String(row.default_reps) : ''),
        type: 'working' as SetType,
        min: lastLogs[i]?.duration_sec ? String(Math.round(lastLogs[i].duration_sec! / 60)) : '',
        km: lastLogs[i]?.distance_km?.toString() ?? '',
      })),
    }));
    haptic.light();
  };

  // Free workout editing: remove an exercise, remove a single set, add a set.
  // Checked-set keys are "<exercise>#<index>", so they're re-indexed when a set is removed.
  const remapChecked = (name: string, fn: (i: number) => number | null) => setCheckedSets((prev) => {
    const next = new Set<string>();
    for (const k of prev) {
      const cut = k.lastIndexOf('#');
      if (k.slice(0, cut) !== name) { next.add(k); continue; }
      const j = fn(Number(k.slice(cut + 1)));
      if (j !== null) next.add(setKey(name, j));
    }
    return next;
  });
  const removeFreeExercise = (name: string) => {
    setDays((prev) => prev.map((d) => (isSessionDay(d) ? { ...d, exercises: d.exercises.filter((e) => e.name !== name) } : d)));
    setSetInputs((prev) => { const next = { ...prev }; delete next[name]; return next; });
    remapChecked(name, () => null);
    haptic.light();
  };
  const removeFreeSet = (name: string, idx: number) => {
    const ex = (activeDayIdx !== null ? days[activeDayIdx] : undefined)?.exercises.find((e) => e.name === name);
    if (!ex) return;
    if ((ex.sets ?? 1) <= 1) { removeFreeExercise(name); return; }
    setDays((prev) => prev.map((d) => (isSessionDay(d) ? { ...d, exercises: d.exercises.map((e) => (e.name === name ? { ...e, sets: (e.sets ?? 1) - 1 } : e)) } : d)));
    setSetInputs((prev) => ({ ...prev, [name]: (prev[name] ?? []).filter((_, i) => i !== idx) }));
    remapChecked(name, (i) => (i === idx ? null : i > idx ? i - 1 : i));
    haptic.light();
  };
  const addFreeSet = (name: string) => {
    setDays((prev) => prev.map((d) => (isSessionDay(d) ? { ...d, exercises: d.exercises.map((e) => (e.name === name ? { ...e, sets: (e.sets ?? 1) + 1 } : e)) } : d)));
    setSetInputs((prev) => {
      const arr = [...(prev[name] ?? [])];
      const last = arr[arr.length - 1];
      arr.push(last ? { ...last, type: 'working' } : { weight: '', reps: '', type: 'working' });
      return { ...prev, [name]: arr };
    });
    haptic.light();
  };

  // Initialize set inputs when training starts (prefilled from the given Studio's last session)
  const startTraining = (dayIdx: number, inGym: string | null = gym) => {
    ensureNotificationPermission();
    unlockRestAlarm();
    const day = days[dayIdx];
    if (!day || !day.exercises) return;
    const inputs: Record<string, SetInput[]> = {};
    for (const ex of day.exercises) {
      const lastLogs = getLastSessionLogs(ex.name, inGym).logs;
      const presc = effectiveSets(ex);
      inputs[ex.name] = Array.from({ length: ex.sets ?? 1 }, (_, i) => ({
        weight: lastLogs[i]?.weight_kg?.toString() ?? presc[i]?.weight_kg?.toString() ?? '',
        reps: lastLogs[i]?.reps?.toString() ?? presc[i]?.reps?.toString() ?? '',
        type: 'working' as SetType,
        min: lastLogs[i]?.duration_sec ? String(Math.round(lastLogs[i].duration_sec! / 60)) : '',
        km: lastLogs[i]?.distance_km?.toString() ?? '',
      }));
    }
    setSetInputs(inputs);
    setExNotes({});
    setCheckedSets(new Set());
    setActiveDayIdx(dayIdx);
    setTrainingStartAt(Date.now());
    haptic.medium();
  };

  const stopTraining = () => {
    setActiveDayIdx(null);
    setDays((prev) => prev.filter((d) => !d.is_free).map((d) => (planExercises.current.has(d.id) ? { ...d, exercises: planExercises.current.get(d.id)! } : d)));
    setCheckedSets(new Set());
    setSetInputs({});
    setExNotes({});
    setNoteEditing(null);
    setNameEditing(false);
    setTrainingStartAt(null);
    stopRestTimer();
    stopRestFlow();
    persistActiveTraining(null);
  };

  const finishTraining = async (dayIdx: number) => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    setFinishing(true);
    try { await saveFinishedTraining(dayIdx); } finally { finishingRef.current = false; setFinishing(false); }
  };

  const saveFinishedTraining = async (dayIdx: number) => {
    const day = days[dayIdx];
    if (!profile || !day) return;
    const durationSec = trainingStartAt ? Math.floor((Date.now() - trainingStartAt) / 1000) : null;
    const completedAt = new Date().toISOString();
    const completionId = uuid();
    const planDayId = day.is_free ? null : day.id;
    const title = day.is_free ? (day.workout_name?.trim() || 'Freies Training') : null;
    // Collect the logged sets first (row ids made here, so a retried upload can't duplicate them).
    const baseLogs: Array<{ id: string; plan_day_id: string | null; exercise_name: string; set_number: number; weight_kg: number | null; reps: number | null; set_type: SetType; duration_sec: number | null; distance_km: number | null }> = [];
    // Pre-filled values (last session / plan) are not proof a set was done: once any set is
    // ticked, only ticked sets are saved; with nothing ticked, every filled-in set counts.
    const onlyChecked = checkedSets.size > 0;
    for (const ex of day.exercises ?? []) {
      const inputs = setInputs[ex.name] ?? [];
      for (let i = 0; i < inputs.length; i++) {
        if (onlyChecked && !checkedSets.has(setKey(ex.name, i))) continue;
        const w = inputs[i]?.weight ? Number(inputs[i].weight) : null;
        const r = inputs[i]?.reps ? Number(inputs[i].reps) : null;
        const dur = inputs[i]?.min ? Math.round(Number(inputs[i].min) * 60) : null;
        const km = inputs[i]?.km ? Number(inputs[i].km) : null;
        if (w !== null || r !== null || dur !== null || km !== null) {
          baseLogs.push({
            id: uuid(),
            plan_day_id: planDayId,
            exercise_name: ex.name,
            set_number: i + 1,
            weight_kg: w,
            reps: r,
            set_type: inputs[i]?.type ?? 'working',
            duration_sec: dur,
            distance_km: km,
          });
        }
      }
    }
    // Auto-detect new personal records from this session's heaviest working/dropset sets
    // (warm-up sets are intentionally lighter and shouldn't trigger a false PR).
    const bestByExercise = new Map<string, { weight_kg: number; reps: number }>();
    for (const l of baseLogs) {
      if (l.weight_kg == null || l.set_type === 'warmup') continue;
      const cur = bestByExercise.get(l.exercise_name);
      if (!cur || l.weight_kg > cur.weight_kg) bestByExercise.set(l.exercise_name, { weight_kg: l.weight_kg, reps: l.reps ?? 0 });
    }
    // Machine/cable PRs are compared within the current Studio only (loads differ per gym).
    const equipmentByName = new Map((lib ?? []).map((e) => [e.name, e.equipment]));
    const detected: { exercise_name: string; weight_kg: number; reps: number; gym: string | null }[] = [];
    for (const [name, best] of bestByExercise) {
      const prGym = gym && isGymDependent(equipmentByName.get(name)) ? gym : null;
      const prevMax = prs
        .filter((p) => p.exercise_name === name && (prGym ? p.gym === prGym : true))
        .reduce((m, p) => Math.max(m, p.weight_kg), 0);
      if (best.weight_kg > prevMax) detected.push({ exercise_name: name, weight_kg: best.weight_kg, reps: best.reps, gym: prGym });
    }
    const notes = Object.fromEntries((day.exercises ?? []).flatMap((ex) => {
      const n = exNotes[ex.name]?.trim();
      return n ? [[ex.name, n]] : [];
    }));

    // Write the whole workout to the device FIRST, then upload it. Saving used to be 5–6
    // requests in a row whose errors were ignored: a connection drop or the phone being
    // locked mid-save left a workout without duration and sets. Now nothing is lost — the
    // upload is retried (app start, back online) until the server has all of it.
    const queued: QueuedWorkout = {
      localId: completionId, id: completionId, client_id: profile.id, plan_day_id: planDayId, completed_at: completedAt,
      title, gym, duration_sec: durationSec, exercise_notes: Object.keys(notes).length > 0 ? notes : null,
      logs: baseLogs, prs: detected,
    };
    queueWorkout(queued);
    setSaveError(null);
    if (detected.length > 0) setNewPRs(detected);

    // Milestone celebration — total completed workouts including this one.
    const totalWorkouts = completions.length + 1;
    if (totalWorkouts === 1) setMilestoneMsg(t('Dein erstes Training! Der Anfang von etwas Großem.'));
    else if (totalWorkouts % 100 === 0) setMilestoneMsg(t('{n}. Training! Unglaublich stark.', { n: totalWorkouts }));
    else if (totalWorkouts % 50 === 0) setMilestoneMsg(t('{n}. Training! Absolute Konstanz.', { n: totalWorkouts }));
    else if (totalWorkouts % 10 === 0) setMilestoneMsg(t('{n}. Training! Weiter so.', { n: totalWorkouts }));
    else setMilestoneMsg(null);
    haptic.success();
    setCelebrate(true);
    const doneComp: WorkoutCompletion = { id: completionId, client_id: profile.id, plan_day_id: planDayId, completed_at: completedAt, duration_sec: durationSec, gym, title, exercise_notes: queued.exercise_notes };
    const sessionLogs: ExerciseSetLog[] = baseLogs.map((l) => ({ ...l, client_id: profile.id, workout_completion_id: completionId, created_at: completedAt }));
    const muscleByName = new Map((lib ?? []).map((e) => [e.name, e.muscle_group]));
    setFinished({
      summary: summarizeSession(doneComp, sessionLogs, title ?? day.workout_name ?? t('Training'), (n) => muscleByName.get(n) ?? guessMuscle(n) ?? 'Sonstige'),
      all: [...completions, doneComp],
    });
    setTimeout(() => setCelebrate(false), 2800);
    const original = planExercises.current.get(day.id);
    const shape = (xs: Exercise[] | undefined) => JSON.stringify((xs ?? []).map((e) => [e.name, e.sets ?? 1]));
    if (profile.can_edit_plan && !day.is_free && original && shape(original) !== shape(day.exercises)) {
      setPlanSaveError(null);
      setPlanSaveOffer({ dayId: day.id, exercises: day.exercises });
    }
    stopTraining();

    // Upload (a flush already running may have started before this workout was queued).
    await flushOutbox().catch(() => 0);
    if (outbox().some((q) => q.localId === completionId)) await flushOutbox().catch(() => 0);
    const left = outbox().find((q) => q.localId === completionId);
    if (left?.lastError) {
      setSaveError(t('Dein Training ist auf dem Handy gespeichert, der Upload ist fehlgeschlagen ({msg}). ADLR versucht es automatisch erneut.', { msg: left.lastError }));
    }
    // Recompute the consistency streak (consecutive calendar days with a completed
    // workout) from scratch each time — self-healing, no separate reset job needed:
    // a gap in training history naturally shortens it next time this runs.
    const doneDateKeys = new Set(completions.map((c) => localDateKey(c.completed_at)));
    doneDateKeys.add(localDateKey(new Date()));
    let streak = 0;
    const cursor = new Date();
    while (doneDateKeys.has(localDateKey(cursor))) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    }
    if (!left && streak !== profile.streak) {
      await supabase.from('profiles').update({ streak }).eq('id', profile.id);
      await refreshProfile();
    }
    await load();
  };

  const updateSetInput = (exerciseName: string, setIdx: number, field: 'weight' | 'reps' | 'min' | 'km', value: string) => {
    setSetInputs((prev) => {
      const arr = [...(prev[exerciseName] ?? [])];
      if (!arr[setIdx]) arr[setIdx] = { weight: '', reps: '', type: 'working' };
      arr[setIdx] = { ...arr[setIdx], [field]: value };
      return { ...prev, [exerciseName]: arr };
    });
  };

  const cycleSetType = (exerciseName: string, setIdx: number) => {
    setSetInputs((prev) => {
      const arr = [...(prev[exerciseName] ?? [])];
      if (!arr[setIdx]) arr[setIdx] = { weight: '', reps: '', type: 'working' };
      const cur = arr[setIdx].type ?? 'working';
      const next = SET_TYPE_CYCLE[(SET_TYPE_CYCLE.indexOf(cur) + 1) % SET_TYPE_CYCLE.length];
      arr[setIdx] = { ...arr[setIdx], type: next };
      return { ...prev, [exerciseName]: arr };
    });
  };

  // Checking a set off also starts the rest timer automatically (for every set, not
  // just the exercise's last one) — no separate button tap needed.
  const toggleSetCheck = (ex: Exercise, setIdx: number) => {
    if (activeDayIdx === null) return;
    unlockRestAlarm();
    const key = setKey(ex.name, setIdx);
    const wasChecked = checkedSets.has(key);
    setCheckedSets((prev) => {
      const next = new Set(prev);
      if (wasChecked) next.delete(key);
      else next.add(key);
      return next;
    });
    if (!wasChecked) {
      const rest = restPrefs.auto ? restFor(ex) : 0;
      if (rest > 0) {
        setRestTotal(rest);
        setRestEndAt(Date.now() + rest * 1000);
      } else {
        setRestEndAt(null);
      }
    }
  };

  // Leading checkbox on the exercise row: toggles all of its sets together (all done
  // -> all undone, otherwise -> all done), as a shortcut alongside per-set checking.
  const toggleAllSetsForExercise = (exerciseName: string, totalSets: number) => {
    if (activeDayIdx === null) return;
    setCheckedSets((prev) => {
      const next = new Set(prev);
      const allChecked = Array.from({ length: totalSets }, (_, i) => setKey(exerciseName, i)).every((k) => next.has(k));
      for (let i = 0; i < totalSets; i++) {
        const k = setKey(exerciseName, i);
        if (allChecked) next.delete(k);
        else next.add(k);
      }
      return next;
    });
  };

  // Activate the shared beginner starter plan (until the trainer assigns a personal one)
  const activateStarter = async () => {
    if (!profile || starterBusy) return;
    setStarterBusy(true);
    const { data: sp } = await supabase.from('plans').select('id').eq('is_starter', true).limit(1).maybeSingle();
    if (sp) {
      await supabase.from('client_plans').update({ is_active: false }).eq('client_id', profile.id);
      await supabase.from('client_plans').upsert(
        { client_id: profile.id, plan_id: sp.id, is_active: true },
        { onConflict: 'client_id,plan_id' },
      );
      await load();
    }
    setStarterBusy(false);
  };

  if (loading) return <Loading />;
  if (days.length === 0) {
    return (
      <div className="adlr-fade-in">
        <SectionHeader title={t('Mein Plan')} />
        <EmptyState title={t('Dein Plan wird vorbereitet.')} subtitle={t('{coach} ist am Werk. Du trainierst, sobald dein Plan bereit ist.', { coach })} />
        <div className="adlr-card p-5 mt-4 adlr-gold-border" style={{ background: 'linear-gradient(135deg, rgb(var(--adlr-gold) / 0.12), rgb(var(--adlr-gold) / 0.03))' }}>
          <p className="text-sm font-semibold text-white mb-1">{t('Schon mal loslegen? 💪')}</p>
          <p className="text-xs text-white/60 mb-4 leading-relaxed">{t('Starte mit dem Ganzkörper-Starter-Plan (3 Tage). Sobald {coach} deinen persönlichen Plan fertig hat, wird er automatisch aktiv.', { coach })}</p>
          <button
            onClick={activateStarter}
            disabled={starterBusy}
            className="adlr-tap w-full py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
            style={{ background: 'rgb(var(--adlr-gold))', color: '#000' }}
          >
            {starterBusy ? '…' : <><Dumbbell size={16} /> {t('Starter-Plan starten')}</>}
          </button>
        </div>
        <button
          onClick={() => requestStart(() => startFreeTraining())}
          className="adlr-tap w-full mt-3 px-4 py-3.5 rounded-2xl flex items-center gap-3 text-left border border-dashed"
          style={{ borderColor: 'rgb(var(--text) / 0.15)', background: 'rgb(var(--text) / 0.02)' }}
        >
          <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 bg-white/5 text-adlr-gold"><Shuffle size={19} /></div>
          <div className="min-w-0">
            <p className="text-base font-semibold text-white/90">{t('Freies Training')}</p>
            <p className="text-xs text-white/45">{t('Außerhalb des Plans — Übungen selbst wählen')}</p>
          </div>
        </button>
      </div>
    );
  }

  const weekDateForDay = (dayOfWeek: number) => {
    const now = new Date();
    const currentDay = now.getDay() === 0 ? 6 : now.getDay() - 1;
    const date = new Date(now);
    date.setDate(now.getDate() - currentDay + dayOfWeek);
    return localDateKey(date);
  };
  const weekStartKey = weekDateForDay(0);
  const weekEndKey = weekDateForDay(6);
  // A plan day counts as done this week if it was completed on ANY day within the
  // current week — so doing Monday's plan on Tuesday still counts Monday's slot.
  const planDayDoneThisWeek = (dayId: string) =>
    completions.some((c) => {
      if (c.plan_day_id !== dayId) return false;
      const k = localDateKey(c.completed_at);
      return k >= weekStartKey && k <= weekEndKey;
    });
  const plannedDays = days.filter((day) => !day.is_rest_day && !day.is_free);
  // Weekly TARGET = number of training days in the plan; every logged training this
  // week counts (extra sessions too), independent of which plan day it was.
  const completedThisWeek = completions.filter((c) => {
    const k = localDateKey(c.completed_at);
    return k >= weekStartKey && k <= weekEndKey;
  }).length;
  const doneAt = completions.map((c) => c.completed_at);
  const weekStreak = weeklyStreak(doneAt, plannedDays.length, frozen.weeks);
  // Streak saver: how much is missing this week, can it still be reached, can a freeze help?
  const missingThisWeek = Math.max(0, plannedDays.length - completedThisWeek);
  const daysLeftThisWeek = 7 - ((new Date().getDay() + 6) % 7); // incl. today
  const thisMonday = mondayKey(new Date());
  const lastMonday = (() => { const d = new Date(); d.setDate(d.getDate() - 7); return mondayKey(d); })();
  const thisWeekFrozen = frozen.weeks.has(thisMonday);
  const weekUnreachable = missingThisWeek > daysLeftThisWeek;
  const reviveStreak = !frozen.usedThisMonth && !frozen.weeks.has(lastMonday) && plannedDays.length > 0
    ? weeklyStreak(doneAt, plannedDays.length, new Set([...frozen.weeks, lastMonday])) : 0;
  const canRevive = reviveStreak > weekStreak;
  const freezeWeek = async (week: string) => {
    const err = await applyStreakFreeze(week);
    if (err) { setFreezeMsg(err); return; }
    setFreezeMsg(null);
    if (profile) setFrozen(await loadFrozenWeeks(profile.id));
  };
  const pickGym = (g: string | null) => {
    setGymSheet(false);
    setAddingGym(false);
    if (gymStart) {
      const { run } = gymStart;
      setGymStart(null);
      setGym(g);
      run(g);
    } else {
      changeGym(g);
    }
  };
  const addGym = () => {
    const name = newGym.trim();
    if (!name) return;
    const next = [...new Set([...savedGyms, name])];
    setSavedGyms(next); writeLS(GYMS_KEY, next);
    setNewGym('');
    pickGym(name);
  };
  const weeklyProgress = plannedDays.length > 0 ? Math.min(100, (completedThisWeek / plannedDays.length) * 100) : 0;
  // Flexible rotation, not a calendar weekday: sequential "Trainingstag N" labels
  // (rest days keep their own label), and a single "Als nächstes" recommendation —
  // the earliest not-yet-done-this-week training day — instead of a rigid "Heute".
  let trainingDayCounter = 0;
  const dayLabels = new Map<string, string>();
  for (const d of days) {
    if (d.is_rest_day || d.is_free) continue;
    trainingDayCounter++;
    dayLabels.set(d.id, t('Trainingstag {n}', { n: trainingDayCounter }));
  }
  // Rotation: recommend the plan day after the most recently completed one (wraps
  // around), so a 3-day plan simply continues 1→2→3→1… regardless of the calendar.
  const lastDone = completions
    .filter((c) => plannedDays.some((d) => d.id === c.plan_day_id))
    .reduce<typeof completions[number] | null>((a, c) => (!a || c.completed_at > a.completed_at ? c : a), null);
  const lastIdx = lastDone ? plannedDays.findIndex((d) => d.id === lastDone.plan_day_id) : -1;
  const nextRecommendedDayId = plannedDays.length > 0 ? plannedDays[(lastIdx + 1) % plannedDays.length].id : null;

  return (
    <div className="adlr-fade-in">
      {celebrate && <Celebration count={milestoneMsg ? 120 : 56} />}
      <div className="flex items-start justify-between gap-3">
        <SectionHeader title={t('Mein Plan')} subtitle={t('Diese Woche')} />
        {activeDayIdx === null && (
          <button
            onClick={() => setGymSheet(true)}
            className="adlr-tap mt-1 shrink-0 max-w-[45%] flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium border"
            style={gym ? { borderColor: 'rgb(var(--adlr-gold) / 0.4)', color: 'rgb(var(--adlr-gold))' } : { borderColor: 'rgb(var(--text) / 0.12)', color: 'rgb(var(--text) / 0.5)' }}
            aria-label={t('Studio wählen')}
          >
            <MapPin size={13} className="shrink-0" />
            <span className="truncate">{gym ?? t('Studio')}</span>
          </button>
        )}
      </div>

      {/* Active training banner: elapsed time, Studio (tap to change) and — while resting — the
          rest timer. Sticky right below the app header; one opaque card, so it never floats over
          inputs or buttons. */}
      {activeDayIdx !== null && (
        <div className="sticky z-30 mb-4 adlr-fade-in" style={{ top: 'calc(env(safe-area-inset-top) + 64px)' }}>
          <div
            className="rounded-2xl adlr-gold-border shadow-2xl"
            style={{ background: 'linear-gradient(135deg, rgb(var(--adlr-gold) / 0.20), rgb(var(--adlr-gold) / 0.06)), rgb(var(--adlr-anthracite))' }}
          >
            <div className="flex items-center gap-3 px-4 py-2.5">
              <span className="relative flex h-3 w-3 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-adlr-gold opacity-60" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-adlr-gold" />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white truncate">{t(days[activeDayIdx]?.workout_name ?? 'Training')}</p>
                <button
                  onClick={() => { setGymStart(null); setGymSheet(true); }}
                  className="adlr-tap flex items-center gap-1 text-xs max-w-full"
                  style={{ color: gym ? 'rgb(var(--text) / 0.6)' : 'rgb(var(--adlr-gold) / 0.85)' }}
                  aria-label={t('Studio wählen')}
                >
                  <MapPin size={11} className="shrink-0" />
                  <span className="truncate">{gym ?? t('Studio wählen')}</span>
                  <ChevronDown size={11} className="shrink-0" />
                </button>
              </div>
              <span className={`font-bold tabular-nums ${restLeft !== null ? 'text-base text-white/60' : 'text-2xl text-adlr-gold'}`}>
                {String(Math.floor(trainingElapsed / 60)).padStart(2, '0')}:{String(trainingElapsed % 60).padStart(2, '0')}
              </span>
            </div>
            {restLeft !== null && (() => {
              const day = days[activeDayIdx];
              const next = day ? buildSteps(day, checkedSets, setInputs)[0] : undefined;
              return (
                <div className="px-4 pb-3 pt-2.5 adlr-fade-in" style={{ borderTop: '1px solid rgb(var(--adlr-gold) / 0.25)' }}>
                  <div className="flex items-center gap-2">
                    <Timer size={17} className="text-adlr-gold shrink-0" />
                    <p className="flex-1 text-2xl font-bold text-adlr-gold tabular-nums leading-none">{Math.floor(restLeft / 60)}:{String(restLeft % 60).padStart(2, '0')}</p>
                    <button onClick={() => adjustRest(-15)} className="adlr-tap w-11 h-8 rounded-lg text-xs font-semibold" style={{ background: 'rgb(var(--text) / 0.07)', color: 'rgb(var(--text) / 0.75)' }} aria-label={t('15 Sekunden weniger')}>−15</button>
                    <button onClick={() => adjustRest(15)} className="adlr-tap w-11 h-8 rounded-lg text-xs font-semibold" style={{ background: 'rgb(var(--adlr-gold) / 0.18)', color: 'rgb(var(--adlr-gold))' }} aria-label={t('15 Sekunden mehr')}>+15</button>
                    <button onClick={stopRestTimer} className="adlr-tap w-9 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgb(var(--text) / 0.07)', color: 'rgb(var(--text) / 0.6)' }} aria-label={t('Pause überspringen')}>
                      <SkipForward size={14} />
                    </button>
                  </div>
                  <div className="h-1 rounded-full bg-white/10 mt-2 overflow-hidden">
                    <div className="h-full bg-adlr-gold transition-all duration-300 ease-linear" style={{ width: `${restTotal > 0 ? Math.min(100, (restLeft / restTotal) * 100) : 0}%` }} />
                  </div>
                  {next && <p className="text-xs text-white/55 mt-1.5 truncate">{t('Als Nächstes')}: <span className="text-white/85">{next.title}</span> · {next.body}</p>}
                  {notifPermissionDenied && <p className="text-[11px] text-white/40 mt-1.5 leading-snug">{t('Aktiviere Benachrichtigungen in den Einstellungen, damit Pause und nächster Satz auf dem Sperrbildschirm erscheinen.')}</p>}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {(offline || queuedCount > 0) && (
        <div className="flex items-center gap-2 rounded-xl px-3 py-2 mb-4 text-xs" style={{ background: 'rgb(var(--text) / 0.05)', color: 'rgb(var(--text) / 0.6)' }}>
          <CloudOff size={14} className="shrink-0" />
          <span>
            {offline ? t('Offline — du kannst trotzdem trainieren.') : null}
            {queuedCount > 0 ? ` ${t(queuedCount === 1 ? '1 Training wird synchronisiert, sobald du online bist.' : '{n} Trainings werden synchronisiert, sobald du online bist.', { n: queuedCount })}` : null}
          </span>
        </div>
      )}

      {activeDayIdx === null && profile && <WeeklyCheckinCard clientId={profile.id} lastWeight={profile.weight_kg ?? null} />}

      {/* Guided first workout: intro card before, one-tip-at-a-time during */}
      {activeDayIdx !== null && completions.length === 0 && <FirstWorkoutTips />}
      {activeDayIdx === null && completions.length === 0 && nextRecommendedDayId && (() => {
        const idx = days.findIndex((d) => d.id === nextRecommendedDayId);
        return <FirstWorkoutIntro dayName={t(days[idx]?.workout_name ?? 'Training')} onStart={() => requestStart((g) => startTraining(idx, g))} />;
      })()}

      {saveError && (
        <div className="mb-4 rounded-2xl px-4 py-3 flex items-start gap-3 adlr-fade-in" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.35)' }}>
          <p className="flex-1 text-sm text-red-300">{saveError}</p>
          <button onClick={() => setSaveError(null)} className="adlr-tap p-1 text-red-300/70" aria-label={t('Schließen')}><X size={16} /></button>
        </div>
      )}

      {activeDayIdx === null && recap && !recapSeen && (
        <button
          onClick={() => setRecapOpen({ startIdx: null })}
          className="adlr-tap w-full flex items-center gap-3 rounded-2xl px-4 py-3.5 mb-5 adlr-gold-border text-left"
          style={{ background: 'linear-gradient(135deg, rgb(var(--adlr-gold) / 0.18), rgb(var(--adlr-gold) / 0.05))' }}
        >
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-semibold text-white">{t('Deine Woche ist da 💪')}</span>
            <span className="block text-xs text-white/55">{t('Dein Rückblick auf letzte Woche — Rekorde, Alltag, Worte deines Coaches.')}</span>
          </span>
          <ChevronRight size={18} className="text-adlr-gold shrink-0" />
        </button>
      )}

      {/* Upcoming PT sessions with the trainer */}
      {activeDayIdx === null && sessions.length > 0 && (
        <div className="adlr-card p-4 mb-5">
          <div className="flex items-center gap-2 mb-3">
            <Calendar size={16} className="text-adlr-gold" />
            <p className="text-sm font-medium text-white/80">{t('Nächste Termine')}</p>
          </div>
          <div className="space-y-2">
            {sessions.slice(0, 3).map((s) => {
              const d = new Date(s.scheduled_at);
              return (
                <div key={s.id} className="flex items-center gap-3 rounded-xl px-3 py-2.5" style={{ background: 'rgb(var(--text) / 0.03)', border: '1px solid rgb(var(--text) / 0.07)' }}>
                  <div className="flex flex-col items-center justify-center w-11 shrink-0">
                    <span className="text-[10px] uppercase tracking-wide text-adlr-gold/70">{fmtDate(d, { weekday: 'short' })}</span>
                    <span className="text-lg font-bold text-white leading-none">{d.getDate()}</span>
                    <span className="text-[10px] text-white/40">{fmtDate(d, { month: 'short' })}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white flex items-center gap-1.5"><Clock size={12} className="text-adlr-gold" /> {fmtTime(d)} · {s.duration_min} {t('Min')}</p>
                    <p className="text-xs text-white/40 flex items-center gap-1.5 mt-0.5"><MapPin size={11} /> {t(s.location)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeDayIdx === null && (
        <div className="adlr-card p-4 mb-4">
          <div className="flex items-end justify-between gap-3 mb-2.5">
            <div>
              <p className="text-[11px] uppercase tracking-wider text-white/40">{t('Wochenziel')}</p>
              <p className="text-xl font-bold text-white leading-tight mt-0.5">{t('{n}/{total} Trainings', { n: completedThisWeek, total: plannedDays.length })}</p>
            </div>
            {weekStreak > 0 && (
              <div className="flex items-center gap-1.5 rounded-xl px-2.5 py-1.5" style={{ background: 'rgb(var(--adlr-gold) / 0.12)' }}>
                <Flame size={15} className="text-adlr-gold" />
                <span className="text-xs font-semibold text-adlr-gold">{weekStreak === 1 ? t('1 Woche in Folge') : t('{n} Wochen in Folge', { n: weekStreak })}</span>
              </div>
            )}
          </div>
          <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full rounded-full bg-adlr-gold transition-all duration-500" style={{ width: `${weeklyProgress}%` }} />
          </div>
          {thisWeekFrozen && missingThisWeek > 0 ? (
            <p className="text-xs text-white/55 mt-2.5 flex items-center gap-1.5"><ShieldCheck size={13} className="text-adlr-gold" /> {t('Diese Woche ist geschützt — deine Serie bleibt.')}</p>
          ) : weekStreak > 0 && missingThisWeek > 0 && weekUnreachable ? (
            <div className="mt-3 rounded-xl p-3" style={{ background: 'rgb(var(--adlr-gold) / 0.08)', border: '1px solid rgb(var(--adlr-gold) / 0.25)' }}>
              <p className="text-xs text-white/75 leading-relaxed">{t('Diese Woche wird zu knapp. Schütze deine Serie von {n} Wochen — einmal pro Monat möglich.', { n: weekStreak })}</p>
              <button onClick={() => freezeWeek(thisMonday)} disabled={frozen.usedThisMonth} className="adlr-tap mt-2 text-xs font-semibold text-adlr-gold flex items-center gap-1.5 disabled:opacity-40">
                <ShieldCheck size={13} /> {frozen.usedThisMonth ? t('Diesen Monat schon verwendet.') : t('Serie schützen')}
              </button>
            </div>
          ) : weekStreak > 0 && missingThisWeek > 0 && missingThisWeek >= daysLeftThisWeek - 1 ? (
            <p className="text-xs text-white/55 mt-2.5">{t(missingThisWeek === 1 ? 'Noch 1 Training bis Sonntag, um deine Serie zu halten.' : 'Noch {n} Trainings bis Sonntag, um deine Serie zu halten.', { n: missingThisWeek })}</p>
          ) : null}
          {canRevive && (
            <div className="mt-3 rounded-xl p-3" style={{ background: 'rgb(var(--adlr-gold) / 0.08)', border: '1px solid rgb(var(--adlr-gold) / 0.25)' }}>
              <p className="text-xs text-white/75 leading-relaxed">{t('Letzte Woche hat nicht gereicht. Rette deine Serie von {n} Wochen mit deinem Monats-Schutz.', { n: reviveStreak })}</p>
              <button onClick={() => freezeWeek(lastMonday)} className="adlr-tap mt-2 text-xs font-semibold text-adlr-gold flex items-center gap-1.5">
                <ShieldCheck size={13} /> {t('Serie retten')}
              </button>
            </div>
          )}
          {freezeMsg && <p className="text-xs text-red-400 mt-2">{freezeMsg}</p>}
          <button
            onClick={() => nav('/app/verlauf')}
            className="adlr-tap w-full mt-3.5 pt-3 flex items-center justify-between text-sm"
            style={{ borderTop: '1px solid rgb(var(--text) / 0.07)' }}
          >
            <span className="flex items-center gap-2 text-white/80"><History size={15} className="text-adlr-gold" /> {t('Trainings-Verlauf')}</span>
            <span className="flex items-center gap-1 text-xs text-white/40">{t('{n} gesamt', { n: completions.length })} <ChevronRight size={14} /></span>
          </button>
          <button
            onClick={() => requestStart(() => startFreeTraining())}
            className="adlr-tap w-full mt-3 pt-3 flex items-center justify-between text-sm"
            style={{ borderTop: '1px solid rgb(var(--text) / 0.07)' }}
          >
            <span className="flex items-center gap-2 text-white/80"><Shuffle size={15} className="text-adlr-gold" /> {t('Freies Training')}</span>
            <span className="flex items-center gap-1 text-xs text-white/40">{t('außerhalb des Plans')} <ChevronRight size={14} /></span>
          </button>
        </div>
      )}

      <div className="space-y-2.5 adlr-stagger">
        {days.map((day, idx) => {
          if (activeDayIdx !== null && idx !== activeDayIdx) return null;
          const isOpen = expanded === idx || activeDayIdx === idx;
          const isNext = day.id === nextRecommendedDayId;
          const completed = !day.is_rest_day && planDayDoneThisWeek(day.id);
          const isTrainingThisDay = activeDayIdx === idx;
          const totalSetsForDay = day.exercises?.reduce((sum, ex) => sum + (ex.sets ?? 1), 0) ?? 0;
          const allExercisesChecked = totalSetsForDay > 0 && checkedSets.size >= totalSetsForDay;
          const workoutLabel = day.workout_name ?? 'Training';
          const isCardio = /cardio|zone\s*2|laufen|lauf/i.test(workoutLabel);
          const DayIcon = day.is_rest_day ? Moon : isCardio ? Footprints : Dumbbell;
          return (
            <div
              key={day.id}
              className={`adlr-card overflow-hidden transition-all ${isNext ? 'ring-2 ring-adlr-gold bg-adlr-gold/10' : ''} ${completed ? 'ring-1 ring-green-500/30' : ''}`}
            >
              <button
                onClick={() => setExpanded(isOpen ? null : idx)}
                className="w-full px-4 py-3.5 text-left flex items-center justify-between"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 transition-colors ${isNext ? 'bg-adlr-gold text-black' : 'bg-white/5 text-white/50'}`}>
                    <DayIcon size={20} strokeWidth={1.8} />
                  </div>
                  <div className="min-w-0">
                    {!day.is_rest_day && (
                      <div className="flex items-center gap-1.5">
                        <p className={`text-sm font-medium ${isNext ? 'text-adlr-gold' : 'text-white/60'}`}>{dayLabels.get(day.id)}</p>
                        {isNext && <span className="text-xs text-adlr-gold font-medium">· {t('Als Nächstes dran')}</span>}
                      </div>
                    )}
                    <p className={`text-base font-semibold truncate ${isNext ? 'text-white' : 'text-white/90'}`}>{day.is_rest_day ? t('Ruhetag') : t(workoutLabel)}</p>
                  </div>
                </div>
                {!day.is_rest_day && (
                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    {completed ? (
                      <span className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center text-white">
                        <Check size={15} strokeWidth={3} />
                      </span>
                    ) : (
                      <CircleDashed size={21} className="text-white/25" />
                    )}
                    <ChevronDown size={17} className={`text-white/30 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  </div>
                )}
              </button>
              {isOpen && !day.is_rest_day && (
                <div className="px-5 pb-5 adlr-fade-in">
                  <div className="flex gap-4 mb-4 text-xs text-white/40">
                    {day.duration_min && <span className="flex items-center gap-1"><Clock size={12} /> {day.duration_min} {t('Min')}</span>}
                  </div>

                  {/* Free workout: give it a name (saved as the workout's title) */}
                  {day.is_free && isTrainingThisDay && (
                    nameEditing ? (
                      <input
                        autoFocus
                        value={day.workout_name === 'Freies Training' ? '' : day.workout_name ?? ''}
                        onChange={(e) => { const v = e.target.value.slice(0, 60); setDays((prev) => prev.map((d) => (d.id === day.id ? { ...d, workout_name: v || 'Freies Training' } : d))); }}
                        onBlur={() => setNameEditing(false)}
                        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                        placeholder={t('z.B. Push Day, Beine, Oberkörper')}
                        className="w-full mb-4 bg-inset border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-white/25 outline-none"
                      />
                    ) : (
                      <button onClick={() => setNameEditing(true)} className="adlr-tap mb-4 flex items-center gap-1.5 text-xs text-adlr-gold/85">
                        <Pencil size={12} /> {day.workout_name && day.workout_name !== 'Freies Training' ? t('Name ändern') : t('Training benennen')}
                      </button>
                    )
                  )}

                  {/* Training session controls */}
                  {(
                    <div className="mb-4">
                      {isTrainingThisDay ? (
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              const open = (day.exercises ?? [])
                                .map((ex) => ({ name: ex.name, missing: Array.from({ length: ex.sets ?? 1 }, (_, si) => checkedSets.has(setKey(ex.name, si))).filter((c) => !c).length }))
                                .filter((o) => o.missing > 0);
                              if (open.length > 0) setConfirm({ kind: 'finish', dayIdx: idx, open });
                              else finishTraining(idx);
                            }}
                            disabled={finishing}
                            className={`adlr-tap flex-1 py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all ${
                              allExercisesChecked
                                ? 'bg-green-500 text-white'
                                : 'bg-adlr-gold text-black'
                            }`}
                          >
                            <Check size={16} /> {allExercisesChecked ? t('Training abgeschlossen') : t('Training beenden')}
                          </button>
                          <button
                            onClick={() => setConfirm({ kind: 'cancel' })}
                            className="adlr-tap px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white/50 text-sm flex items-center justify-center gap-1.5"
                          >
                            <Square size={14} /> {t('Abbrechen')}
                          </button>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <button
                            onClick={() => (recap && !recapSeen ? setRecapOpen({ startIdx: idx }) : requestStart((g) => startTraining(idx, g)))}
                            className="adlr-tap flex-1 py-3.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2"
                            style={{ background: 'linear-gradient(135deg, rgb(var(--adlr-gold)), rgb(var(--adlr-gold-dim)))', color: '#000' }}
                          >
                            <Dumbbell size={16} /> {completed ? t('Nochmal trainieren') : t('Training starten')}
                          </button>
                          {profile?.can_edit_plan && !day.is_free && activeDayIdx === null && (
                            <button
                              onClick={() => setEditingDay(day)}
                              className="adlr-tap px-4 rounded-xl bg-white/5 border border-white/10 text-white/70 text-sm flex items-center justify-center gap-1.5"
                              aria-label={t('Tag bearbeiten')}
                            >
                              <Pencil size={15} /> {t('Bearbeiten')}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {day.exercises && day.exercises.length > 0 ? (
                    <div className="space-y-2 mb-4">
                      {day.exercises.map((ex, i) => {
                        const last = getLastSessionLogs(ex.name);
                        const lastLogs = last.logs;
                        const exSets = ex.sets ?? 1;
                        const isChecked = Array.from({ length: exSets }, (_, si) => checkedSets.has(setKey(ex.name, si))).every(Boolean);
                        const isTraining = isTrainingThisDay;
                        const inputs = setInputs[ex.name] ?? [];
                        const hasLastData = lastLogs.length > 0;
                        const prescribed = effectiveSets(ex);
                        const vary = setsVary(prescribed);
                        return (
                          <div key={i} className={`rounded-xl p-3 transition-all ${isChecked ? 'bg-green-500/5 border border-green-500/20' : 'border border-white/5'}`}>
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-start gap-2.5 flex-1 min-w-0">
                                {/* Checkbox — shortcut to check/uncheck all of this exercise's sets at once */}
                                <button
                                  onClick={() => isTraining && toggleAllSetsForExercise(ex.name, exSets)}
                                  disabled={!isTraining}
                                  className={`adlr-tap shrink-0 mt-0.5 w-6 h-6 rounded-md border flex items-center justify-center transition-all ${
                                    isTraining
                                      ? isChecked
                                        ? 'bg-green-500 border-green-500'
                                        : 'border-white/30 hover:border-adlr-gold'
                                      : 'border-white/10 opacity-40'
                                  }`}
                                >
                                  {isChecked && <Check size={14} className="text-white" />}
                                </button>
                                <div className="flex-1 min-w-0">
                                  <p className={`text-sm font-medium ${isChecked ? 'text-white/60 line-through' : 'text-white/90'}`}>{t(ex.name)}</p>
                                  <p className="text-xs text-white/40 mt-0.5">
                                    {ex.sets && t('{n} Sätze', { n: ex.sets })}
                                    {!vary && prescribed[0]?.reps ? ` · ${prescribed[0].reps} ${t('Wdh')}` : ''}
                                    {!vary && prescribed[0]?.weight_kg ? <span className="text-adlr-gold/70"> · {prescribed[0].weight_kg} kg</span> : ''}
                                    {!isTraining && restFor(ex) > 0 ? ` · ${t('{n}s Pause', { n: restFor(ex) })}` : ''}
                                  </p>
                                  {isTraining && (
                                    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                                      <button
                                        onClick={() => setRestSheet(ex)}
                                        className="adlr-tap inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium"
                                        style={{ background: 'rgb(var(--text) / 0.05)', color: restPrefs.auto && restFor(ex) > 0 ? 'rgb(var(--text) / 0.65)' : 'rgb(var(--text) / 0.35)' }}
                                        aria-label={t('Pausenzeit ändern')}
                                      >
                                        <Timer size={11} /> {restPrefs.auto && restFor(ex) > 0 ? fmtRest(restFor(ex)) : t('Pause aus')}
                                      </button>
                                      {!exNotes[ex.name] && noteEditing !== ex.name && (
                                        <button
                                          onClick={() => setNoteEditing(ex.name)}
                                          className="adlr-tap inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium"
                                          style={{ background: 'rgb(var(--text) / 0.05)', color: 'rgb(var(--text) / 0.45)' }}
                                        >
                                          <StickyNote size={11} /> {t('Notiz')}
                                        </button>
                                      )}
                                    </div>
                                  )}
                                  {/* Own note for this exercise: compact one-liner, tap to edit. The latest
                                      note from earlier sessions shows dimmed (e.g. seat settings) until replaced. */}
                                  {(() => {
                                    const mine = exNotes[ex.name];
                                    if (isTraining && noteEditing === ex.name) {
                                      return (
                                        <textarea
                                          autoFocus
                                          rows={2}
                                          maxLength={200}
                                          value={mine ?? ''}
                                          onChange={(e) => setExNotes((p) => ({ ...p, [ex.name]: e.target.value }))}
                                          onBlur={() => { setNoteEditing(null); setExNotes((p) => { const n = { ...p }; if (!n[ex.name]?.trim()) delete n[ex.name]; return n; }); }}
                                          placeholder={t('z.B. Sitz Stufe 4, Schulter zwickt …')}
                                          className="w-full mt-1.5 bg-inset border border-white/10 rounded-lg px-2.5 py-2 text-xs text-white placeholder-white/25 outline-none resize-none"
                                        />
                                      );
                                    }
                                    if (mine) {
                                      return (
                                        <button onClick={() => isTraining && setNoteEditing(ex.name)} className="adlr-tap mt-1.5 flex items-start gap-1 text-left text-xs text-adlr-gold/80 max-w-full">
                                          <StickyNote size={11} className="shrink-0 mt-0.5" /> <span className="line-clamp-2 break-words">{mine}</span>
                                        </button>
                                      );
                                    }
                                    const hint = lastNoteFor(ex.name);
                                    if (!hint) return null;
                                    return (
                                      <button
                                        onClick={() => { if (!isTraining) return; setExNotes((p) => ({ ...p, [ex.name]: hint })); setNoteEditing(ex.name); }}
                                        className="adlr-tap mt-1.5 flex items-start gap-1 text-left text-xs text-white/40 max-w-full"
                                      >
                                        <StickyNote size={11} className="shrink-0 mt-0.5" /> <span className="line-clamp-2 break-words italic">{hint}</span>
                                      </button>
                                    );
                                  })()}
                                  {vary && (
                                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                                      {prescribed.map((s, si) => (
                                        <span key={si} className="text-xs text-white/50">
                                          <span className="text-white/30">{si + 1}:</span>{' '}
                                          {s.weight_kg ? <span className="text-adlr-gold/70">{s.weight_kg}kg</span> : '—'} × {s.reps ?? '—'}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                  {ex.alternatives?.some((a) => a) && (
                                    <details className="mt-1.5">
                                      <summary className="text-xs text-adlr-gold/70 cursor-pointer flex items-center gap-1.5 list-none [&::-webkit-details-marker]:hidden">
                                        <Repeat size={12} /> {t('Alternativen')}
                                      </summary>
                                      <div className="mt-1.5 space-y-1 pl-1">
                                        {ex.alternatives.filter((a) => a).map((a, ai) => (
                                          <p key={ai} className="text-xs text-white/60 flex items-center gap-1.5">
                                            <span className="w-1 h-1 rounded-full bg-adlr-gold/50" /> {t(a)}
                                          </p>
                                        ))}
                                      </div>
                                    </details>
                                  )}
                                  {ex.notes && <p className="text-xs text-adlr-gold/60 mt-1">{ex.notes}</p>}
                                  {/* Last session data */}
                                  {hasLastData && (
                                    <p className="text-xs text-adlr-gold/70 mt-1.5">
                                      {t('Letztes Mal')}{last.otherGym ? (last.gym ? ` (${last.gym})` : ` (${t('anderes Studio')})`) : ''}: {lastLogs.map((l) => (cardioNames.has(ex.name) ? `${l.duration_sec ? Math.round(l.duration_sec / 60) : '—'} min${l.distance_km != null ? ` · ${l.distance_km} km` : ''}` : `${l.weight_kg ?? '—'} kg × ${l.reps ?? '—'} ${t('Wdh')}`)).join(' · ')}
                                    </p>
                                  )}
                                  {/* Set inputs during active training */}
                                  {isTraining && (
                                    <div className="mt-2.5 space-y-1.5">
                                      {Array.from({ length: exSets }, (_, setIdx) => {
                                        const setChecked = checkedSets.has(setKey(ex.name, setIdx));
                                        const setType = inputs[setIdx]?.type ?? 'working';
                                        return (
                                          <div key={setIdx} className={`flex items-center gap-2 rounded-lg px-1.5 py-1 -mx-1.5 transition-colors ${setChecked ? 'bg-green-500/10' : ''}`}>
                                            <button
                                              onClick={() => toggleSetCheck(ex, setIdx)}
                                              className={`adlr-tap shrink-0 w-5 h-5 rounded-md border flex items-center justify-center transition-all ${
                                                setChecked ? 'bg-green-500 border-green-500' : 'border-white/25 hover:border-adlr-gold'
                                              }`}
                                            >
                                              {setChecked && <Check size={11} className="text-white" />}
                                            </button>
                                            {/* Tap to cycle: Arbeitssatz -> Aufwärmen -> Dropset */}
                                            <button
                                              onClick={() => cycleSetType(ex.name, setIdx)}
                                              className={`adlr-tap shrink-0 w-9 text-center text-[10px] font-semibold rounded px-0.5 py-0.5 ${
                                                setType === 'warmup' ? 'text-amber-400' : setType === 'dropset' ? 'text-red-400' : setChecked ? 'text-white/50 line-through' : 'text-white/30'
                                              }`}
                                              title={t('Aufwärmen / Arbeitssatz / Dropset')}
                                            >
                                              {setType === 'working' ? t('Satz {n}', { n: setIdx + 1 }) : t(SET_TYPE_LABEL[setType])}
                                            </button>
                                            {cardioNames.has(ex.name) ? (
                                              <>
                                                <input
                                                  type="number"
                                                  inputMode="decimal"
                                                  value={inputs[setIdx]?.min ?? ''}
                                                  onChange={(e) => updateSetInput(ex.name, setIdx, 'min', e.target.value)}
                                                  placeholder={t('Min')}
                                                  className="w-14 bg-inset border border-white/10 rounded-md px-1.5 py-1.5 text-xs text-white placeholder-white/20 outline-none text-center"
                                                />
                                                <span className="text-xs text-white/30">·</span>
                                                <input
                                                  type="number"
                                                  inputMode="decimal"
                                                  value={inputs[setIdx]?.km ?? ''}
                                                  onChange={(e) => updateSetInput(ex.name, setIdx, 'km', e.target.value)}
                                                  placeholder="km"
                                                  className="w-14 bg-inset border border-white/10 rounded-md px-1.5 py-1.5 text-xs text-white placeholder-white/20 outline-none text-center"
                                                />
                                              </>
                                            ) : (
                                              <>
                                                <input
                                                  type="number"
                                                  value={inputs[setIdx]?.weight ?? ''}
                                                  onChange={(e) => updateSetInput(ex.name, setIdx, 'weight', e.target.value)}
                                                  placeholder="kg"
                                                  className="w-14 bg-inset border border-white/10 rounded-md px-1.5 py-1.5 text-xs text-white placeholder-white/20 outline-none text-center"
                                                />
                                                <span className="text-xs text-white/30">×</span>
                                                <input
                                                  type="number"
                                                  value={inputs[setIdx]?.reps ?? ''}
                                                  onChange={(e) => updateSetInput(ex.name, setIdx, 'reps', e.target.value)}
                                                  placeholder={t('Wdh')}
                                                  className="w-14 bg-inset border border-white/10 rounded-md px-1.5 py-1.5 text-xs text-white placeholder-white/20 outline-none text-center"
                                                />
                                              </>
                                            )}
                                            {isTraining && canEditSession(day) && (
                                              <button onClick={() => removeFreeSet(ex.name, setIdx)} className="adlr-tap ml-auto p-1 shrink-0 rounded-md text-white/30 hover:text-red-400" aria-label={t('Satz entfernen')}>
                                                <X size={14} />
                                              </button>
                                            )}
                                          </div>
                                        );
                                      })}
                                      {isTraining && canEditSession(day) && (
                                        <button onClick={() => addFreeSet(ex.name)} className="adlr-tap text-xs font-medium text-adlr-gold flex items-center gap-1 pt-1">
                                          <Plus size={13} /> {t('Satz hinzufügen')}
                                        </button>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                              {isTraining && canEditSession(day) && (
                                <button onClick={() => removeFreeExercise(ex.name)} className="adlr-tap shrink-0 ml-1 p-1 text-white/30 hover:text-red-400" aria-label={t('Übung entfernen')}>
                                  <Trash2 size={16} />
                                </button>
                              )}
                              {(() => { const r = libMap?.get(ex.name); return r && hasDemo(r) ? r : null; })() && (
                                <button onClick={() => setDemoEx(libMap!.get(ex.name)!)} className="adlr-tap shrink-0 ml-1" style={{ color: 'rgb(var(--adlr-gold))' }} title={t('Demo anzeigen')}>
                                  <Play size={16} />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-white/30 mb-4">{day.is_free ? t('Noch keine Übungen — füge deine erste hinzu.') : t('Keine Übungen hinterlegt.')}</p>
                  )}
                  {isTrainingThisDay && canEditSession(day) && (
                    <button
                      onClick={() => setPickerOpen(true)}
                      className="adlr-tap w-full mb-4 py-3 rounded-xl text-sm font-medium border border-dashed text-adlr-gold flex items-center justify-center gap-1.5"
                      style={{ borderColor: 'rgb(var(--adlr-gold) / 0.4)' }}
                    >
                      <Plus size={15} /> {t('Übung hinzufügen')}
                    </button>
                  )}
                  {day.notes && (
                    <div className="bg-adlr-gold/5 border border-adlr-gold/20 rounded-xl p-3 mb-4">
                      <p className="text-xs text-adlr-gold/80 uppercase tracking-wide mb-1">{t('Notiz von {coach}', { coach })}</p>
                      <p className="text-sm text-white/70">{day.notes}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {gymSheet && createPortal(
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/70 px-4 pb-6 adlr-fade-in" onClick={() => { setGymSheet(false); setAddingGym(false); setGymStart(null); }}>
          <div className="w-full max-w-md rounded-2xl p-5 bg-adlr-anthracite" style={{ border: '1px solid rgb(var(--text) / 0.1)' }} onClick={(e) => e.stopPropagation()}>
            <p className="text-base font-semibold text-white flex items-center gap-2"><MapPin size={16} className="text-adlr-gold" /> {gymStart ? t('Wo trainierst du heute?') : t('Studio')}</p>
            <p className="text-xs text-white/45 mt-1 mb-4">{t('Gerätegewichte werden pro Studio gemerkt — wähle, wo du heute trainierst.')}</p>
            <div className="space-y-1.5 mb-3">
              {[null, ...knownGyms].map((g) => (
                <button
                  key={g ?? '__none'}
                  onClick={() => pickGym(g)}
                  className="adlr-tap w-full flex items-center justify-between rounded-xl px-3.5 py-3 text-sm text-left"
                  style={gym === g ? { background: 'rgb(var(--adlr-gold) / 0.12)', color: 'rgb(var(--text))', border: '1px solid rgb(var(--adlr-gold) / 0.4)' } : { background: 'rgb(var(--text) / 0.04)', color: 'rgb(var(--text) / 0.8)', border: '1px solid transparent' }}
                >
                  <span className="truncate">{g ?? t('Kein bestimmtes Studio')}</span>
                  {gym === g && <Check size={16} className="text-adlr-gold shrink-0" />}
                </button>
              ))}
            </div>
            {addingGym ? (
              <div className="flex gap-1.5">
                <input
                  autoFocus
                  value={newGym}
                  onChange={(e) => setNewGym(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') addGym(); }}
                  placeholder={t('z.B. FitInn Mitte')}
                  className="flex-1 bg-inset border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-white/25 outline-none"
                />
                <button onClick={addGym} className="adlr-tap px-4 rounded-xl text-sm font-semibold" style={{ background: 'rgb(var(--adlr-gold))', color: '#000' }}>OK</button>
              </div>
            ) : (
              <button onClick={() => setAddingGym(true)} className="adlr-tap w-full py-2.5 rounded-xl text-sm font-medium border border-dashed text-adlr-gold flex items-center justify-center gap-1.5" style={{ borderColor: 'rgb(var(--adlr-gold) / 0.4)' }}>
                <Plus size={15} /> {t('Studio hinzufügen')}
              </button>
            )}
          </div>
        </div>,
        document.body
      )}
      {restSheet && createPortal(
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/70 px-4 pb-6 adlr-fade-in" onClick={() => setRestSheet(null)}>
          <div className="w-full max-w-md rounded-2xl p-5 bg-adlr-anthracite" style={{ border: '1px solid rgb(var(--text) / 0.1)' }} onClick={(e) => e.stopPropagation()}>
            <p className="text-base font-semibold text-white flex items-center gap-2"><Timer size={16} className="text-adlr-gold" /> {t('Pause')} · {t(restSheet.name)}</p>
            <p className="text-xs text-white/45 mt-1 mb-4">{t('Gilt ab jetzt für diese Übung auf diesem Handy.')}</p>
            <div className="grid grid-cols-4 gap-1.5 mb-3">
              {REST_OPTIONS.map((sec) => {
                const active = restFor(restSheet) === sec;
                return (
                  <button
                    key={sec}
                    onClick={() => { setRestPrefs({ ...restPrefs, overrides: { ...restPrefs.overrides, [restSheet.name]: sec } }); setRestSheet(null); haptic.light(); }}
                    className="adlr-tap py-2.5 rounded-xl text-sm font-medium tabular-nums"
                    style={active ? { background: 'rgb(var(--adlr-gold) / 0.16)', color: 'rgb(var(--adlr-gold))', border: '1px solid rgb(var(--adlr-gold) / 0.45)' } : { background: 'rgb(var(--text) / 0.04)', color: 'rgb(var(--text) / 0.8)', border: '1px solid transparent' }}
                  >
                    {sec === 0 ? t('Aus') : fmtRest(sec)}
                  </button>
                );
              })}
            </div>
            {restSheet.rest_sec != null && restSheet.name in restPrefs.overrides && (
              <button
                onClick={() => { const o = { ...restPrefs.overrides }; delete o[restSheet.name]; setRestPrefs({ ...restPrefs, overrides: o }); setRestSheet(null); }}
                className="adlr-tap w-full mb-3 py-2.5 rounded-xl text-sm text-adlr-gold border border-dashed"
                style={{ borderColor: 'rgb(var(--adlr-gold) / 0.4)' }}
              >
                {t('Wie im Plan ({t})', { t: fmtRest(restSheet.rest_sec) })}
              </button>
            )}
            <button
              onClick={() => { setRestPrefs({ ...restPrefs, auto: !restPrefs.auto }); if (restPrefs.auto) stopRestTimer(); }}
              className="adlr-tap w-full flex items-center justify-between rounded-xl px-3.5 py-3 text-sm text-left"
              style={{ background: 'rgb(var(--text) / 0.04)' }}
            >
              <span className="text-white/85">{t('Pausen-Timer automatisch starten')}</span>
              <span className="w-10 h-6 rounded-full relative transition-colors shrink-0" style={{ background: restPrefs.auto ? 'rgb(var(--adlr-gold))' : 'rgb(var(--text) / 0.15)' }}>
                <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all" style={{ left: restPrefs.auto ? '18px' : '2px' }} />
              </span>
            </button>
          </div>
        </div>,
        document.body
      )}
      {pickerOpen && createPortal(
        <div className="fixed inset-0 z-[65] flex flex-col bg-adlr-black adlr-fade-in" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
          <div className="max-w-md w-full mx-auto flex flex-col flex-1 min-h-0 px-4">
            <div className="flex items-center justify-between py-4">
              <p className="text-lg font-semibold text-white">{t('Übung hinzufügen')}</p>
              <button onClick={() => setPickerOpen(false)} className="adlr-tap px-4 py-2 rounded-xl text-sm font-semibold" style={{ background: 'rgb(var(--adlr-gold))', color: '#000' }}>
                {t('Fertig')}{(() => { const n = (activeDayIdx !== null ? days[activeDayIdx]?.exercises.length : 0) ?? 0; return n > 0 ? ` (${n})` : ''; })()}
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto pb-4">
              <ExerciseLibrary onAdd={addFreeExercise} onDemo={setDemoEx} canAdd />
            </div>
          </div>
        </div>,
        document.body
      )}
      {demoEx && <LibDemoModal ex={demoEx} onClose={() => setDemoEx(null)} />}
      {recap && recapOpen && (
        <WeeklyRecap
          data={recap}
          onClose={() => { markRecapSeen(); setRecapSeen(true); const i = recapOpen.startIdx; setRecapOpen(null); if (i !== null) requestStart((g) => startTraining(i, g)); }}
          onStart={() => { markRecapSeen(); setRecapSeen(true); const i = recapOpen.startIdx; setRecapOpen(null); if (i !== null) requestStart((g) => startTraining(i, g)); }}
        />
      )}
      {planSaveOffer && createPortal(
        <div className="fixed inset-0 z-[85] flex items-end sm:items-center justify-center bg-black/70 px-4 pb-6 adlr-fade-in">
          <div className="w-full max-w-md rounded-2xl p-5 bg-adlr-anthracite" style={{ border: '1px solid rgb(var(--text) / 0.1)' }}>
            <p className="text-base font-semibold text-white">{t('Änderungen in den Plan übernehmen?')}</p>
            <p className="text-sm text-white/55 mt-1 mb-4">{t('Du hast in diesem Training Übungen oder Sätze geändert. Sollen sie auch beim nächsten Mal so im Plan stehen?')}</p>
            {planSaveError && <p className="text-xs text-red-400 mb-3">{planSaveError}</p>}
            <div className="flex gap-2">
              <button
                disabled={planSaveBusy}
                onClick={async () => {
                  setPlanSaveBusy(true);
                  // same normalisation as the day editor: set count 1–20, per-set details trimmed to it
                  const payload = planSaveOffer.exercises.map((e) => {
                    const sets = Math.max(1, Math.min(20, Math.round(e.sets ?? 1)));
                    const out: Exercise = { ...e, sets };
                    if (out.set_details) out.set_details = out.set_details.slice(0, sets);
                    return out;
                  });
                  const { error } = await supabase.rpc('client_update_plan_day', { p_day_id: planSaveOffer.dayId, p_exercises: payload });
                  setPlanSaveBusy(false);
                  if (error) {
                    setPlanSaveError(/not_allowed/.test(error.message) ? t('Dein Coach hat die Bearbeitung nicht freigegeben.') : t('Speichern fehlgeschlagen. Bitte versuche es erneut.'));
                    return;
                  }
                  haptic.success();
                  setPlanSaveOffer(null);
                  load();
                }}
                className="adlr-tap flex-1 py-3 rounded-xl text-sm font-semibold disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, rgb(var(--adlr-gold)), rgb(var(--adlr-gold-dim)))', color: '#000' }}
              >
                {planSaveBusy ? '…' : t('Ja, im Plan speichern')}
              </button>
              <button onClick={() => setPlanSaveOffer(null)} className="adlr-tap flex-1 py-3 rounded-xl text-sm font-medium bg-white/5 border border-white/10 text-white/70">
                {t('Nein, nur heute')}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
      {editingDay && <ClientDayEditor day={editingDay} onClose={() => setEditingDay(null)} onSaved={() => { setEditingDay(null); load(); }} />}
      {confirm && createPortal(
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/70 px-4 pb-6 adlr-fade-in" onClick={() => setConfirm(null)}>
          <div className="w-full max-w-md rounded-2xl p-5 bg-adlr-anthracite" style={{ border: '1px solid rgb(var(--text) / 0.1)' }} onClick={(e) => e.stopPropagation()}>
            {confirm.kind === 'finish' ? (
              <>
                <p className="text-base font-semibold text-white">{t('Noch nicht alles abgehakt')}</p>
                <p className="text-sm text-white/55 mt-1 mb-3">
                  {t(confirm.open.length === 1 ? '{sets} Sätze in {n} Übung sind offen:' : '{sets} Sätze in {n} Übungen sind offen:', { sets: confirm.open.reduce((n, o) => n + o.missing, 0), n: confirm.open.length })}
                </p>
                <div className="space-y-1.5 mb-5 max-h-48 overflow-y-auto">
                  {confirm.open.map((o) => (
                    <div key={o.name} className="flex items-center justify-between text-sm rounded-lg px-3 py-2" style={{ background: 'rgb(var(--text) / 0.04)' }}>
                      <span className="text-white/85 truncate">{t(o.name)}</span>
                      <span className="text-adlr-gold text-xs font-semibold shrink-0 ml-3">{t('{n} offen', { n: o.missing })}</span>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setConfirm(null)} className="adlr-tap flex-1 py-3 rounded-xl text-sm font-semibold" style={{ background: 'linear-gradient(135deg, rgb(var(--adlr-gold)), rgb(var(--adlr-gold-dim)))', color: '#000' }}>
                    {t('Weiter trainieren')}
                  </button>
                  <button disabled={finishing} onClick={() => { const i = confirm.dayIdx; setConfirm(null); finishTraining(i); }} className="adlr-tap flex-1 py-3 rounded-xl text-sm font-medium bg-white/5 border border-white/10 text-white/70">
                    {t('Trotzdem beenden')}
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-base font-semibold text-white">{t('Training abbrechen?')}</p>
                <p className="text-sm text-white/55 mt-1 mb-5">{t('Alle Eingaben dieses Trainings gehen verloren und es wird nicht gespeichert.')}</p>
                <div className="flex gap-2">
                  <button onClick={() => setConfirm(null)} className="adlr-tap flex-1 py-3 rounded-xl text-sm font-semibold" style={{ background: 'linear-gradient(135deg, rgb(var(--adlr-gold)), rgb(var(--adlr-gold-dim)))', color: '#000' }}>
                    {t('Weiter trainieren')}
                  </button>
                  <button onClick={() => { setConfirm(null); stopTraining(); }} className="adlr-tap flex-1 py-3 rounded-xl text-sm font-medium bg-red-500/10 border border-red-500/30 text-red-400">
                    {t('Verwerfen')}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>,
        document.body
      )}
      {finished && (
        <WorkoutSummary
          summary={finished.summary}
          allCompletions={finished.all}
          mode="finished"
          newPRs={newPRs}
          milestoneMsg={milestoneMsg}
          onClose={() => { setFinished(null); setNewPRs([]); setMilestoneMsg(null); }}
        />
      )}
    </div>
  );
}
