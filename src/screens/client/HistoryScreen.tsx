import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import type { WorkoutCompletion, ExerciseSetLog } from '@/lib/types';
import { SectionHeader, Loading } from '@/components/ui';
import TrainingHistory from '@/components/TrainingHistory';
import { fetchExercises } from '@/lib/exercises';
import { useAsyncData } from '@/lib/useAsyncData';
import { t } from '@/lib/i18n';
import { requestRepeat } from '@/lib/repeatWorkout';

// Client's full training log ("Verlauf"): every completed session, tap for the recap.
export default function HistoryScreen() {
  const { profile } = useAuth();
  const nav = useNavigate();
  const [loading, setLoading] = useState(true);
  const [completions, setCompletions] = useState<WorkoutCompletion[]>([]);
  const [setLogs, setSetLogs] = useState<ExerciseSetLog[]>([]);
  const [dayNameById, setDayNameById] = useState<Map<string, string>>(new Map());
  const { data: library } = useAsyncData(fetchExercises, []);

  useEffect(() => {
    if (!profile) return;
    (async () => {
      const [wc, sl] = await Promise.all([
        supabase.from('workout_completions').select('*').eq('client_id', profile.id).order('completed_at', { ascending: false }),
        supabase.from('exercise_set_logs').select('*').eq('client_id', profile.id).order('created_at', { ascending: true }),
      ]);
      const comps = (wc.data ?? []) as WorkoutCompletion[];
      // Names come from the plan day each session was done from (also older plans).
      const dayIds = [...new Set(comps.map((c) => c.plan_day_id).filter((x): x is string => !!x))];
      if (dayIds.length > 0) {
        const { data: pd } = await supabase.from('plan_days').select('id, workout_name').in('id', dayIds);
        setDayNameById(new Map((pd ?? []).map((d: { id: string; workout_name: string | null }) => [d.id, d.workout_name ?? 'Training'])));
      }
      setCompletions(comps);
      setSetLogs((sl.data ?? []) as ExerciseSetLog[]);
      setLoading(false);
    })();
  }, [profile?.id]);

  const muscleByName = useMemo(() => new Map((library ?? []).map((e) => [e.name, e.muscle_group])), [library]);
  const muscleOf = useCallback((n: string) => muscleByName.get(n) ?? 'Sonstige', [muscleByName]);

  return (
    <div className="adlr-fade-in">
      <button onClick={() => nav(-1)} className="adlr-tap flex items-center gap-1 text-sm text-white/50 mb-2 -ml-1">
        <ChevronLeft size={18} /> {t('Zurück')}
      </button>
      <SectionHeader title={t('Verlauf')} subtitle={t(completions.length === 1 ? '{n} Training insgesamt' : '{n} Trainings insgesamt', { n: completions.length })} />
      {loading ? <Loading /> : (
        <TrainingHistory completions={completions} setLogs={setLogs} dayNameById={dayNameById} muscleOf={muscleOf}
          onRepeat={(s) => { requestRepeat(s.name, s.exercises); nav('/app'); }} />
      )}
    </div>
  );
}
