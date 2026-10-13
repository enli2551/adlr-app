import { supabase } from '@/lib/supabase';
import { refreshCoachLibrary } from '@/lib/exercises';

// Coach videos (own exercises + own demo for any library exercise) live in the private
// 'exercise-videos' bucket under the coach's folder; the coach's clients may read them.

export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
const BUCKET = 'exercise-videos';

const slug = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'video';

export async function uploadCoachVideo(trainerId: string, exerciseName: string, file: File): Promise<{ path?: string; error?: string }> {
  if (file.size > MAX_VIDEO_BYTES) return { error: 'too_large' };
  const ext = (file.name.split('.').pop() || 'mp4').toLowerCase().replace(/[^a-z0-9]/g, '') || 'mp4';
  const path = `${trainerId}/${slug(exerciseName)}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || 'video/mp4' });
  return error ? { error: error.message } : { path };
}

export async function removeCoachVideoFile(path: string | null | undefined): Promise<void> {
  if (!path) return;
  await supabase.storage.from(BUCKET).remove([path]).catch(() => {});
}

export async function signedCoachVideo(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

/** The coach's own video for a library exercise (replaces the animation for their clients). */
export async function setLibraryVideo(trainerId: string, exerciseName: string, file: File): Promise<string | null> {
  const up = await uploadCoachVideo(trainerId, exerciseName, file);
  if (!up.path) return up.error ?? 'error';
  const { data: old } = await supabase.from('coach_exercise_media').select('video_path').eq('trainer_id', trainerId).eq('exercise_name', exerciseName).maybeSingle();
  const { error } = await supabase.from('coach_exercise_media').upsert({ trainer_id: trainerId, exercise_name: exerciseName, video_path: up.path }, { onConflict: 'trainer_id,exercise_name' });
  if (error) { await removeCoachVideoFile(up.path); return error.message; }
  if (old?.video_path) await removeCoachVideoFile(old.video_path as string);
  await refreshCoachLibrary();
  return null;
}

export async function clearLibraryVideo(trainerId: string, exerciseName: string): Promise<void> {
  const { data: old } = await supabase.from('coach_exercise_media').select('video_path').eq('trainer_id', trainerId).eq('exercise_name', exerciseName).maybeSingle();
  await supabase.from('coach_exercise_media').delete().eq('trainer_id', trainerId).eq('exercise_name', exerciseName);
  if (old?.video_path) await removeCoachVideoFile(old.video_path as string);
  await refreshCoachLibrary();
}
