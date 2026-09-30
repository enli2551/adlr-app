import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import type { WorkoutCompletion, PlanDay, DailyCheckin, ProgressEntry, ExerciseSetLog } from '@/lib/types';
import { Card, Loading } from '@/components/ui';
import { Flame, Calendar, Trophy, TrendingUp, AlertCircle, ChevronLeft, ChevronRight, X, Target, Palette, Trash2, History, Languages, UserPlus } from 'lucide-react';
import { fetchExercises } from '@/lib/exercises';
import { useAsyncData } from '@/lib/useAsyncData';
import { localDateKey } from '@/lib/dates';
import HealthConnectCard from '@/components/HealthConnectCard';
import MyPackageCard from '@/components/business/MyPackageCard';
import ThemeSwitcher from '@/components/ThemeSwitcher';
import { t, fmtDate } from '@/lib/i18n';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { createPortal } from 'react-dom';
import { THEMES, getTheme } from '@/lib/theme';
import { LANGS, useLang } from '@/lib/i18n';
import { JoinCoachSheet } from '@/components/CoachLink';

const DAY_NAMES = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

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
  const { profile, signOut, coach } = useAuth();
  const nav = useNavigate();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [sheet, setSheet] = useState<'coach' | 'theme' | 'lang' | 'delete' | null>(null);
  const [themeId, setThemeId] = useState(getTheme());
  const lang = useLang();
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
      setDeleteErr(t('Löschen fehlgeschlagen. Bitte später erneut versuchen.'));
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

  // ---- Week helpers ----
  // Plans are a flexible rotation ("Trainingstag N"), NOT bound to weekdays: the plan
  // defines a weekly TARGET (number of training days), and any completion on any date
  // counts toward the week it happened in. day_of_week only orders the plan days.
  const trainingsPerWeek = planDays.filter((pd) => !pd.is_rest_day).length;
  const weekBounds = (ref: Date) => {
    const dow = ref.getDay() === 0 ? 6 : ref.getDay() - 1;
    const start = new Date(ref);
    start.setDate(ref.getDate() - dow);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { startKey: localDateKey(start), endKey: localDateKey(end), dow };
  };
  const countInRange = (startKey: string, endKey: string) =>
    completions.filter((c) => {
      const k = localDateKey(c.completed_at);
      return k >= startKey && k <= endKey;
    }).length;

  // ---- Calendar ----
  // Purely date-based: a day is green when a training was actually logged on it.
  const calendarDays: DayInfo[] = useMemo(() => {
    const year = calMonth.getFullYear();
    const month = calMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startOffset = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
    const todayStr = localDateKey(new Date());
    const nameById = new Map(planDays.map((pd) => [pd.id, pd.workout_name ?? t('Training')]));

    const days: DayInfo[] = [];
    // Previous month padding
    for (let i = startOffset - 1; i >= 0; i--) {
      const d = new Date(year, month, -i);
      days.push({ date: localDateKey(d), dayInMonth: d.getDate(), isCurrentMonth: false, isToday: false, isFuture: false, status: 'none' });
    }
    for (let d = 1; d <= lastDay.getDate(); d++) {
      const date = new Date(year, month, d);
      const dateStr = localDateKey(date);
      const dayCompletions = completions.filter((c) => localDateKey(c.completed_at) === dateStr);
      const completion = dayCompletions[0];
      const workoutName = dayCompletions.length > 0
        ? dayCompletions.map((c) => (c.plan_day_id && nameById.get(c.plan_day_id)) || t('Training')).join(' + ')
        : undefined;
      days.push({
        date: dateStr, dayInMonth: d, isCurrentMonth: true,
        isToday: dateStr === todayStr, isFuture: dateStr > todayStr,
        status: completion ? 'completed' : 'none', workoutName, completion,
      });
    }
    return days;
  }, [calMonth, planDays, completions]);

  // ---- Streak: consecutive weeks where the weekly target was reached ----
  // The current week never breaks the streak (it's still in progress).
  const streak = useMemo(() => {
    if (trainingsPerWeek === 0) return 0;
    const today = new Date();
    let weeks = 0;
    for (let w = 0; w < 52; w++) {
      const ref = new Date(today);
      ref.setDate(today.getDate() - w * 7);
      const { startKey, endKey } = weekBounds(ref);
      const reached = countInRange(startKey, endKey) >= trainingsPerWeek;
      if (reached) weeks++;
      else if (w > 0) break;
    }
    return weeks;
  }, [planDays, completions]);

  // Missed = the remaining trainings of this week no longer fit into the days left.
  const hasMissedThisWeek = useMemo(() => {
    if (trainingsPerWeek === 0) return false;
    const { startKey, endKey, dow } = weekBounds(new Date());
    const remaining = trainingsPerWeek - countInRange(startKey, endKey);
    const daysLeft = 7 - dow; // including today
    return remaining > daysLeft;
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
            title: t('Gewicht stagniert'),
            message: t('Dein Gewicht ist seit 3 Wochen stabil. Das ist normal — dein Körper passt sich an. Eine 1-2-wöchige Pause auf Erhaltungskalorien kann helfen, danach geht es weiter.'),
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
              title: t('{name}: Kraft stagniert', { name: t(name) }),
              message: t('Bei {name} hast du seit 3 Einheiten nicht gesteigert. Probier eine Übungsvariante oder leg eine Deload-Woche ein — danach wirst du wieder stärker.', { name: t(name) }),
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
        title: t('Energie niedrig'),
        message: t('Du fühlst dich seit mehreren Tagen müde. Das kann ein Zeichen von Übermüdung sein. Ein Ruhetag oder leichtes Training könnte helfen. Hör auf deinen Körper.'),
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


  return (
    <div className="adlr-fade-in">
      {/* Header: who + three key numbers (the weekly goal itself lives on the training screen) */}
      <div className="flex items-center gap-4 mb-5">
        <div className="w-16 h-16 rounded-full bg-adlr-gold/20 border border-adlr-gold/30 flex items-center justify-center text-adlr-gold text-xl font-bold overflow-hidden shrink-0">
          {profile?.avatar_url ? <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" /> : (profile?.first_name?.[0] ?? '?').toUpperCase()}
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-white truncate">{profile?.first_name ?? t('Profil')} {profile?.last_name ?? ''}</h1>
          {profile?.intake?.goals?.[0] && (
            <p className="text-xs text-adlr-gold/80 mt-0.5 flex items-center gap-1"><Target size={12} /> {t(profile.intake.goals[0])}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-2">
        {[
          { icon: Flame, value: String(streak), label: streak === 1 ? t('Woche in Folge') : t('Wochen in Folge') },
          { icon: Trophy, value: String(totalWorkouts), label: t('Trainings') },
          { icon: Target, value: nextMilestone ? String(nextMilestone - totalWorkouts) : '✓', label: nextMilestone ? t('bis {m} Trainings', { m: nextMilestone }) : t('Alle Meilensteine') },
        ].map((s, i) => (
          <div key={i} className="adlr-card px-3 py-3 text-center">
            <s.icon size={16} className="text-adlr-gold mx-auto mb-1" />
            <p className="text-xl font-bold text-white leading-none">{s.value}</p>
            <p className="text-[10px] text-white/45 mt-1 leading-tight">{s.label}</p>
          </div>
        ))}
      </div>
      <p className="text-xs text-white/40 mb-5 px-1">
        {hasMissedThisWeek && streak === 0
          ? t('Ein verpasstes Training ist kein Rückschlag — morgen geht es weiter.')
          : streak > 0
          ? t('Kein geplantes Training verpasst. Bleib dran!')
          : t('Starte deine Streak — schließe dein nächstes Training ab.')}
      </p>

      {/* Package from the coach (sessions left, validity) */}
      {profile && <MyPackageCard clientId={profile.id} />}

      {/* Apple Health / Health Connect */}
      {profile && <HealthConnectCard clientId={profile.id} />}

      {/* Training log entry */}
      <Card className="mb-5" onClick={() => nav('/app/verlauf')}>
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-white/80 flex items-center gap-2"><History size={16} className="text-adlr-gold" /> {t('Trainings-Verlauf')}</p>
          <span className="flex items-center gap-1 text-xs text-white/40">{t('{n} Trainings', { n: completions.length })} <ChevronRight size={14} /></span>
        </div>
      </Card>

      {/* Monthly calendar */}
      <Card className="mb-5">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-medium text-white/80 flex items-center gap-2"><Calendar size={16} className="text-adlr-gold" /> {t('Kalender')}</p>
          <div className="flex items-center gap-2">
            <button onClick={() => setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1))} className="adlr-tap p-1.5 rounded-lg bg-white/5 text-white/50">
              <ChevronLeft size={16} />
            </button>
            <span className="text-xs text-white/70 min-w-[80px] text-center">{fmtDate(calMonth, { month: 'long', year: 'numeric' })}</span>
            <button onClick={() => setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1))} className="adlr-tap p-1.5 rounded-lg bg-white/5 text-white/50">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-1 mb-2">
          {DAY_NAMES.map((d) => (
            <div key={d} className="text-center text-[10px] text-white/30 uppercase">{t(d)}</div>
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
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500" /> {t('Training')}</span>
        </div>
      </Card>

      {/* Muscle group heatmap */}
      {muscleHeatmap.length > 0 && (
        <Card className="mb-5">
          <p className="text-sm font-medium text-white/80 mb-3 flex items-center gap-2"><TrendingUp size={16} className="text-adlr-gold" /> {t('Muskelgruppen diese Woche')}</p>
          <div className="space-y-2.5">
            {muscleHeatmap.map((m) => {
              const maxSets = Math.max(...muscleHeatmap.map((x) => x.sets));
              const pct = maxSets > 0 ? (m.sets / maxSets) * 100 : 0;
              return (
                <div key={m.group} className="flex items-center gap-3">
                  <span className="text-xs text-white/70 w-20 shrink-0">{t(m.group)}</span>
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

      {/* Settings — compact grouped list; each row opens a bottom sheet */}
      <p className="text-[11px] uppercase tracking-wider text-white/35 mb-2 px-1">{t('Einstellungen')}</p>
      <div className="adlr-card p-0 mb-6 overflow-hidden">
        {[
          { key: 'coach' as const, icon: UserPlus, label: t('Coach'), value: coach?.first_name ?? t('Code eingeben'), danger: false },
          { key: 'theme' as const, icon: Palette, label: t('Erscheinungsbild'), value: THEMES.find((x) => x.id === themeId)?.label ?? '', danger: false },
          { key: 'lang' as const, icon: Languages, label: t('Sprache'), value: LANGS.find((l) => l.id === lang)?.label ?? '', danger: false },
          { key: 'delete' as const, icon: Trash2, label: t('Konto löschen'), value: '', danger: true },
        ].map((row, i) => (
          <button
            key={row.key}
            onClick={() => setSheet(row.key)}
            className="adlr-tap w-full flex items-center gap-3 px-4 py-3.5 text-left"
            style={i > 0 ? { borderTop: '1px solid rgb(var(--text) / 0.06)' } : undefined}
          >
            <row.icon size={17} className={row.danger ? 'text-red-400' : 'text-adlr-gold'} />
            <span className={`flex-1 text-sm ${row.danger ? 'text-red-400' : 'text-white/85'}`}>{row.label}</span>
            {row.value && <span className="text-sm text-white/40">{row.value}</span>}
            <ChevronRight size={16} className="text-white/25" />
          </button>
        ))}
      </div>

      {sheet === 'coach' && <JoinCoachSheet onClose={() => setSheet(null)} />}
      {sheet && sheet !== 'coach' && createPortal(
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/70 px-4 pb-6 adlr-fade-in" onClick={() => { setSheet(null); setConfirmDelete(false); }}>
          <div className="w-full max-w-md rounded-2xl p-5 bg-adlr-anthracite" style={{ border: '1px solid rgb(var(--text) / 0.1)' }} onClick={(e) => e.stopPropagation()}>
            {sheet === 'theme' && (
              <>
                <p className="text-base font-semibold text-white mb-3 flex items-center gap-2"><Palette size={16} className="text-adlr-gold" /> {t('Erscheinungsbild')}</p>
                <div onClick={() => setThemeId(getTheme())}><ThemeSwitcher /></div>
              </>
            )}
            {sheet === 'lang' && (
              <>
                <p className="text-base font-semibold text-white mb-3 flex items-center gap-2"><Languages size={16} className="text-adlr-gold" /> {t('Sprache')}</p>
                <LanguageSwitcher />
              </>
            )}
            {sheet === 'delete' && (
              <>
                <p className="text-base font-semibold text-white mb-2 flex items-center gap-2"><Trash2 size={16} className="text-red-400" /> {t('Konto löschen')}</p>
                <p className="text-xs text-white/55 leading-relaxed mb-4">
                  {t('Dein Konto und alle deine Daten (Trainings, Fortschritt, Fotos) werden dauerhaft gelöscht. Dies kann nicht rückgängig gemacht werden.')}
                </p>
                {deleteErr && <p className="text-xs text-red-400 mb-2">{deleteErr}</p>}
                <button
                  onClick={handleDeleteAccount}
                  disabled={deleting}
                  className="adlr-tap w-full py-3 rounded-xl text-sm font-medium transition-all disabled:opacity-50"
                  style={confirmDelete
                    ? { background: 'rgb(239,68,68)', color: '#fff' }
                    : { background: 'rgba(239,68,68,0.1)', color: 'rgb(248,113,113)', border: '1px solid rgba(239,68,68,0.3)' }}
                >
                  {deleting ? t('Wird gelöscht…') : confirmDelete ? t('Wirklich löschen? Tippe erneut') : t('Konto endgültig löschen')}
                </button>
              </>
            )}
            <button onClick={() => { setSheet(null); setConfirmDelete(false); }} className="adlr-tap w-full mt-3 py-2.5 rounded-xl text-sm text-white/60 bg-white/5">{t('Schließen')}</button>
          </div>
        </div>,
        document.body
      )}

      {/* Day detail modal */}
      {selectedDay && selectedDayInfo && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setSelectedDay(null)}>
          <div className="w-full max-w-md max-h-[80vh] overflow-y-auto adlr-card rounded-t-2xl sm:rounded-2xl p-5 adlr-fade-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm font-medium text-white">
                  {fmtDate(selectedDay, { weekday: 'long', day: '2-digit', month: 'long' })}
                </p>
                <p className="text-xs text-white/40 mt-0.5">{selectedDayInfo.workoutName ?? t('Kein Training geplant')}</p>
              </div>
              <button onClick={() => setSelectedDay(null)} className="adlr-tap p-1.5 rounded-lg bg-white/5 text-white/50">
                <X size={18} />
              </button>
            </div>

            {selectedDayInfo.status === 'completed' && (
              <div className="flex items-center gap-2 mb-3 text-green-500 text-sm">
                <span className="w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center text-xs">✓</span>
                {t('Training abgeschlossen')}
              </div>
            )}
            {selectedDayInfo.status === 'missed' && (
              <div className="flex items-center gap-2 mb-3 text-orange-400 text-sm">
                <span className="w-5 h-5 rounded-full bg-orange-400/20 flex items-center justify-center text-xs">!</span>
                {t('Geplantes Training verpasst')}
              </div>
            )}
            {selectedDayInfo.status === 'rest' && (
              <div className="flex items-center gap-2 mb-3 text-white/50 text-sm">
                <span className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-xs">−</span>
                {t('Ruhetag')}
              </div>
            )}

            {/* Exercise logs for this day */}
            {selectedDayLogs.length > 0 ? (
              <div className="space-y-3 mb-4">
                <p className="text-xs text-white/40 uppercase tracking-wide">{t('Übungen')}</p>
                {(() => {
                  const byExercise = new Map<string, ExerciseSetLog[]>();
                  for (const log of selectedDayLogs) {
                    const arr = byExercise.get(log.exercise_name) ?? [];
                    arr.push(log);
                    byExercise.set(log.exercise_name, arr);
                  }
                  return Array.from(byExercise.entries()).map(([name, logs]) => (
                    <div key={name} className="py-2 border-b border-white/5 last:border-0">
                      <p className="text-sm text-white/90 font-medium">{t(name)}</p>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {logs.sort((a, b) => a.set_number - b.set_number).map((l) => (
                          <span key={l.id} className="text-xs text-white/50 bg-white/5 px-2 py-1 rounded-md">
                            {t('Satz {n}', { n: l.set_number })}: {l.weight_kg ?? '—'} kg × {l.reps ?? '—'} {t('Wdh')}
                          </span>
                        ))}
                      </div>
                    </div>
                  ));
                })()}
              </div>
            ) : selectedDayInfo.status === 'completed' ? (
              <p className="text-sm text-white/30 mb-4">{t('Keine Übungsdaten für dieses Training.')}</p>
            ) : null}

            {/* Check-in for this day */}
            {selectedDayCheckin && (
              <div className="pt-3 border-t border-white/5">
                <p className="text-xs text-white/40 uppercase tracking-wide mb-2">{t('Check-in')}</p>
                <div className="flex gap-4">
                  <div className="flex-1 text-center py-2 rounded-lg bg-white/5">
                    <p className="text-lg font-bold text-white">{selectedDayCheckin.energy}/5</p>
                    <p className="text-[10px] text-white/40 uppercase">{t('Energie')}</p>
                  </div>
                  <div className="flex-1 text-center py-2 rounded-lg bg-white/5">
                    <p className="text-lg font-bold text-white">{selectedDayCheckin.mood}/5</p>
                    <p className="text-[10px] text-white/40 uppercase">{t('Stimmung')}</p>
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
