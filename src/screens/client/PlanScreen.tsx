import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import type { PlanDay, WorkoutCompletion, ExerciseSetLog, PersonalRecord, Exercise, Session } from '@/lib/types';
import Celebration from '@/components/Celebration';
import WorkoutSummary from '@/components/WorkoutSummary';
import { summarizeSession, type SessionSummary } from '@/lib/workoutSummary';
import { useNavigate } from 'react-router-dom';
import { SectionHeader, EmptyState, Loading } from '@/components/ui';
import { Flame, ChevronDown, Clock, Target, Check, Play, Timer, Square, Dumbbell, Footprints, Moon, CircleDashed, Repeat, Calendar, MapPin, Trophy, History, ChevronRight, Plus, Shuffle, Pencil } from 'lucide-react';
import { ExerciseDemoModal as LibDemoModal, hasDemo, ExerciseLibrary } from '@/components/ExerciseLibrary';
import { fetchExercises, isGymDependent, type ExerciseRow } from '@/lib/exercises';
import { useAsyncData } from '@/lib/useAsyncData';
import { haptic } from '@/lib/haptics';
import { localDateKey } from '@/lib/dates';
import { syncSessionReminders } from '@/lib/sessionReminders';
import {
  requestNotificationPermission,
  scheduleRestTimerNotification,
  cancelRestTimerNotification,
  snoozeRestTimerNotification,
  registerRestTimerActionListener,
  setRestTimerActionHandler,
  clearPersistedState,
  getPersistedState,
  isNotificationPermissionGranted,
} from '@/lib/restTimerNotifications';
import {
  startRestChrono,
  stopRestChrono,
  registerRestChronoActionListener,
  removeRestChronoActionListener,
} from '@/lib/restChrono';
import { t, fmtDate, fmtTime } from '@/lib/i18n';
import ClientDayEditor from '@/components/ClientDayEditor';
import WeeklyRecap from '@/components/WeeklyRecap';
import { loadWeeklyRecap, recapSeenThisWeek, markRecapSeen, scheduleWeeklyRecapNotification, type WeeklyRecapData } from '@/lib/weeklyRecap';
import { weeklyStreak } from '@/lib/streak';

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
  checkedSets: string[];
  setInputs: Record<string, SetInput[]>;
  trainingStartAt: number;
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
  const { data: lib } = useAsyncData(fetchExercises, []);
  // Cardio exercises log time/distance instead of kg × reps.
  const cardioNames = useMemo(() => new Set((lib ?? []).filter((e) => e.muscle_group === 'Cardio').map((e) => e.name)), [lib]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editingDay, setEditingDay] = useState<PlanDay | null>(null);
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
  const [newGym, setNewGym] = useState('');
  const setGym = (g: string | null) => { setGymState(g); writeLS(GYM_KEY, g); };
  // Safety dialog before finishing with un-ticked sets, or before discarding a session.
  const [confirm, setConfirm] = useState<
    | { kind: 'finish'; dayIdx: number; open: { name: string; missing: number }[] }
    | { kind: 'cancel' }
    | null
  >(null);
  const [setInputs, setSetInputs] = useState<Record<string, SetInput[]>>({});
  const [restTimer, setRestTimer] = useState<number | null>(null);
  const [restTotal, setRestTotal] = useState(0);
  const [trainingStartAt, setTrainingStartAt] = useState<number | null>(null);
  const [trainingElapsed, setTrainingElapsed] = useState(0);
  const [notifPermissionDenied, setNotifPermissionDenied] = useState(false);
  const [starterBusy, setStarterBusy] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentRestCtx = useRef<{ exerciseName: string; setNumber: number; totalSets: number; restSeconds: number; reps?: string } | null>(null);
  const notifPromptShown = useRef(false);

  const load = async () => {
    if (!profile) return;
    setLoading(true);
    let trainingDaysInPlan = 0;
    const { data: cp } = await supabase
      .from('client_plans')
      .select('plan_id')
      .eq('client_id', profile.id)
      .eq('is_active', true)
      .maybeSingle();
    if (cp) {
      const { data: pd } = await supabase.from('plan_days').select('*').eq('plan_id', cp.plan_id).order('day_of_week');
      const planDays = (pd ?? []) as PlanDay[];
      trainingDaysInPlan = planDays.filter((d) => !d.is_rest_day).length;
      // Resume a training session that was active when the app got closed/killed —
      // only on the initial load (activeDayIdx is still null at that point).
      const persisted = activeDayIdx === null ? getPersistedActiveTraining() : null;
      const loadedDays = persisted?.freeDay ? [...planDays, persisted.freeDay] : planDays;
      setDays(loadedDays);
      if (activeDayIdx === null) {
        if (persisted) {
          const isStale = Date.now() - persisted.trainingStartAt > ACTIVE_TRAINING_MAX_AGE_MS;
          const idx = loadedDays.findIndex((d) => d.id === persisted.dayId);
          if (!isStale && idx !== -1) {
            setActiveDayIdx(idx);
            setCheckedSets(new Set(persisted.checkedSets));
            setSetInputs(persisted.setInputs);
            setTrainingStartAt(persisted.trainingStartAt);
            setExpanded(idx);
          } else {
            persistActiveTraining(null);
          }
        }
      }
    }
    const { data: wc } = await supabase.from('workout_completions').select('*').eq('client_id', profile.id).order('completed_at', { ascending: false });
    setCompletions((wc ?? []) as WorkoutCompletion[]);
    const { data: sl } = await supabase.from('exercise_set_logs').select('*').eq('client_id', profile.id).order('created_at', { ascending: false });
    setSetLogs((sl ?? []) as ExerciseSetLog[]);
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
    syncSessionReminders(sessList);
    scheduleWeeklyRecapNotification();
    if (!recapSeenThisWeek()) loadWeeklyRecap(profile.id, trainingDaysInPlan).then(setRecap).catch(() => {});
    setLoading(false);
  };

  useEffect(() => { load(); }, [profile?.id]);

  // Keep the active training session persisted so it survives the app being
  // backgrounded/killed and reopened (Android may kill the WebView process).
  useEffect(() => {
    if (activeDayIdx === null || trainingStartAt === null) return;
    const day = days[activeDayIdx];
    if (!day) return;
    persistActiveTraining({
      dayId: day.id,
      freeDay: day.is_free ? day : undefined,
      checkedSets: Array.from(checkedSets),
      setInputs,
      trainingStartAt,
    });
  }, [activeDayIdx, checkedSets, setInputs, trainingStartAt, days]);

  // Live elapsed-time counter while a training session is active
  useEffect(() => {
    if (trainingStartAt === null) { setTrainingElapsed(0); return; }
    const id = setInterval(() => setTrainingElapsed(Math.floor((Date.now() - trainingStartAt) / 1000)), 1000);
    return () => clearInterval(id);
  }, [trainingStartAt]);

  // Register notification action listener once on mount
  useEffect(() => {
    registerRestTimerActionListener();
    return () => { clearPersistedState(); cancelRestTimerNotification(); stopRestChrono(); };
  }, []);

  // Cancel pending notification when app becomes visible (user opened app before timer ended)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && restTimer !== null) {
        cancelRestTimerNotification();
        stopRestChrono();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [restTimer]);

  // Shared handler for both the scheduled notification buttons and the live
  // chronometer notification buttons. 'add_30s' extends the current rest; 'advance'
  // marks the set done and (re)starts the rest for the next set.
  const handleRestAction = useCallback((action: 'advance' | 'add_30s') => {
    if (action === 'add_30s') {
      snoozeRestTimerNotification(30);
      const state = getPersistedState();
      if (state) {
        const repsSuffix = state.reps ? ` · ${state.reps} ${t('Wdh.')}` : '';
        startRestChrono({
          endTime: Date.now() + 30 * 1000,
          title: t('Pause läuft'),
          body: `${t(state.exerciseName)} — ${t('Satz {n}/{total}', { n: state.setNumber, total: state.totalSets })}${repsSuffix}`,
        });
      }
      return;
    }
    // advance: move to the next set in persistent state
    const state = getPersistedState();
    if (!state) return;
    if (state.isWorkoutComplete) {
      clearPersistedState();
      cancelRestTimerNotification();
      stopRestChrono();
      return;
    }
    const nextSet = state.setNumber + 1;
    const isLast = nextSet >= state.totalSets;
    if (isLast) {
      clearPersistedState();
      cancelRestTimerNotification();
      stopRestChrono();
    } else {
      scheduleRestTimerNotification({
        exerciseName: state.exerciseName,
        setNumber: nextSet,
        totalSets: state.totalSets,
        restSeconds: state.restSeconds,
        isLastSet: isLast,
        isWorkoutComplete: false,
        reps: state.reps,
      });
      const repsSuffix = state.reps ? ` · ${state.reps} ${t('Wdh.')}` : '';
      startRestChrono({
        endTime: Date.now() + state.restSeconds * 1000,
        title: t('Pause läuft'),
        body: `${t(state.exerciseName)} — ${t('Satz {n}/{total}', { n: nextSet, total: state.totalSets })}${repsSuffix}`,
      });
    }
  }, []);

  // Set up action handlers for notification button taps (scheduled + live chronometer)
  useEffect(() => {
    setRestTimerActionHandler((action) => handleRestAction(action === 'add_30s' ? 'add_30s' : 'advance'));
    registerRestChronoActionListener((action) => handleRestAction(action === 'add_30s' ? 'add_30s' : 'advance'));
    return () => {
      setRestTimerActionHandler(null);
      removeRestChronoActionListener();
    };
  }, [handleRestAction]);

  // Rest timer countdown
  useEffect(() => {
    if (restTimer === null) return;
    timerRef.current = setInterval(() => {
      setRestTimer((t) => {
        if (t === null) return null;
        if (t <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return null;
        }
        return t - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [restTimer !== null]);

  const startRestTimer = async (seconds: number, exerciseName?: string, setNumber?: number, totalSets?: number, reps?: string) => {
    setRestTotal(seconds);
    setRestTimer(seconds);
    if (exerciseName && setNumber !== undefined && totalSets !== undefined) {
      currentRestCtx.current = { exerciseName, setNumber, totalSets, restSeconds: seconds, reps };
      const isLast = setNumber >= totalSets;
      const granted = await isNotificationPermissionGranted();
      if (granted) {
        await scheduleRestTimerNotification({
          exerciseName,
          setNumber,
          totalSets,
          restSeconds: seconds,
          isLastSet: isLast,
          isWorkoutComplete: false,
          reps,
        });
        const repsSuffix = reps ? ` · ${reps} ${t('Wdh.')}` : '';
        await startRestChrono({
          endTime: Date.now() + seconds * 1000,
          title: t('Pause läuft'),
          body: `${t(exerciseName)} — ${t('Satz {n}/{total}', { n: setNumber, total: totalSets })}${repsSuffix}`,
        });
      }
    }
  };

  const stopRestTimer = () => {
    setRestTimer(null);
    if (timerRef.current) clearInterval(timerRef.current);
    cancelRestTimerNotification();
    stopRestChrono();
    clearPersistedState();
  };

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
  const getLastSessionLogs = useCallback((exerciseName: string): { logs: ExerciseSetLog[]; gym: string | null; otherGym: boolean } => {
    const byTime = [...completions].sort((x, y) => new Date(y.completed_at).getTime() - new Date(x.completed_at).getTime());
    const logsFor = (cId: string) => setLogs
      .filter((l) => l.workout_completion_id === cId && l.exercise_name === exerciseName)
      .sort((x, y) => x.set_number - y.set_number);
    for (const c of byTime) {
      if ((c.gym ?? null) !== gym) continue;
      const ls = logsFor(c.id);
      if (ls.length > 0) return { logs: ls, gym: c.gym ?? null, otherGym: false };
    }
    for (const c of byTime) {
      const ls = logsFor(c.id);
      if (ls.length > 0) return { logs: ls, gym: c.gym ?? null, otherGym: true };
    }
    return { logs: [], gym: null, otherGym: false };
  }, [completions, setLogs, gym]);

  // "Freies Training": an ad-hoc session with exercises picked from the library.
  const startFreeTraining = () => {
    const fd: PlanDay = {
      id: `free-${Date.now()}`, plan_id: '', day_of_week: 99, workout_name: 'Freies Training', focus: null,
      difficulty: 1, duration_min: null, notes: null, exercises: [], is_rest_day: false, is_free: true,
    };
    ensureNotificationPermission();
    const idx = days.filter((d) => !d.is_free).length;
    setDays((prev) => [...prev.filter((d) => !d.is_free), fd]);
    setSetInputs({});
    setCheckedSets(new Set());
    setActiveDayIdx(idx);
    setExpanded(idx);
    setTrainingStartAt(Date.now());
    setPickerOpen(true);
    haptic.medium();
  };
  const addFreeExercise = (row: ExerciseRow) => {
    const free = days.find((d) => d.is_free);
    if (!free || free.exercises.some((e) => e.name === row.name)) return;
    const sets = row.default_sets || 3;
    setDays((prev) => prev.map((d) => (d.is_free
      ? { ...d, exercises: [...d.exercises, { name: row.name, sets, reps: row.default_reps || undefined, rest_sec: row.default_rest_sec || undefined }] }
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

  // Initialize set inputs when training starts
  const startTraining = (dayIdx: number) => {
    ensureNotificationPermission();
    const day = days[dayIdx];
    if (!day || !day.exercises) return;
    const inputs: Record<string, SetInput[]> = {};
    for (const ex of day.exercises) {
      const lastLogs = getLastSessionLogs(ex.name).logs;
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
    setCheckedSets(new Set());
    setActiveDayIdx(dayIdx);
    setTrainingStartAt(Date.now());
    haptic.medium();
  };

  const stopTraining = () => {
    setActiveDayIdx(null);
    setDays((prev) => prev.filter((d) => !d.is_free));
    setCheckedSets(new Set());
    setSetInputs({});
    setTrainingStartAt(null);
    stopRestTimer();
    persistActiveTraining(null);
  };

  const finishTraining = async (dayIdx: number) => {
    const day = days[dayIdx];
    if (!profile || !day) return;
    // Schedule workout-complete notification if this was the last set
    const granted = await isNotificationPermissionGranted();
    if (granted) {
      await scheduleRestTimerNotification({
        exerciseName: '',
        setNumber: 0,
        totalSets: 0,
        restSeconds: 0,
        isLastSet: true,
        isWorkoutComplete: true,
        delaySeconds: 1,
      });
    }
    // Create workout completion
    const { data: wc, error } = await supabase.from('workout_completions').insert({ client_id: profile.id, plan_day_id: day.is_free ? null : day.id }).select('*').single();
    if (error || !wc) return;
    if (day.is_free) await supabase.from('workout_completions').update({ title: day.workout_name }).eq('id', wc.id); // best-effort
    // Studio tag (best-effort — no-op if the gym column isn't migrated yet)
    if (gym) await supabase.from('workout_completions').update({ gym }).eq('id', wc.id);
    // Record session duration (best-effort — no-op if the duration_sec column isn't there yet)
    const durationSec = trainingStartAt ? Math.floor((Date.now() - trainingStartAt) / 1000) : null;
    if (durationSec != null) {
      await supabase.from('workout_completions').update({ duration_sec: durationSec }).eq('id', wc.id);
    }
    // Save set logs
    const logsToInsert: Array<{ client_id: string; workout_completion_id: string; plan_day_id: string | null; exercise_name: string; set_number: number; weight_kg: number | null; reps: number | null; set_type: SetType; duration_sec: number | null; distance_km: number | null }> = [];
    for (const ex of day.exercises ?? []) {
      const inputs = setInputs[ex.name] ?? [];
      for (let i = 0; i < inputs.length; i++) {
        const w = inputs[i]?.weight ? Number(inputs[i].weight) : null;
        const r = inputs[i]?.reps ? Number(inputs[i].reps) : null;
        const dur = inputs[i]?.min ? Math.round(Number(inputs[i].min) * 60) : null;
        const km = inputs[i]?.km ? Number(inputs[i].km) : null;
        if (w !== null || r !== null || dur !== null || km !== null) {
          logsToInsert.push({
            client_id: profile.id,
            workout_completion_id: wc.id,
            plan_day_id: day.is_free ? null : day.id,
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
    if (logsToInsert.length > 0) {
      const { error: logsErr } = await supabase.from('exercise_set_logs').insert(logsToInsert);
      if (logsErr) {
        // set_type column not migrated on this Supabase project yet — retry without it
        // so weight/reps are never lost while the migration is pending.
        const withoutType = logsToInsert.map((l) => ({
          client_id: l.client_id,
          workout_completion_id: l.workout_completion_id,
          plan_day_id: l.plan_day_id,
          exercise_name: l.exercise_name,
          set_number: l.set_number,
          weight_kg: l.weight_kg,
          reps: l.reps,
        }));
        await supabase.from('exercise_set_logs').insert(withoutType);
      }
    }
    // Auto-detect new personal records from this session's heaviest working/dropset sets
    // (warm-up sets are intentionally lighter and shouldn't trigger a false PR).
    const bestByExercise = new Map<string, { weight_kg: number; reps: number }>();
    for (const l of logsToInsert) {
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
    if (detected.length > 0) {
      const rows = detected.map((d) => ({ client_id: profile.id, exercise_name: d.exercise_name, weight_kg: d.weight_kg, reps: d.reps, gym: d.gym }));
      const { error: prErr } = await supabase.from('personal_records').insert(rows);
      // gym column not migrated yet — retry without it so the PR itself is never lost
      if (prErr) await supabase.from('personal_records').insert(rows.map(({ gym: _g, ...r }) => r));
      setNewPRs(detected);
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
    if (streak !== profile.streak) {
      await supabase.from('profiles').update({ streak }).eq('id', profile.id);
      await refreshProfile();
    }
    // Milestone celebration — total completed workouts including this one.
    const totalWorkouts = completions.length + 1;
    if (totalWorkouts === 1) setMilestoneMsg(t('Dein erstes Training! Der Anfang von etwas Großem.'));
    else if (totalWorkouts % 100 === 0) setMilestoneMsg(t('{n}. Training! Unglaublich stark.', { n: totalWorkouts }));
    else if (totalWorkouts % 50 === 0) setMilestoneMsg(t('{n}. Training! Absolute Konstanz.', { n: totalWorkouts }));
    else if (totalWorkouts % 10 === 0) setMilestoneMsg(t('{n}. Training! Weiter so.', { n: totalWorkouts }));
    else setMilestoneMsg(null);
    haptic.success();
    setCelebrate(true);
    const doneComp: WorkoutCompletion = { ...(wc as WorkoutCompletion), duration_sec: durationSec, gym, title: day.is_free ? day.workout_name : null };
    const now = new Date().toISOString();
    const sessionLogs: ExerciseSetLog[] = logsToInsert.map((l, i) => ({ ...l, id: `local-${i}`, created_at: now }));
    const muscleByName = new Map((lib ?? []).map((e) => [e.name, e.muscle_group]));
    setFinished({
      summary: summarizeSession(doneComp, sessionLogs, day.workout_name ?? t('Training'), (n) => muscleByName.get(n) ?? 'Sonstige'),
      all: [...completions, doneComp],
    });
    setTimeout(() => setCelebrate(false), 2800);
    stopTraining();
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
    const key = setKey(ex.name, setIdx);
    const wasChecked = checkedSets.has(key);
    setCheckedSets((prev) => {
      const next = new Set(prev);
      if (wasChecked) next.delete(key);
      else next.add(key);
      return next;
    });
    if (!wasChecked && ex.rest_sec) {
      const exSets = ex.sets ?? 1;
      const reps = setInputs[ex.name]?.[setIdx]?.reps;
      startRestTimer(ex.rest_sec, ex.name, setIdx + 1, exSets, reps);
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
        <EmptyState title={t('Dein Plan wird vorbereitet.')} subtitle={t('Peter ist am Werk. Du trainierst, sobald dein Plan bereit ist.')} />
        <div className="adlr-card p-5 mt-4 adlr-gold-border" style={{ background: 'linear-gradient(135deg, rgb(var(--adlr-gold) / 0.12), rgb(var(--adlr-gold) / 0.03))' }}>
          <p className="text-sm font-semibold text-white mb-1">{t('Schon mal loslegen? 💪')}</p>
          <p className="text-xs text-white/60 mb-4 leading-relaxed">{t('Starte mit dem Ganzkörper-Starter-Plan (3 Tage). Sobald Peter deinen persönlichen Plan fertig hat, wird er automatisch aktiv.')}</p>
          <button
            onClick={activateStarter}
            disabled={starterBusy}
            className="adlr-tap w-full py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
            style={{ background: 'rgb(var(--adlr-gold))', color: '#000' }}
          >
            {starterBusy ? '…' : <><Dumbbell size={16} /> {t('Starter-Plan starten')}</>}
          </button>
        </div>
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
  const weekStreak = weeklyStreak(completions.map((c) => c.completed_at), plannedDays.length);
  const knownGyms = [...new Set([...savedGyms, ...completions.map((c) => c.gym).filter((g): g is string => !!g)])];
  const addGym = () => {
    const name = newGym.trim();
    if (!name) return;
    const next = [...new Set([...savedGyms, name])];
    setSavedGyms(next); writeLS(GYMS_KEY, next);
    setGym(name); setNewGym(''); setAddingGym(false); setGymSheet(false);
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

      {/* Active training banner with live elapsed timer */}
      {activeDayIdx !== null && (
        <div className="sticky top-2 z-30 mb-4 adlr-fade-in">
          <div
            className="flex items-center gap-3 px-4 py-3 rounded-2xl adlr-gold-border"
            style={{ background: 'linear-gradient(135deg, rgb(var(--adlr-gold) / 0.20), rgb(var(--adlr-gold) / 0.06))', backdropFilter: 'blur(8px)' }}
          >
            <span className="relative flex h-3 w-3 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-adlr-gold opacity-60" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-adlr-gold" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-adlr-gold/80 uppercase tracking-widest">{t('Training läuft')}</p>
              <p className="text-sm font-semibold text-white truncate">{t(days[activeDayIdx]?.workout_name ?? 'Training')}{gym ? <span className="text-white/50 font-normal"> · {gym}</span> : null}</p>
            </div>
            <span className="text-2xl font-bold text-adlr-gold tabular-nums">
              {String(Math.floor(trainingElapsed / 60)).padStart(2, '0')}:{String(trainingElapsed % 60).padStart(2, '0')}
            </span>
          </div>
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
            <span className="block text-xs text-white/55">{t('Dein Rückblick auf letzte Woche — Rekorde, Alltag, Peters Worte.')}</span>
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

      {/* Rest timer overlay — portaled to <body>: a plain fixed div nested inside the
          .adlr-route/.adlr-fade-in ancestors would be pinned to THEIR transform (which
          lingers after the route/fade animation ends) instead of the viewport, making
          it float in the wrong spot and need scrolling to reach. Same fix already used
          for ExerciseDemoModal/MonthlyReport. */}
      {restTimer !== null && createPortal(
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-40 adlr-fade-in">
          <div className="flex items-center gap-3 px-5 py-3 rounded-2xl shadow-2xl" style={{ background: 'rgba(30,26,16,0.96)', border: '1px solid rgb(var(--adlr-gold) / 0.45)', backdropFilter: 'blur(12px)' }}>
            <Timer size={18} className="text-adlr-gold" />
            <div className="flex flex-col items-center">
              <span className="text-2xl font-bold text-adlr-gold tabular-nums">{restTimer}s</span>
              <div className="w-24 h-1 rounded-full bg-white/10 mt-1 overflow-hidden">
                <div className="h-full bg-adlr-gold transition-all duration-1000 ease-linear" style={{ width: `${restTotal > 0 ? (restTimer / restTotal) * 100 : 0}%` }} />
              </div>
            </div>
            <button onClick={() => { setRestTimer((t) => (t ?? 0) + 30); setRestTotal((r) => r + 30); snoozeRestTimerNotification(30); }} className="adlr-tap px-2.5 py-1.5 rounded-lg text-xs font-medium" style={{ background: 'rgb(var(--adlr-gold) / 0.2)', color: 'rgb(var(--adlr-gold))' }} title="+30s">
              +30s
            </button>
            <button onClick={stopRestTimer} className="adlr-tap p-2 rounded-lg" style={{ color: 'rgb(var(--text) / 0.5)' }}>
              <Square size={14} />
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* Notification permission hint */}
      {notifPermissionDenied && restTimer !== null && createPortal(
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-40 adlr-fade-in max-w-xs">
          <div className="px-4 py-2.5 rounded-xl text-center" style={{ background: 'rgb(var(--text) / 0.06)', border: '1px solid rgb(var(--text) / 0.12)' }}>
            <p className="text-xs text-white/50">{t('Aktiviere Benachrichtigungen in den Einstellungen für Pausen-Erinnerungen beim nächsten Satz.')}</p>
          </div>
        </div>,
        document.body
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
          <button
            onClick={() => nav('/app/verlauf')}
            className="adlr-tap w-full mt-3.5 pt-3 flex items-center justify-between text-sm"
            style={{ borderTop: '1px solid rgb(var(--text) / 0.07)' }}
          >
            <span className="flex items-center gap-2 text-white/80"><History size={15} className="text-adlr-gold" /> {t('Trainings-Verlauf')}</span>
            <span className="flex items-center gap-1 text-xs text-white/40">{t('{n} gesamt', { n: completions.length })} <ChevronRight size={14} /></span>
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
                        {isNext && <span className="text-xs text-adlr-gold font-medium">· {t('Als nächstes')}</span>}
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
                            onClick={() => (recap && !recapSeen ? setRecapOpen({ startIdx: idx }) : startTraining(idx))}
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
                                    {ex.rest_sec ? ` · ${t('{n}s Pause', { n: ex.rest_sec })}` : ''}
                                  </p>
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
                                                  className="w-16 bg-inset border border-white/10 rounded-md px-2 py-1.5 text-xs text-white placeholder-white/20 outline-none text-center"
                                                />
                                                <span className="text-xs text-white/30">·</span>
                                                <input
                                                  type="number"
                                                  inputMode="decimal"
                                                  value={inputs[setIdx]?.km ?? ''}
                                                  onChange={(e) => updateSetInput(ex.name, setIdx, 'km', e.target.value)}
                                                  placeholder="km"
                                                  className="w-16 bg-inset border border-white/10 rounded-md px-2 py-1.5 text-xs text-white placeholder-white/20 outline-none text-center"
                                                />
                                              </>
                                            ) : (
                                              <>
                                                <input
                                                  type="number"
                                                  value={inputs[setIdx]?.weight ?? ''}
                                                  onChange={(e) => updateSetInput(ex.name, setIdx, 'weight', e.target.value)}
                                                  placeholder="kg"
                                                  className="w-16 bg-inset border border-white/10 rounded-md px-2 py-1.5 text-xs text-white placeholder-white/20 outline-none text-center"
                                                />
                                                <span className="text-xs text-white/30">×</span>
                                                <input
                                                  type="number"
                                                  value={inputs[setIdx]?.reps ?? ''}
                                                  onChange={(e) => updateSetInput(ex.name, setIdx, 'reps', e.target.value)}
                                                  placeholder={t('Wdh')}
                                                  className="w-16 bg-inset border border-white/10 rounded-md px-2 py-1.5 text-xs text-white placeholder-white/20 outline-none text-center"
                                                />
                                              </>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              </div>
                              {(() => { const r = libMap?.get(ex.name); return r?.exercise_id && hasDemo(r.exercise_id) ? r : null; })() && (
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
                  {day.is_free && isTrainingThisDay && (
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
                      <p className="text-xs text-adlr-gold/80 uppercase tracking-wide mb-1">{t('Notiz von Peter')}</p>
                      <p className="text-sm text-white/70">{day.notes}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {activeDayIdx === null && (
        <button
          onClick={startFreeTraining}
          className="adlr-tap w-full mt-4 mb-2 px-4 py-3.5 rounded-2xl flex items-center gap-3 text-left border border-dashed"
          style={{ borderColor: 'rgb(var(--text) / 0.15)', background: 'rgb(var(--text) / 0.02)' }}
        >
          <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 bg-white/5 text-adlr-gold"><Shuffle size={19} /></div>
          <div className="min-w-0">
            <p className="text-base font-semibold text-white/90">{t('Freies Training')}</p>
            <p className="text-xs text-white/45">{t('Außerhalb des Plans — Übungen selbst wählen')}</p>
          </div>
        </button>
      )}

      {gymSheet && createPortal(
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/70 px-4 pb-6 adlr-fade-in" onClick={() => { setGymSheet(false); setAddingGym(false); }}>
          <div className="w-full max-w-md rounded-2xl p-5 bg-adlr-anthracite" style={{ border: '1px solid rgb(var(--text) / 0.1)' }} onClick={(e) => e.stopPropagation()}>
            <p className="text-base font-semibold text-white flex items-center gap-2"><MapPin size={16} className="text-adlr-gold" /> {t('Studio')}</p>
            <p className="text-xs text-white/45 mt-1 mb-4">{t('Gerätegewichte werden pro Studio gemerkt — wähle, wo du heute trainierst.')}</p>
            <div className="space-y-1.5 mb-3">
              {[null, ...knownGyms].map((g) => (
                <button
                  key={g ?? '__none'}
                  onClick={() => { setGym(g); setGymSheet(false); }}
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
      {pickerOpen && createPortal(
        <div className="fixed inset-0 z-[65] flex flex-col bg-adlr-black adlr-fade-in" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
          <div className="max-w-md w-full mx-auto flex flex-col flex-1 min-h-0 px-4">
            <div className="flex items-center justify-between py-4">
              <p className="text-lg font-semibold text-white">{t('Übung hinzufügen')}</p>
              <button onClick={() => setPickerOpen(false)} className="adlr-tap px-4 py-2 rounded-xl text-sm font-semibold" style={{ background: 'rgb(var(--adlr-gold))', color: '#000' }}>
                {t('Fertig')}{(() => { const n = days.find((d) => d.is_free)?.exercises.length ?? 0; return n > 0 ? ` (${n})` : ''; })()}
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
          onClose={() => { markRecapSeen(); setRecapSeen(true); const i = recapOpen.startIdx; setRecapOpen(null); if (i !== null) startTraining(i); }}
          onStart={() => { markRecapSeen(); setRecapSeen(true); const i = recapOpen.startIdx; setRecapOpen(null); if (i !== null) startTraining(i); }}
        />
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
                  <button onClick={() => { const i = confirm.dayIdx; setConfirm(null); finishTraining(i); }} className="adlr-tap flex-1 py-3 rounded-xl text-sm font-medium bg-white/5 border border-white/10 text-white/70">
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
