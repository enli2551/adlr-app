import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import type { IntakeData } from '@/lib/types';
import Logo from '@/components/Logo';
import { Button, Field, Input, Textarea, Chip } from '@/components/ui';
import StepPersonal from './onboarding/StepPersonal';
import StepHealth from './onboarding/StepHealth';
import StepGoals from './onboarding/StepGoals';
import StepTraining from './onboarding/StepTraining';
import StepNutrition from './onboarding/StepNutrition';
import StepMotivation from './onboarding/StepMotivation';
import Completion from './onboarding/Completion';

const HEADERS = [
  'Wer bist du? Lass uns beginnen.',
  'Was trägt dein Körper mit sich?',
  'Wohin willst du?',
  'Wie trainierst du am besten?',
  'Was tankst du?',
  'Was treibt dich an?',
];

const STEPS = 6;

export default function Onboarding() {
  const { profile, refreshProfile, session } = useAuth();
  const nav = useNavigate();
  const [step, setStep] = useState(0); // 0-5 steps, 6 = completion
  const [data, setData] = useState<IntakeData>({});
  const [saving, setSaving] = useState(false);

  const update = (patch: Partial<IntakeData>) => setData((d) => ({ ...d, ...patch }));

  const next = () => setStep((s) => Math.min(s + 1, STEPS));
  const back = () => setStep((s) => Math.max(s - 1, 0));

  const finish = async () => {
    setSaving(true);
    const uid = session?.user.id;
    if (!uid) { setSaving(false); return; }
    // Link client to the trainer via SECURITY DEFINER function (bypasses RLS).
    const { data: trainerId } = await supabase.rpc('get_trainer_id');
    const { error } = await supabase.from('profiles').update({
      intake_completed: true,
      first_name: data.firstName,
      last_name: data.lastName,
      age: data.age,
      height_cm: data.heightCm,
      weight_kg: data.weightKg,
      gender: data.gender,
      email: data.email,
      phone: data.phone,
      avatar_url: data.avatarUrl,
      intake: data,
      trainer_id: trainerId ?? null,
    }).eq('id', uid);
    setSaving(false);
    if (error) { console.error(error); return; }
    await refreshProfile();
    setStep(STEPS); // completion
  };

  // Completion screen
  if (step === STEPS) {
    return <Completion data={data} onContinue={() => nav('/app')} />;
  }

  const progress = ((step + 1) / STEPS) * 100;

  return (
    <div className="min-h-screen flex flex-col">
      {/* Progress bar */}
      <div className="fixed top-0 left-0 right-0 z-20 bg-adlr-black/80 backdrop-blur-md safe-top">
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <button onClick={back} disabled={step === 0} className="text-white/40 text-sm disabled:opacity-0">
            Zurück
          </button>
          <span className="text-xs text-white/40 tracking-widest uppercase">{step + 1} / {STEPS}</span>
          <div className="w-10" />
        </div>
        <div className="h-0.5 bg-white/5 mx-5 mb-0 rounded-full overflow-hidden">
          <div className="h-full bg-adlr-gold transition-all duration-500 ease-out" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="flex-1 px-6 pt-20 pb-32 max-w-md mx-auto w-full">
        <div key={step} className="adlr-slide-in">
          <div className="mb-6">
            <p className="text-xs text-adlr-gold tracking-widest uppercase mb-2">Schritt {step + 1}</p>
            <h1 className="text-2xl font-bold tracking-tight">{HEADERS[step]}</h1>
          </div>

          {step === 0 && <StepPersonal data={data} update={update} />}
          {step === 1 && <StepHealth data={data} update={update} />}
          {step === 2 && <StepGoals data={data} update={update} />}
          {step === 3 && <StepTraining data={data} update={update} />}
          {step === 4 && <StepNutrition data={data} update={update} />}
          {step === 5 && <StepMotivation data={data} update={update} />}
        </div>
      </div>

      {/* Fixed CTA */}
      <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-adlr-black via-adlr-black to-transparent pt-6 pb-6 px-6 safe-bottom">
        <div className="max-w-md mx-auto">
          <Button
            onClick={step === STEPS - 1 ? finish : next}
            disabled={saving}
            className="w-full"
          >
            {saving ? 'Speichert...' : step === STEPS - 1 ? 'Profil absenden' : 'Weiter'}
          </Button>
        </div>
      </div>
    </div>
  );
}
