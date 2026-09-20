import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import type { WorkoutCompletion, PlanDay, DailyCheckin, ProgressEntry, ExerciseSetLog } from '@/lib/types';
import { Card, SectionHeader, Loading } from '@/components/ui';
import { Flame, Calendar, Trophy, TrendingUp, AlertCircle, ChevronLeft, ChevronRight, X, Target, Palette, Trash2 } from 'lucide-react';
import { fetchExercises, type ExerciseRow } from '@/lib/exercises';
import { useAsyncData } from '@/lib/useAsyncData';
import { localDateKey } from '@/lib/dates';
import ThemeSwitcher from '@/components/ThemeSwitcher';

const DAY_NAMES = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const MONTH_NAMES = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

interface DayInfo {
  date: string;
  dayInMonth: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  isFuture: boolean;
  status: 'completed' | 'rest' | 'missed' | 'planned' | 'none';
  workoutName?: string;
  completion?: WorkoutCompletion;
}

interface PlateauAlert {
  type: 'weight' | 'strength' | 'energy';
  title: string;
  message: string;
  icon: typeof AlertCircle;
}

export default function ProfileScreen() {
  const { profile, signOut } = useAuth();
  const nav = useNavigate();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteErr, setDeleteErr] = useState<string | null>(null);
  const [completions, setCompletions] = useState<WorkoutCompletion[]>([]);
  const [planDays, setPlanDays] = useState<PlanDay[]>([]);
  const [checkins, setCheckins] = useState<DailyCheckin[]>([]);
  const [entries, setEntries] = useState<ProgressEntry[]>([]);
  const [setLogs, setSetLogs] = useState<ExerciseSetLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [calMonth, setCalMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const { data: lib } = useAsyncData(fetchExercises, []);
  const libMap = useMemo(() => lib ? new Map(lib.map((e) => [e.name, e])) : null, [lib]);

  const handleDeleteAccount = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      setDeleteErr(null);
      setTimeout(() => setConfirmDelete(false), 5000);
      return;
    }
    setDeleting(true);
    setDeleteErr(null);
    const { error } = await supabase.functions.invoke('delete-account', { method: 'POST' });
    if (error) {
      setDeleting(false);
      setConfirmDelete(false);
      setDeleteErr('Löschen fehlgeschlagen. Bitte später erneut versuchen.');
      return;
    }
    await signOut();
    nav('/auth', { replace: true });
  };

  const load = async () => {
    if (!profile) return;
    setLoading(true);
    // Run the active-plan lookup together with the profile.id queries in parallel
    // (they don't depend on each other), then fetch plan_days once we have the id.
    const [cpRes, wc, ck, pe, sl] = await Promise.all([
      supabase.from('client_plans').select('plan_id').eq('client_id', profile.id).eq('is_active', true).maybeSingle(),
      supabase.from('workout_completions').select('*').eq('client_id', profile.id).order('completed_at', { ascending: false }),
      supabase.from('daily_checkins').select('*').eq('client_id', profile.id).order('logged_at', { ascending: false }),
      supabase.from('progress_entries').select('*').eq('client_id', profile.id).order('logged_at', { ascending: true }),
      supabase.from('exercise_set_logs').select('*').eq('client_id', profile.id).order('created_at', { ascending: true }),
    ]);
    if (cpRes.data) {
      const { data: pd } = await supabase.from('plan_days').select('*').eq('plan_id', cpRes.data.plan_id).order('day_of_week');
      setPlanDays((pd ?? []) as PlanDay[]);
    }
    setCompletions((wc.data ?? []) as WorkoutCompletion[]);
    setCheckins((ck.data ?? []) as DailyCheckin[]);
    setEntries((pe.data ?? []) as ProgressEntry[]);
    setSetLogs((sl.data ?? []) as ExerciseSetLog[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, [profile?.id]);

  // ---- Calendar ----
  const calendarDays: DayInfo[] = useMemo(() => {
    const year = calMonth.getFullYear();
    const month = calMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startOffset = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
    const todayStr = localDateKey(new Date());

    const days: DayInfo[] = [];
    // Previous month padding
    for (let i = startOffset - 1; i >= 0; i--) {
      const d = new Date(year, month, -i);
      days.push({ date: localDateKey(d), dayInMonth: d.getDate(), isCurrentMonth: false, isToday: false, isFuture: false, status: 'none' });
    }
    for (let d = 1; d <= lastDay.getDate(); d++) {
      const date = new Date(year, month, d);
      const dateStr = localDateKey(date);
      const dayOfWeek = date.getDay() === 0 ? 6 : date.getDay() - 1;
      const planDay = planDays.find((pd) => pd.day_of_week === dayOfWeek);
      // Week bounds (Mon–Sun) for this cell
      const cellWeekStart = new Date(date);
      cellWeekStart.setDate(date.getDate() - dayOfWeek);
      const cellWeekEnd = new Date(cellWeekStart);
      cellWeekEnd.setDate(cellWeekStart.getDate() + 6);
      const wS = localDateKey(cellWeekStart);
      const wE = localDateKey(cellWeekEnd);
      // Scheduled training day: done if its plan day was completed anywhere in this
      // cell's week (Monday's plan trained on Tuesday still marks Monday). Otherwise
      // fall back to a completion logged on this exact date.
      const completion = (planDay && !planDay.is_rest_day)
        ? completions.find((c) => c.plan_day_id === planDay.id && localDateKey(c.completed_at) >= wS && localDateKey(c.completed_at) <= wE)
        : completions.find((c) => localDateKey(c.completed_at) === dateStr);
      const isFuture = dateStr > todayStr;
      const isToday = dateStr === todayStr;

      let status: DayInfo['status'] = 'none';
      let workoutName: string | undefined;
      if (planDay?.is_rest_day) {
        status = 'rest';
        workoutName = 'Ruhetag';
      } else if (planDay && !planDay.is_rest_day) {
        workoutName = planDay.workout_name ?? 'Training';
        if (completion) status = 'completed';
        else if (isFuture) status = 'planned';
        else if (isToday) status = 'planned';
        else status = 'missed';
      }
      if (completion && !planDay) status = 'completed';

      days.push({ date: dateStr, dayInMonth: d, isCurrentMonth: true, isToday, isFuture, status, workoutName, completion });
    }
    return days;
  }, [calMonth, planDays, completions]);

  // ---- Streak calculation ----
  // Was plan day `pdId` completed anywhere within [wStartKey, wEndKey]?
  const doneInWeek = (pdId: string, wStartKey: string, wEndKey: string) =>
    completions.some((c) => {
      if (c.plan_day_id !== pdId) return false;
      const k = localDateKey(c.completed_at);
      return k >= wStartKey && k <= wEndKey;
    });

  // ---- Streak: consecutive weeks where every due plan day was completed ----
  const streak = useMemo(() => {
    const today = new Date();
    const todayKey = localDateKey(today);
    const dayOfWeek = today.getDay() === 0 ? 6 : today.getDay() - 1;
    const nonRest = planDays.filter((pd) => !pd.is_rest_day);
    if (nonRest.length === 0) return 0;
    let weeks = 0;
    for (let w = 0; w < 52; w++) {
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - dayOfWeek - w * 7);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      const wStartKey = localDateKey(weekStart);
      const wEndKey = localDateKey(weekEnd);
      let allDone = true;
      let anyDue = false;
      for (const pd of nonRest) {
        const due = new Date(weekStart);
        due.setDate(weekStart.getDate() + pd.day_of_week);
        if (localDateKey(due) > todayKey) continue; // not due yet
        anyDue = true;
        if (!doneInWeek(pd.id, wStartKey, wEndKey)) { allDone = false; break; }
      }
      if (anyDue && allDone) weeks++;
      else if (anyDue) break; // a due training was missed
      // else: current week hasn't started yet — keep checking previous weeks
    }
    return weeks;
  }, [planDays, completions]);

  const hasMissedThisWeek = useMemo(() => {
    const today = new Date();
    const todayKey = localDateKey(today);
    const dayOfWeek = today.getDay() === 0 ? 6 : today.getDay() - 1;
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - dayOfWeek);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    const wStartKey = localDateKey(weekStart);
    const wEndKey = localDateKey(weekEnd);
    for (const pd of planDays) {
      if (pd.is_rest_day) continue;
      const due = new Date(weekStart);
      due.setDate(weekStart.getDate() + pd.day_of_week);
      if (localDateKey(due) >= todayKey) continue; // only past due days
      if (!doneInWeek(pd.id, wStartKey, wEndKey)) return true;
    }
    return false;
  }, [planDays, completions]);

  // ---- Weekly fulfillment (plan days completed this week, by plan day) ----
  const weeklyFulfillment = useMemo(() => {
    const today = new Date();
    const dayOfWeek = today.getDay() === 0 ? 6 : today.getDay() - 1;
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - dayOfWeek);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    const wStartKey = localDateKey(weekStart);
    const wEndKey = localDateKey(weekEnd);
    const nonRest = planDays.filter((pd) => !pd.is_rest_day);
    const completed = nonRest.filter((pd) => doneInWeek(pd.id, wStartKey, wEndKey)).length;
    return { planned: nonRest.length, completed };
  }, [planDays, completions]);

  // ---- Muscle group heatmap (this week) ----
  const muscleHeatmap = useMemo(() => {
    const today = new Date();
    const dayOfWeek = today.getDay() === 0 ? 6 : today.getDay() - 1;
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - dayOfWeek);
    const weekStartStr = localDateKey(weekStart);

    const groupSets = new Map<string, number>();
    for (const log of setLogs) {
      const logDate = localDateKey(log.created_at);
      if (logDate < weekStartStr) continue;
      const exercise = libMap?.get(log.exercise_name);
      const group = exercise?.muscle_group ?? 'Sonstiges';
      groupSets.set(group, (groupSets.get(group) ?? 0) + 1);
    }
    return Array.from(groupSets.entries())
      .map(([group, sets]) => ({ group, sets }))
      .sort((a, b) => b.sets - a.sets);
  }, [setLogs, libMap]);

  // ---- Total stats ----
  const totalWorkouts = completions.length;
  const nextMilestone = useMemo(() => {
    const milestones = [10, 25, 50, 100, 250, 500];
    return milestones.find((m) => m > totalWorkouts);
  }, [totalWorkouts]);

  // ---- Plateau detection ----
  const plateaus = useMemo<PlateauAlert[]>(() => {
    const alerts: PlateauAlert[] = [];

    // Weight plateau: <0.5% change over 3+ weeks
    const weightEntries = entries.filter((e) => e.weight_kg != null);
    if (weightEntries.length >= 2) {
      const threeWeeksAgo = new Date();
      threeWeeksAgo.setDate(threeWeeksAgo.getDate() - 21);
      const recent = weightEntries.filter((e) => new Date(e.logged_at) >= threeWeeksAgo);
      const older = weightEntries.filter((e) => new Date(e.logged_at) < threeWeeksAgo);
      if (older.length > 0 && recent.length > 0) {
        const oldAvg = older.reduce((a, e) => a + (e.weight_kg ?? 0), 0) / older.length;
        const recentAvg = recent.reduce((a, e) => a + (e.weight_kg ?? 0), 0) / recent.length;
        const change = Math.abs(recentAvg - oldAvg) / oldAvg;
        if (change < 0.005) {
          alerts.push({
            type: 'weight',
            title: 'Gewicht stagniert',
            message: 'Dein Gewicht ist seit 3 Wochen stabil. Das ist normal — dein Körper passt sich an. Eine 1-2-wöchige Pause auf Erhaltungskalorien kann helfen, danach geht es weiter.',
            icon: AlertCircle,
          });
        }
      }
    }

    // Strength plateau: no increase over 3+ sessions for an exercise
    const byExercise = new Map<string, ExerciseSetLog[]>();
    for (const log of setLogs) {
      const arr = byExercise.get(log.exercise_name) ?? [];
      arr.push(log);
      byExercise.set(log.exercise_name, arr);
    }
    for (const [name, logs] of byExercise) {
      const withWeight = logs.filter((l) => l.weight_kg != null);
      if (withWeight.length >= 4) {
        const recent3 = withWeight.slice(-3);
        const maxRecent = Math.max(...recent3.map((l) => l.weight_kg ?? 0));
        const beforeRecent = withWeight.slice(0, -3);
        if (beforeRecent.length > 0) {
          const maxBefore = Math.max(...beforeRecent.map((l) => l.weight_kg ?? 0));
          if (maxRecent <= maxBefore) {
            alerts.push({
              type: 'strength',
              title: `${name}: Kraft stagniert`,
              message: `Bei ${name} hast du seit 3 Einheiten nicht gesteigert. Probier eine Übungsvariante oder leg eine Deload-Woche ein — danach wirst du wieder stärker.`,
              icon: TrendingUp,
            });
            break;
          }
        }
      }
    }

    // Energy/mood: consistently low (1-2/5) over 4+ days
    const recentCheckins = checkins.slice(0, 7);
    const lowDays = recentCheckins.filter((c) => c.energy <= 2 && c.mood <= 2);
    if (lowDays.length >= 4) {
      alerts.push({
        type: 'energy',
        title: 'Energie niedrig',
        message: 'Du fühlst dich seit mehreren Tagen müde. Das kann ein Zeichen von Übermüdung sein. Ein Ruhetag oder leichtes Training könnte helfen. Hör auf deinen Körper.',
        icon: AlertCircle,
      });
    }

    return alerts;
  }, [entries, setLogs, checkins]);

  // ---- Selected day detail ----
  const selectedDayInfo = useMemo(() => {
    if (!selectedDay) return null;
    return calendarDays.find((d) => d.date === selectedDay);
  }, [selectedDay, calendarDays]);

  const selectedDayLogs = useMemo(() => {
    if (!selectedDay) return [];
    return setLogs.filter((l) => localDateKey(l.created_at) === selectedDay);
  }, [selectedDay, setLogs]);

  const selectedDayCheckin = useMemo(() => {
    if (!selectedDay) return null;
    return checkins.find((c) => localDateKey(c.logged_at) === selectedDay);
  }, [selectedDay, checkins]);

  if (loading) return <Loading />;

  const weekPct = weeklyFulfillment.planned > 0 ? (weeklyFulfillment.completed / weeklyFulfillment.planned) * 100 : 0;

  return (
    <div className="adlr-fade-in">
      <SectionHeader title="Profil" subtitle="Dein Trainingsweg." />

      {/* Streak */}
      <Card className="mb-5 adlr-gold-border">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: 'rgb(var(--adlr-gold) / 0.15)' }}>
            <Flame size={28} className="text-adlr-gold" />
          </div>
          <div className="flex-1">
            <p className="text-2xl font-bold text-white">{streak} <span className="text-sm text-white/50 font-normal">Wochen-Streak</span></p>
            <p className="text-xs text-white/40 mt-0.5">
              {hasMissedThisWeek && streak === 0
                ? 'Ein verpasstes Training ist kein Rückschlag — morgen geht es weiter.'
                : streak > 0
                ? 'Kein geplantes Training verpasst. Bleib dran!'
                : 'Starte deine Streak — schließe dein nächstes Training ab.'}
            </p>
          </div>
        </div>
      </Card>

      {/* Weekly fulfillment */}
      <Card className="mb-5">
        <p className="text-sm font-medium text-white/80 mb-3 flex items-center gap-2"><Target size={16} className="text-adlr-gold" /> Diese Woche</p>
        <div className="flex items-center gap-4">
          <div className="relative w-20 h-20 flex-shrink-0">
            <svg width="80" height="80" viewBox="0 0 80 80">
              <circle cx="40" cy="40" r="34" stroke="rgb(var(--text) / 0.12)" strokeWidth="6" fill="none" />
              <circle
                cx="40" cy="40" r="34" stroke="rgb(var(--adlr-gold))" strokeWidth="6" fill="none"
                strokeDasharray={`${2 * Math.PI * 34}`}
                strokeDashoffset={`${2 * Math.PI * 34 * (1 - weekPct / 100)}`}
                strokeLinecap="round"
                transform="rotate(-90 40 40)"
                style={{ transition: 'stroke-dashoffset 0.5s ease' }}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-sm font-bold adlr-gold-text">{weeklyFulfillment.completed}/{weeklyFulfillment.planned}</span>
            </div>
          </div>
          <div className="flex-1">
            <p className="text-sm text-white/70">
              {weeklyFulfillment.completed} von {weeklyFulfillment.planned} geplanten Trainings abgeschlossen
            </p>
            <p className="text-xs text-white/40 mt-1">
              {weekPct === 100 ? 'Perfekte Woche!' : weekPct >= 50 ? 'Gut unterwegs.' : 'Noch ein paar Trainings offen.'}
            </p>
          </div>
        </div>
      </Card>

      {/* Monthly calendar */}
      <Card className="mb-5">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-medium text-white/80 flex items-center gap-2"><Calendar size={16} className="text-adlr-gold" /> Kalender</p>
          <div className="flex items-center gap-2">
            <button onClick={() => setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1))} className="adlr-tap p-1.5 rounded-lg bg-white/5 text-white/50">
              <ChevronLeft size={16} />
            </button>
            <span className="text-xs text-white/70 min-w-[80px] text-center">{MONTH_NAMES[calMonth.getMonth()]} {calMonth.getFullYear()}</span>
            <button onClick={() => setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1))} className="adlr-tap p-1.5 rounded-lg bg-white/5 text-white/50">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-1 mb-2">
          {DAY_NAMES.map((d) => (
            <div key={d} className="text-center text-[10px] text-white/30 uppercase">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {calendarDays.map((day, i) => {
            const bg = !day.isCurrentMonth ? 'transparent'
              : day.status === 'completed' ? 'rgba(34,197,94,0.2)'
              : day.status === 'rest' ? 'rgb(var(--text) / 0.05)'
              : day.status === 'missed' ? 'rgba(251,146,60,0.15)'
              : day.status === 'planned' ? 'rgb(var(--adlr-gold) / 0.08)'
              : 'transparent';
            const border = day.isToday ? '1px solid rgb(var(--adlr-gold))' : '1px solid transparent';
            const dotColor = day.status === 'completed' ? '#22c55e'
              : day.status === 'rest' ? '#666'
              : day.status === 'missed' ? '#fb923c'
              : day.status === 'planned' ? 'rgb(var(--adlr-gold))'
              : 'transparent';
            return (
              <button
                key={i}
                onClick={() => day.isCurrentMonth && setSelectedDay(day.date)}
                className={`aspect-square rounded-lg flex flex-col items-center justify-center adlr-tap transition-all ${day.isCurrentMonth ? 'cursor-pointer' : 'cursor-default'}`}
                style={{ background: bg, border }}
              >
                <span className={`text-xs ${day.isCurrentMonth ? 'text-white/70' : 'text-white/20'}`}>{day.dayInMonth}</span>
                {day.isCurrentMonth && day.status !== 'none' && (
                  <span className="w-1 h-1 rounded-full mt-0.5" style={{ background: dotColor }} />
                )}
              </button>
            );
          })}
        </div>
        {/* Legend */}
        <div className="flex flex-wrap gap-3 mt-4 text-[10px] text-white/40">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500" /> Training</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-400" /> Verpasst</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-white/30" /> Ruhetag</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-adlr-gold" /> Geplant</span>
        </div>
      </Card>

      {/* Muscle group heatmap */}
      {muscleHeatmap.length > 0 && (
        <Card className="mb-5">
          <p className="text-sm font-medium text-white/80 mb-3 flex items-center gap-2"><TrendingUp size={16} className="text-adlr-gold" /> Muskelgruppen diese Woche</p>
          <div className="space-y-2.5">
            {muscleHeatmap.map((m) => {
              const maxSets = Math.max(...muscleHeatmap.map((x) => x.sets));
              const pct = maxSets > 0 ? (m.sets / maxSets) * 100 : 0;
              return (
                <div key={m.group} className="flex items-center gap-3">
                  <span className="text-xs text-white/70 w-20 shrink-0">{m.group}</span>
                  <div className="flex-1 h-6 rounded-md bg-white/5 overflow-hidden">
                    <div
                      className="h-full rounded-md transition-all duration-500"
                      style={{ width: `${pct}%`, background: 'linear-gradient(90deg, rgb(var(--adlr-gold) / 0.4), rgb(var(--adlr-gold)))' }}
                    />
                  </div>
                  <span className="text-xs text-adlr-gold font-medium w-8 text-right">{m.sets}</span>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Total stats */}
      <Card className="mb-5">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: 'rgb(var(--adlr-gold) / 0.1)' }}>
            <Trophy size={24} className="text-adlr-gold" />
          </div>
          <div>
            <p className="text-2xl font-bold text-white">{totalWorkouts}</p>
            <p className="text-xs text-white/40">Trainings abgeschlossen</p>
          </div>
        </div>
        {nextMilestone && (
          <div className="mt-3 pt-3 border-t border-white/5">
            <p className="text-xs text-adlr-gold/70">
              Noch {nextMilestone - totalWorkouts} Trainings bis zum {nextMilestone}. Meilenstein.
            </p>
          </div>
        )}
      </Card>

      {/* Plateau detection */}
      {plateaus.length > 0 && (
        <div className="space-y-3 mb-5">
          {plateaus.map((alert, i) => (
            <div key={i} className="adlr-card p-4" style={{ background: 'rgba(251,146,60,0.05)', border: '1px solid rgba(251,146,60,0.15)' }}>
              <div className="flex items-start gap-3">
                <alert.icon size={18} className="text-orange-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-white/90">{alert.title}</p>
                  <p className="text-xs text-white/60 mt-1 leading-relaxed">{alert.message}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Appearance / theme */}
      <Card className="mb-5">
        <div className="flex items-center gap-3 mb-3">
          <Palette size={18} className="text-adlr-gold" />
          <p className="text-sm font-medium text-white/80">Erscheinungsbild</p>
        </div>
        <ThemeSwitcher />
      </Card>

      {/* Danger zone — account deletion (required by App Store & Play) */}
      <Card className="mb-5" style={{ border: '1px solid rgba(239,68,68,0.2)' }}>
        <div className="flex items-center gap-3 mb-2">
          <Trash2 size={18} className="text-red-400" />
          <p className="text-sm font-medium text-white/80">Konto löschen</p>
        </div>
        <p className="text-xs text-white/50 leading-relaxed mb-3">
          Dein Konto und alle deine Daten (Trainings, Fortschritt, Fotos) werden dauerhaft gelöscht. Dies kann nicht rückgängig gemacht werden.
        </p>
        {deleteErr && <p className="text-xs text-red-400 mb-2">{deleteErr}</p>}
        <button
          onClick={handleDeleteAccount}
          disabled={deleting}
          className="adlr-tap w-full py-2.5 rounded-xl text-sm font-medium transition-all disabled:opacity-50"
          style={confirmDelete
            ? { background: 'rgb(239,68,68)', color: '#fff' }
            : { background: 'rgba(239,68,68,0.1)', color: 'rgb(248,113,113)', border: '1px solid rgba(239,68,68,0.3)' }}
        >
          {deleting ? 'Wird gelöscht…' : confirmDelete ? 'Wirklich löschen? Tippe erneut' : 'Konto endgültig löschen'}
        </button>
      </Card>

      {/* Day detail modal */}
      {selectedDay && selectedDayInfo && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setSelectedDay(null)}>
          <div className="w-full max-w-md max-h-[80vh] overflow-y-auto adlr-card rounded-t-2xl sm:rounded-2xl p-5 adlr-fade-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm font-medium text-white">
                  {new Date(selectedDay).toLocaleDateString('de-AT', { weekday: 'long', day: '2-digit', month: 'long' })}
                </p>
                <p className="text-xs text-white/40 mt-0.5">{selectedDayInfo.workoutName ?? 'Kein Training geplant'}</p>
              </div>
              <button onClick={() => setSelectedDay(null)} className="adlr-tap p-1.5 rounded-lg bg-white/5 text-white/50">
                <X size={18} />
              </button>
            </div>

            {selectedDayInfo.status === 'completed' && (
              <div className="flex items-center gap-2 mb-3 text-green-500 text-sm">
                <span className="w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center text-xs">✓</span>
                Training abgeschlossen
              </div>
            )}
            {selectedDayInfo.status === 'missed' && (
              <div className="flex items-center gap-2 mb-3 text-orange-400 text-sm">
                <span className="w-5 h-5 rounded-full bg-orange-400/20 flex items-center justify-center text-xs">!</span>
                Geplantes Training verpasst
              </div>
            )}
            {selectedDayInfo.status === 'rest' && (
              <div className="flex items-center gap-2 mb-3 text-white/50 text-sm">
                <span className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-xs">−</span>
                Ruhetag
              </div>
            )}

            {/* Exercise logs for this day */}
            {selectedDayLogs.length > 0 ? (
              <div className="space-y-3 mb-4">
                <p className="text-xs text-white/40 uppercase tracking-wide">Übungen</p>
                {(() => {
                  const byExercise = new Map<string, ExerciseSetLog[]>();
                  for (const log of selectedDayLogs) {
                    const arr = byExercise.get(log.exercise_name) ?? [];
                    arr.push(log);
                    byExercise.set(log.exercise_name, arr);
                  }
                  return Array.from(byExercise.entries()).map(([name, logs]) => (
                    <div key={name} className="py-2 border-b border-white/5 last:border-0">
                      <p className="text-sm text-white/90 font-medium">{name}</p>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {logs.sort((a, b) => a.set_number - b.set_number).map((l) => (
                          <span key={l.id} className="text-xs text-white/50 bg-white/5 px-2 py-1 rounded-md">
                            Satz {l.set_number}: {l.weight_kg ?? '—'} kg × {l.reps ?? '—'} Wdh
                          </span>
                        ))}
                      </div>
                    </div>
                  ));
                })()}
              </div>
            ) : selectedDayInfo.status === 'completed' ? (
              <p className="text-sm text-white/30 mb-4">Keine Übungsdaten für dieses Training.</p>
            ) : null}

            {/* Check-in for this day */}
            {selectedDayCheckin && (
              <div className="pt-3 border-t border-white/5">
                <p className="text-xs text-white/40 uppercase tracking-wide mb-2">Check-in</p>
                <div className="flex gap-4">
                  <div className="flex-1 text-center py-2 rounded-lg bg-white/5">
                    <p className="text-lg font-bold text-white">{selectedDayCheckin.energy}/5</p>
                    <p className="text-[10px] text-white/40 uppercase">Energie</p>
                  </div>
                  <div className="flex-1 text-center py-2 rounded-lg bg-white/5">
                    <p className="text-lg font-bold text-white">{selectedDayCheckin.mood}/5</p>
                    <p className="text-[10px] text-white/40 uppercase">Stimmung</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
