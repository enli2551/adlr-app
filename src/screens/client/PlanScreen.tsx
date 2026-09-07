import { useEffect, useState, useRef, useCallback } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import type { PlanDay, WorkoutCompletion, ExerciseSetLog, PersonalRecord, Exercise, Session } from '@/lib/types';
import Celebration from '@/components/Celebration';
import { Card, SectionHeader, EmptyState, Loading } from '@/components/ui';
import { Flame, ChevronDown, Clock, Target, Check, Play, Timer, Square, Dumbbell, Footprints, Moon, CircleDashed, Repeat, Calendar, MapPin } from 'lucide-react';
import { ExerciseDemoModal as LibDemoModal, hasDemo } from '@/components/ExerciseLibrary';
import { fetchExercises, type ExerciseRow } from '@/lib/exercises';
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

const NOTIF_PROMPT_KEY = 'adlr_notif_prompted';

const DAY_NAMES = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];

interface SetInput {
  weight: string;
  reps: string;
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

export default function PlanScreen() {
  const { profile } = useAuth();
  const [days, setDays] = useState<PlanDay[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [completions, setCompletions] = useState<WorkoutCompletion[]>([]);
  const [setLogs, setSetLogs] = useState<ExerciseSetLog[]>([]);
  const [prs, setPrs] = useState<PersonalRecord[]>([]);
  const [celebrate, setCelebrate] = useState(false);
  const [newPRs, setNewPRs] = useState<{ exercise_name: string; weight_kg: number; reps: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [justCompleted, setJustCompleted] = useState<number | null>(null);
  const [demoEx, setDemoEx] = useState<ExerciseRow | null>(null);
  const { data: lib } = useAsyncData(fetchExercises, []);
  const libMap = lib ? new Map(lib.map((e) => [e.name, e])) : null;

  // Active training session state
  const [activeDayIdx, setActiveDayIdx] = useState<number | null>(null);
  const [checkedExercises, setCheckedExercises] = useState<Set<string>>(new Set());
  const [setInputs, setSetInputs] = useState<Record<string, SetInput[]>>({});
  const [restTimer, setRestTimer] = useState<number | null>(null);
  const [restTotal, setRestTotal] = useState(0);
  const [trainingStartAt, setTrainingStartAt] = useState<number | null>(null);
  const [trainingElapsed, setTrainingElapsed] = useState(0);
  const [notifPermissionDenied, setNotifPermissionDenied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentRestCtx = useRef<{ exerciseName: string; setNumber: number; totalSets: number; restSeconds: number; reps?: string } | null>(null);
  const notifPromptShown = useRef(false);

  const load = async () => {
    if (!profile) return;
    setLoading(true);
    const { data: cp } = await supabase
      .from('client_plans')
      .select('plan_id')
      .eq('client_id', profile.id)
      .eq('is_active', true)
      .maybeSingle();
    if (cp) {
      const { data: pd } = await supabase.from('plan_days').select('*').eq('plan_id', cp.plan_id).order('day_of_week');
      setDays((pd ?? []) as PlanDay[]);
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
    setLoading(false);
  };

  useEffect(() => { load(); }, [profile?.id]);

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
        const repsSuffix = state.reps ? ` · ${state.reps} Wdh.` : '';
        startRestChrono({
          endTime: Date.now() + 30 * 1000,
          title: 'Pause läuft',
          body: `${state.exerciseName} — Satz ${state.setNumber}/${state.totalSets}${repsSuffix}`,
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
      const repsSuffix = state.reps ? ` · ${state.reps} Wdh.` : '';
      startRestChrono({
        endTime: Date.now() + state.restSeconds * 1000,
        title: 'Pause läuft',
        body: `${state.exerciseName} — Satz ${nextSet}/${state.totalSets}${repsSuffix}`,
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
        const repsSuffix = reps ? ` · ${reps} Wdh.` : '';
        await startRestChrono({
          endTime: Date.now() + seconds * 1000,
          title: 'Pause läuft',
          body: `${exerciseName} — Satz ${setNumber}/${totalSets}${repsSuffix}`,
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
  const getLastSessionLogs = useCallback((planDayId: string, exerciseName: string): ExerciseSetLog[] => {
    const dayCompletions = completions
      .filter((c) => c.plan_day_id === planDayId)
      .sort((a, b) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime());
    if (dayCompletions.length === 0) return [];
    const lastCompletion = dayCompletions[0];
    return setLogs
      .filter((l) => l.workout_completion_id === lastCompletion.id && l.exercise_name === exerciseName)
      .sort((a, b) => a.set_number - b.set_number);
  }, [completions, setLogs]);

  // Initialize set inputs when training starts
  const startTraining = (dayIdx: number) => {
    ensureNotificationPermission();
    const day = days[dayIdx];
    if (!day || !day.exercises) return;
    const inputs: Record<string, SetInput[]> = {};
    for (const ex of day.exercises) {
      const lastLogs = getLastSessionLogs(day.id, ex.name);
      const presc = effectiveSets(ex);
      inputs[ex.name] = Array.from({ length: ex.sets ?? 1 }, (_, i) => ({
        weight: lastLogs[i]?.weight_kg?.toString() ?? presc[i]?.weight_kg?.toString() ?? '',
        reps: lastLogs[i]?.reps?.toString() ?? presc[i]?.reps?.toString() ?? '',
      }));
    }
    setSetInputs(inputs);
    setCheckedExercises(new Set());
    setActiveDayIdx(dayIdx);
    setTrainingStartAt(Date.now());
    haptic.medium();
  };

  const stopTraining = () => {
    setActiveDayIdx(null);
    setCheckedExercises(new Set());
    setSetInputs({});
    setTrainingStartAt(null);
    stopRestTimer();
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
    const { data: wc, error } = await supabase.from('workout_completions').insert({ client_id: profile.id, plan_day_id: day.id }).select('*').single();
    if (error || !wc) return;
    // Record session duration (best-effort — no-op if the duration_sec column isn't there yet)
    const durationSec = trainingStartAt ? Math.floor((Date.now() - trainingStartAt) / 1000) : null;
    if (durationSec != null) {
      await supabase.from('workout_completions').update({ duration_sec: durationSec }).eq('id', wc.id);
    }
    // Save set logs
    const logsToInsert: Array<{ client_id: string; workout_completion_id: string; plan_day_id: string; exercise_name: string; set_number: number; weight_kg: number | null; reps: number | null }> = [];
    for (const ex of day.exercises ?? []) {
      const inputs = setInputs[ex.name] ?? [];
      for (let i = 0; i < inputs.length; i++) {
        const w = inputs[i]?.weight ? Number(inputs[i].weight) : null;
        const r = inputs[i]?.reps ? Number(inputs[i].reps) : null;
        if (w !== null || r !== null) {
          logsToInsert.push({
            client_id: profile.id,
            workout_completion_id: wc.id,
            plan_day_id: day.id,
            exercise_name: ex.name,
            set_number: i + 1,
            weight_kg: w,
            reps: r,
          });
        }
      }
    }
    if (logsToInsert.length > 0) {
      await supabase.from('exercise_set_logs').insert(logsToInsert);
    }
    // Auto-detect new personal records from this session's heaviest sets
    const bestByExercise = new Map<string, { weight_kg: number; reps: number }>();
    for (const l of logsToInsert) {
      if (l.weight_kg == null) continue;
      const cur = bestByExercise.get(l.exercise_name);
      if (!cur || l.weight_kg > cur.weight_kg) bestByExercise.set(l.exercise_name, { weight_kg: l.weight_kg, reps: l.reps ?? 0 });
    }
    const detected: { exercise_name: string; weight_kg: number; reps: number }[] = [];
    for (const [name, best] of bestByExercise) {
      const prevMax = prs.filter((p) => p.exercise_name === name).reduce((m, p) => Math.max(m, p.weight_kg), 0);
      if (best.weight_kg > prevMax) detected.push({ exercise_name: name, weight_kg: best.weight_kg, reps: best.reps });
    }
    if (detected.length > 0) {
      await supabase.from('personal_records').insert(detected.map((d) => ({ client_id: profile.id, exercise_name: d.exercise_name, weight_kg: d.weight_kg, reps: d.reps })));
      setNewPRs(detected);
    }
    haptic.success();
    setCelebrate(true);
    setJustCompleted(dayIdx);
    setTimeout(() => { setJustCompleted(null); setCelebrate(false); setNewPRs([]); }, 2800);
    stopTraining();
    await load();
  };

  const updateSetInput = (exerciseName: string, setIdx: number, field: 'weight' | 'reps', value: string) => {
    setSetInputs((prev) => {
      const arr = [...(prev[exerciseName] ?? [])];
      if (!arr[setIdx]) arr[setIdx] = { weight: '', reps: '' };
      arr[setIdx] = { ...arr[setIdx], [field]: value };
      return { ...prev, [exerciseName]: arr };
    });
  };

  const toggleExerciseCheck = (exerciseName: string) => {
    if (activeDayIdx === null) return;
    setCheckedExercises((prev) => {
      const next = new Set(prev);
      if (next.has(exerciseName)) next.delete(exerciseName);
      else next.add(exerciseName);
      return next;
    });
  };

  if (loading) return <Loading />;
  if (days.length === 0) {
    return (
      <div className="adlr-fade-in">
        <SectionHeader title="Mein Plan" />
        <EmptyState title="Dein Plan wird vorbereitet." subtitle="Peter ist am Werk. Du trainierst, sobald dein Plan bereit ist." />
      </div>
    );
  }

  const today = new Date().getDay() === 0 ? 6 : new Date().getDay() - 1; // Mon=0
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
  const plannedDays = days.filter((day) => !day.is_rest_day);
  const completedThisWeek = plannedDays.filter((day) => planDayDoneThisWeek(day.id)).length;
  const weeklyProgress = plannedDays.length > 0 ? (completedThisWeek / plannedDays.length) * 100 : 0;

  return (
    <div className="adlr-fade-in">
      {celebrate && <Celebration />}
      <SectionHeader title="Mein Plan" subtitle="Diese Woche" />

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
              <p className="text-[10px] text-adlr-gold/80 uppercase tracking-widest">Training läuft</p>
              <p className="text-sm font-semibold text-white truncate">{days[activeDayIdx]?.workout_name ?? 'Training'}</p>
            </div>
            <span className="text-2xl font-bold text-adlr-gold tabular-nums">
              {String(Math.floor(trainingElapsed / 60)).padStart(2, '0')}:{String(trainingElapsed % 60).padStart(2, '0')}
            </span>
          </div>
        </div>
      )}

      {activeDayIdx === null && profile && profile.streak > 0 && (
        <div className="adlr-card p-4 mb-5 flex items-center gap-3 adlr-gold-border">
          <Flame size={22} className="text-adlr-gold" />
          <p className="text-sm text-white/80">Du trainierst seit <span className="adlr-gold-text font-bold">{profile.streak}</span> Tagen. Bleib stark.</p>
        </div>
      )}

      {/* Upcoming PT sessions with the trainer */}
      {activeDayIdx === null && sessions.length > 0 && (
        <div className="adlr-card p-4 mb-5">
          <div className="flex items-center gap-2 mb-3">
            <Calendar size={16} className="text-adlr-gold" />
            <p className="text-sm font-medium text-white/80">Nächste Termine</p>
          </div>
          <div className="space-y-2">
            {sessions.slice(0, 3).map((s) => {
              const d = new Date(s.scheduled_at);
              return (
                <div key={s.id} className="flex items-center gap-3 rounded-xl px-3 py-2.5" style={{ background: 'rgb(var(--text) / 0.03)', border: '1px solid rgb(var(--text) / 0.07)' }}>
                  <div className="flex flex-col items-center justify-center w-11 shrink-0">
                    <span className="text-[10px] uppercase tracking-wide text-adlr-gold/70">{d.toLocaleDateString('de-AT', { weekday: 'short' })}</span>
                    <span className="text-lg font-bold text-white leading-none">{d.getDate()}</span>
                    <span className="text-[10px] text-white/40">{d.toLocaleDateString('de-AT', { month: 'short' })}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white flex items-center gap-1.5"><Clock size={12} className="text-adlr-gold" /> {d.toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' })} · {s.duration_min} Min</p>
                    <p className="text-xs text-white/40 flex items-center gap-1.5 mt-0.5"><MapPin size={11} /> {s.location}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Rest timer overlay */}
      {restTimer !== null && (
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
        </div>
      )}

      {/* Notification permission hint */}
      {notifPermissionDenied && restTimer !== null && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-40 adlr-fade-in max-w-xs">
          <div className="px-4 py-2.5 rounded-xl text-center" style={{ background: 'rgb(var(--text) / 0.06)', border: '1px solid rgb(var(--text) / 0.12)' }}>
            <p className="text-xs text-white/50">Aktiviere Benachrichtigungen in den Einstellungen für Pausen-Erinnerungen beim nächsten Satz.</p>
          </div>
        </div>
      )}

      {activeDayIdx === null && (
        <div className="adlr-card p-4 mb-4">
          <div className="flex items-center justify-between mb-2.5">
            <p className="text-sm font-medium text-white/80">Wochenziel</p>
            <p className="text-sm font-semibold text-adlr-gold">{completedThisWeek}/{plannedDays.length} Trainings</p>
          </div>
          <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full rounded-full bg-adlr-gold transition-all duration-500" style={{ width: `${weeklyProgress}%` }} />
          </div>
        </div>
      )}

      <div className="space-y-2.5 adlr-stagger">
        {days.map((day, idx) => {
          if (activeDayIdx !== null && idx !== activeDayIdx) return null;
          const isOpen = expanded === idx || activeDayIdx === idx;
          const isToday = day.day_of_week === today;
          const isFuture = day.day_of_week > today;
          const completed = !day.is_rest_day && planDayDoneThisWeek(day.id);
          const isTrainingThisDay = activeDayIdx === idx;
          const allExercisesChecked = (day.exercises?.length ?? 0) > 0 && checkedExercises.size >= (day.exercises?.length ?? 0);
          const workoutLabel = day.workout_name ?? 'Training';
          const isCardio = /cardio|zone\s*2|laufen|lauf/i.test(`${workoutLabel} ${day.focus ?? ''}`);
          const DayIcon = day.is_rest_day ? Moon : isCardio ? Footprints : Dumbbell;
          return (
            <div
              key={day.id}
              className={`adlr-card overflow-hidden transition-all ${isToday ? 'ring-2 ring-adlr-gold bg-adlr-gold/10' : ''} ${completed ? 'ring-1 ring-green-500/30' : ''} ${isFuture ? 'opacity-75' : ''}`}
            >
              <button
                onClick={() => setExpanded(isOpen ? null : idx)}
                className="w-full px-4 py-3.5 text-left flex items-center justify-between"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 transition-colors ${isToday ? 'bg-adlr-gold text-black' : 'bg-white/5 text-white/50'}`}>
                    <DayIcon size={20} strokeWidth={1.8} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className={`text-sm font-medium ${isToday ? 'text-adlr-gold' : 'text-white/60'}`}>{DAY_NAMES[day.day_of_week]}</p>
                      {isToday && <span className="text-xs text-adlr-gold font-medium">· Heute</span>}
                    </div>
                    <p className={`text-base font-semibold truncate ${isToday ? 'text-white' : 'text-white/90'}`}>{day.is_rest_day ? 'Ruhetag' : workoutLabel}</p>
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
                    {day.focus && <span className="flex items-center gap-1"><Target size={12} /> {day.focus}</span>}
                    {day.duration_min && <span className="flex items-center gap-1"><Clock size={12} /> {day.duration_min} Min</span>}
                    <span className="flex items-center gap-1">
                      <span className="flex gap-0.5">
                        {[1,2,3].map((d) => (
                          <span key={d} className={`w-1.5 h-1.5 rounded-full ${d <= day.difficulty ? 'bg-adlr-gold' : 'bg-white/10'}`} />
                        ))}
                      </span>
                      {['Leicht','Mittel','Hart'][day.difficulty - 1]}
                    </span>
                  </div>

                  {/* Training session controls */}
                  {!completed && (
                    <div className="mb-4">
                      {isTrainingThisDay ? (
                        <div className="flex gap-2">
                          <button
                            onClick={() => finishTraining(idx)}
                            className={`adlr-tap flex-1 py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all ${
                              allExercisesChecked
                                ? 'bg-green-500 text-white'
                                : 'bg-adlr-gold text-black'
                            }`}
                          >
                            <Check size={16} /> {allExercisesChecked ? 'Training abgeschlossen' : 'Training beenden'}
                          </button>
                          <button
                            onClick={stopTraining}
                            className="adlr-tap px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white/50 text-sm flex items-center justify-center gap-1.5"
                          >
                            <Square size={14} /> Abbrechen
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => startTraining(idx)}
                          className="adlr-tap w-full py-3.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2"
                          style={{ background: 'linear-gradient(135deg, rgb(var(--adlr-gold)), rgb(var(--adlr-gold-dim)))', color: '#000' }}
                        >
                          <Dumbbell size={16} /> Training starten
                        </button>
                      )}
                    </div>
                  )}

                  {day.exercises && day.exercises.length > 0 ? (
                    <div className="space-y-2 mb-4">
                      {day.exercises.map((ex, i) => {
                        const lastLogs = getLastSessionLogs(day.id, ex.name);
                        const isChecked = checkedExercises.has(ex.name);
                        const isTraining = isTrainingThisDay;
                        const inputs = setInputs[ex.name] ?? [];
                        const hasLastData = lastLogs.length > 0;
                        const prescribed = effectiveSets(ex);
                        const vary = setsVary(prescribed);
                        return (
                          <div key={i} className={`rounded-xl p-3 transition-all ${isChecked ? 'bg-green-500/5 border border-green-500/20' : 'border border-white/5'}`}>
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-start gap-2.5 flex-1 min-w-0">
                                {/* Checkbox */}
                                <button
                                  onClick={() => isTraining && toggleExerciseCheck(ex.name)}
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
                                  <p className={`text-sm font-medium ${isChecked ? 'text-white/60 line-through' : 'text-white/90'}`}>{ex.name}</p>
                                  <p className="text-xs text-white/40 mt-0.5">
                                    {ex.sets && `${ex.sets} Sätze`}
                                    {!vary && prescribed[0]?.reps ? ` · ${prescribed[0].reps} Wdh` : ''}
                                    {!vary && prescribed[0]?.weight_kg ? <span className="text-adlr-gold/70"> · {prescribed[0].weight_kg} kg</span> : ''}
                                    {ex.rest_sec ? ` · ${ex.rest_sec}s Pause` : ''}
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
                                        <Repeat size={12} /> Alternativen
                                      </summary>
                                      <div className="mt-1.5 space-y-1 pl-1">
                                        {ex.alternatives.filter((a) => a).map((a, ai) => (
                                          <p key={ai} className="text-xs text-white/60 flex items-center gap-1.5">
                                            <span className="w-1 h-1 rounded-full bg-adlr-gold/50" /> {a}
                                          </p>
                                        ))}
                                      </div>
                                    </details>
                                  )}
                                  {ex.notes && <p className="text-xs text-adlr-gold/60 mt-1">{ex.notes}</p>}
                                  {/* Last session data */}
                                  {hasLastData && (
                                    <p className="text-xs text-adlr-gold/70 mt-1.5">
                                      Letztes Mal: {lastLogs.map((l, li) => `${l.weight_kg ?? '—'} kg × ${l.reps ?? '—'} Wdh`).join(' · ')}
                                    </p>
                                  )}
                                  {/* Set inputs during active training */}
                                  {isTraining && (
                                    <div className="mt-2.5 space-y-1.5">
                                      {Array.from({ length: ex.sets ?? 1 }, (_, setIdx) => (
                                        <div key={setIdx} className="flex items-center gap-2">
                                          <span className="text-[10px] text-white/30 w-12 shrink-0">Satz {setIdx + 1}</span>
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
                                            placeholder="Wdh"
                                            className="w-16 bg-inset border border-white/10 rounded-md px-2 py-1.5 text-xs text-white placeholder-white/20 outline-none text-center"
                                          />
                                          {setIdx === (ex.sets ?? 1) - 1 && ex.rest_sec && (
                                            <button
                                              onClick={() => startRestTimer(ex.rest_sec!, ex.name, setIdx + 1, ex.sets ?? 1, inputs[setIdx]?.reps)}
                                              className="adlr-tap ml-auto text-xs text-adlr-gold/60 hover:text-adlr-gold flex items-center gap-1"
                                            >
                                              <Timer size={12} /> {ex.rest_sec}s
                                            </button>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                              {(() => { const r = libMap?.get(ex.name); return r?.exercise_id && hasDemo(r.exercise_id) ? r : null; })() && (
                                <button onClick={() => setDemoEx(libMap!.get(ex.name)!)} className="adlr-tap shrink-0 ml-1" style={{ color: 'rgb(var(--adlr-gold))' }} title="Demo anzeigen">
                                  <Play size={16} />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-white/30 mb-4">Keine Übungen hinterlegt.</p>
                  )}
                  {day.notes && (
                    <div className="bg-adlr-gold/5 border border-adlr-gold/20 rounded-xl p-3 mb-4">
                      <p className="text-xs text-adlr-gold/80 uppercase tracking-wide mb-1">Notiz von Peter</p>
                      <p className="text-sm text-white/70">{day.notes}</p>
                    </div>
                  )}
                </div>
              )}
              {justCompleted === idx && (
                <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm px-6 pointer-events-none">
                  <div className="adlr-pop">
                    <svg width="100" height="100" viewBox="0 0 100 100" fill="none">
                      <circle cx="50" cy="50" r="46" stroke="rgb(var(--adlr-gold))" strokeWidth="3" />
                      <path d="M30 52 L45 66 L70 36" stroke="rgb(var(--adlr-gold))" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="70" style={{ animation: 'adlr-check 0.6s ease forwards', strokeDashoffset: 70 }} />
                    </svg>
                  </div>
                  <p className="adlr-pop mt-4 text-xl font-bold adlr-gold-text">Stark! Training abgeschlossen.</p>
                  {newPRs.length > 0 && (
                    <div className="adlr-pop mt-5 px-5 py-4 rounded-2xl adlr-gold-border text-center max-w-xs" style={{ background: 'rgb(var(--adlr-gold) / 0.14)' }}>
                      <p className="text-xs text-adlr-gold uppercase tracking-[0.2em] mb-2">🎉 Neuer Rekord!</p>
                      {newPRs.map((pr, i) => (
                        <p key={i} className="text-sm text-white font-semibold">{pr.exercise_name}: {pr.weight_kg} kg × {pr.reps}</p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {demoEx && <LibDemoModal ex={demoEx} onClose={() => setDemoEx(null)} />}
    </div>
  );
}
