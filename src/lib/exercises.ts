import { supabase } from '@/lib/supabase';

export interface ExerciseRow {
  id: number;
  name: string;
  muscle_group: string;
  equipment: string;
  tempo: string;
  default_sets: number;
  default_reps: number;
  default_rest_sec: number;
  exercise_id: string;
  cues: string[];
}

export const MUSCLE_GROUPS = [
  'Brust', 'Rücken', 'Beine', 'Schultern', 'Arme', 'Core', 'Po', 'Cardio', 'Nacken', 'Unterarme',
];

let cache: ExerciseRow[] | null = null;

export async function fetchExercises(): Promise<ExerciseRow[]> {
  if (cache) return cache;
  const { data, error } = await supabase
    .from('exercises')
    .select('id, name, muscle_group, equipment, tempo, default_sets, default_reps, default_rest_sec, exercise_id, cues')
    .order('name');
  if (error) throw error;
  cache = (data ?? []) as ExerciseRow[];
  return cache;
}

export function clearExerciseCache() {
  cache = null;
}
