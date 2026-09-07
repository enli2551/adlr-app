export type Role = 'trainer' | 'client';

export interface Profile {
  id: string;
  role: Role;
  trainer_id: string | null;
  intake_completed: boolean;
  first_name: string | null;
  last_name: string | null;
  age: number | null;
  height_cm: number | null;
  weight_kg: number | null;
  gender: string | null;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  intake: IntakeData;
  streak: number;
  last_active: string | null;
  created_at: string;
}

export interface IntakeData {
  // Step 1
  firstName?: string;
  lastName?: string;
  age?: number;
  heightCm?: number;
  weightKg?: number;
  gender?: string;
  email?: string;
  phone?: string;
  avatarUrl?: string;
  // Step 2
  activityLevel?: number;
  injuries?: string[];
  sleepQuality?: number;
  stressLevel?: number;
  jobType?: string;
  // Step 3
  goals?: string[];
  customGoal?: string;
  // Step 4
  trainingDays?: number[];
  trainingTime?: string;
  experience?: string;
  equipment?: string;
  // Step 5
  eatingHabits?: number;
  dietRestrictions?: string[];
  waterIntake?: string;
  alcohol?: string;
  // Step 6
  whyNow?: string;
  commitmentLevel?: number;
  referralSource?: string;
}

export interface Plan {
  id: string;
  trainer_id: string;
  name: string;
  is_template: boolean;
  created_at: string;
}

export interface PlanDay {
  id: string;
  plan_id: string;
  day_of_week: number;
  workout_name: string | null;
  focus: string | null;
  difficulty: number;
  duration_min: number | null;
  notes: string | null;
  exercises: Exercise[];
  is_rest_day: boolean;
}

export interface Exercise {
  name: string;
  sets?: number;
  reps?: number;
  weight_kg?: number;
  set_details?: { weight_kg?: number; reps?: number }[]; // per-set weight/reps (pyramid etc.)
  rest_sec?: number;
  tempo?: string;
  notes?: string;
  alternatives?: string[]; // up to 2 fallback exercises (same muscle group)
}

export interface ClientPlan {
  id: string;
  client_id: string;
  plan_id: string;
  assigned_at: string;
  is_active: boolean;
}

export interface WorkoutCompletion {
  id: string;
  client_id: string;
  plan_day_id: string | null;
  completed_at: string;
  duration_sec?: number | null;
}

export interface ProgressEntry {
  id: string;
  client_id: string;
  weight_kg: number | null;
  waist_cm: number | null;
  chest_cm: number | null;
  hips_cm: number | null;
  arm_cm: number | null;
  thigh_cm: number | null;
  logged_at: string;
}

export interface ProgressPhoto {
  id: string;
  client_id: string;
  storage_path: string;
  photo_date: string;
  label: string | null;
}

export interface PersonalRecord {
  id: string;
  client_id: string;
  exercise_name: string;
  weight_kg: number;
  reps: number;
  achieved_at: string;
}

export interface DailyCheckin {
  id: string;
  client_id: string;
  energy: number;
  mood: number;
  note: string | null;
  logged_at: string;
}

export interface NutritionTip {
  id: string;
  client_id: string;
  tip: string;
  updated_at: string;
}

export interface HydrationLog {
  id: string;
  client_id: string;
  glasses: number;
  log_date: string;
}

export interface Message {
  id: string;
  client_id: string;
  sender: 'client' | 'trainer';
  body: string;
  sent_at: string;
}

export interface WeeklyMessage {
  id: string;
  client_id: string;
  body: string;
  created_at: string;
}

export interface Session {
  id: string;
  client_id: string;
  trainer_id: string;
  scheduled_at: string;
  duration_min: number;
  location: string;
  status: 'scheduled' | 'completed' | 'cancelled';
}

export interface SessionNote {
  id: string;
  client_id: string;
  trainer_id: string;
  body: string;
  created_at: string;
}

export interface UpsellRequest {
  id: string;
  client_id: string;
  upgrade_key: string;
  status: 'pending' | 'completed' | 'declined';
  created_at: string;
}

export interface ExerciseLibItem {
  id: string;
  trainer_id: string;
  name: string;
  muscle_group: string | null;
  sets: number | null;
  reps: number | null;
  rest_sec: number | null;
  tempo: string | null;
  description: string | null;
}

export interface BusinessRevenue {
  id: string;
  trainer_id: string;
  amount: number;
  source: string | null;
  month_date: string;
  note: string | null;
}

export interface ExerciseSetLog {
  id: string;
  client_id: string;
  workout_completion_id: string | null;
  plan_day_id: string | null;
  exercise_name: string;
  set_number: number;
  weight_kg: number | null;
  reps: number | null;
  created_at: string;
}

export interface NutritionPrincipleCheckin {
  id: string;
  client_id: string;
  principle: string;
  adhered: boolean;
  log_date: string;
  created_at: string;
}
