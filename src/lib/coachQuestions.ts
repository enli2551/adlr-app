import { supabase } from '@/lib/supabase';

// Coaches' own questions (migration 20261013e_coach_questions.sql): asked once in the intake
// (Kennenlernen) or every week in the check-in. Answers keep a copy of the question text.

export type QuestionContext = 'intake' | 'checkin';
export type QuestionKind = 'text' | 'scale' | 'choice' | 'yesno' | 'number';

export interface CoachQuestion {
  id: string;
  trainer_id: string;
  context: QuestionContext;
  label: string;
  kind: QuestionKind;
  options: string[] | null;
  required: boolean;
  position: number;
}

export type AnswerValue = string | number | boolean | null;
export interface CustomAnswer { id: string; q: string; kind: QuestionKind; a: AnswerValue }

/** The questions of one coach for a context ([] when none, or the migration isn't run yet). */
export async function loadQuestions(trainerId: string | null | undefined, context: QuestionContext): Promise<CoachQuestion[]> {
  if (!trainerId) return [];
  const { data, error } = await supabase.from('coach_questions').select('*')
    .eq('trainer_id', trainerId).eq('context', context).order('position').order('created_at');
  return error ? [] : ((data ?? []) as CoachQuestion[]);
}

export const isAnswered = (v: AnswerValue | undefined) => v !== null && v !== undefined && !(typeof v === 'string' && !v.trim());

export function missingRequired(questions: CoachQuestion[], values: Record<string, AnswerValue>): boolean {
  return questions.some((q) => q.required && !isAnswered(values[q.id]));
}

/** Answers as stored: only answered questions, with the question text at the time. */
export function toAnswers(questions: CoachQuestion[], values: Record<string, AnswerValue>): CustomAnswer[] {
  return questions.filter((q) => isAnswered(values[q.id])).map((q) => {
    const v = values[q.id];
    return { id: q.id, q: q.label, kind: q.kind, a: q.kind === 'number' ? Number(v) : typeof v === 'string' ? v.trim() : v };
  });
}

/** Intake answers saved on the profile. */
export const intakeAnswers = (intake: unknown): CustomAnswer[] => ((intake as { custom?: CustomAnswer[] } | null)?.custom ?? []);

/** Intake questions the client hasn't seen yet (answered or deliberately left empty). */
export function openIntakeQuestions(questions: CoachQuestion[], intake: unknown): CoachQuestion[] {
  const seen = new Set([...intakeAnswers(intake).map((a) => a.id), ...((intake as { custom_seen?: string[] } | null)?.custom_seen ?? [])]);
  return questions.filter((q) => !seen.has(q.id));
}

/** Merge the answers into profiles.intake (custom + custom_seen). */
export async function saveIntakeAnswers(uid: string, intake: unknown, questions: CoachQuestion[], values: Record<string, AnswerValue>) {
  const base = (intake ?? {}) as Record<string, unknown> & { custom?: CustomAnswer[]; custom_seen?: string[] };
  const fresh = toAnswers(questions, values);
  const ids = new Set(questions.map((q) => q.id));
  const custom = [...(base.custom ?? []).filter((a) => !ids.has(a.id)), ...fresh];
  const custom_seen = Array.from(new Set([...(base.custom_seen ?? []), ...ids]));
  return supabase.from('profiles').update({ intake: { ...base, custom, custom_seen } }).eq('id', uid);
}
