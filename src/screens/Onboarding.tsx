import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import type { IntakeData } from '@/lib/types';
import { Button } from '@/components/ui';
import StepPersonal from './onboarding/StepPersonal';
import StepHealth from './onboarding/StepHealth';
import StepNutrition from './onboarding/StepNutrition';
import StepMotivation from './onboarding/StepMotivation';
import { StepBasics, StepGoalLevel, StepSchedule } from './onboarding/StepQuick';
import Completion from './onboarding/Completion';
import { t } from '@/lib/i18n';

type StepDef = { header: string; render: (data: IntakeData, update: (p: Partial<IntakeData>) => void) => React.ReactNode; valid?: (d: IntakeData) => boolean };

// Sign-up: 3 short steps, ~1 minute. The detailed questionnaire is optional and
// reachable later from Profil (`/onboarding?more=1`), merged into the same intake.
const QUICK: StepDef[] = [
  { header: 'Wer bist du?', render: (d, u) => <StepBasics data={d} update={u} />, valid: (d) => !!d.firstName?.trim() },
  { header: 'Wohin willst du?', render: (d, u) => <StepGoalLevel data={d} update={u} /> },
  { header: 'Wann trainierst du?', render: (d, u) => <StepSchedule data={d} update={u} /> },
];
const MORE: StepDef[] = [
  { header: 'Über dich', render: (d, u) => <StepPersonal data={d} update={u} /> },
  { header: 'Was trägt dein Körper mit sich?', render: (d, u) => <StepHealth data={d} update={u} /> },
  { header: 'Was tankst du?', render: (d, u) => <StepNutrition data={d} update={u} /> },
  { header: 'Was treibt dich an?', render: (d, u) => <StepMotivation data={d} update={u} /> },
];

export default function Onboarding() {
  const { profile, refreshProfile, session } = useAuth();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const more = params.get('more') === '1' && !!profile?.intake_completed;
  const steps = more ? MORE : QUICK;
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);
  const [data, setData] = useState<IntakeData>(() => more
    ? { ...(profile?.intake ?? {}), firstName: profile?.first_name ?? undefined, lastName: profile?.last_name ?? undefined, phone: profile?.phone ?? undefined, avatarUrl: profile?.avatar_url ?? undefined }
    : {});
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const update = (patch: Partial<IntakeData>) => setData((d) => ({ ...d, ...patch }));
  const back = () => (step === 0 ? (more ? nav('/app/profil') : undefined) : setStep((s) => s - 1));
  const cur = steps[step];
  const last = step === steps.length - 1;

  const finish = async () => {
    const uid = session?.user.id;
    if (!uid) return;
    setSaving(true);
    setErr(null);
    let error;
    if (more) {
      ({ error } = await supabase.from('profiles').update({
        first_name: data.firstName, last_name: data.lastName, phone: data.phone, avatar_url: data.avatarUrl,
        intake: { ...(profile?.intake ?? {}), ...data, avatarUrl: undefined, extended: true },
      }).eq('id', uid));
    } else {
      // Link client to the trainer (invite code / existing link, SECURITY DEFINER).
      const { data: trainerId } = await supabase.rpc('get_trainer_id');
      ({ error } = await supabase.from('profiles').update({
        intake_completed: true,
        first_name: data.firstName?.trim(),
        age: data.age, height_cm: data.heightCm, weight_kg: data.weightKg, gender: data.gender,
        email: session?.user.email ?? null,
        intake: { ...data, email: session?.user.email ?? undefined },
        trainer_id: trainerId ?? null,
      }).eq('id', uid));
    }
    setSaving(false);
    if (error) { console.error(error); setErr(t('Speichern fehlgeschlagen. Bitte erneut versuchen.')); return; }
    await refreshProfile();
    if (more) nav('/app/profil');
    else setDone(true);
  };

  if (done) return <Completion data={data} onContinue={() => nav('/app')} />;

  const progress = ((step + 1) / steps.length) * 100;

  return (
    <div className="min-h-screen flex flex-col">
      <div className="fixed top-0 left-0 right-0 z-20 bg-adlr-black/90 safe-top">
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <button onClick={back} disabled={step === 0 && !more} className="text-white/40 text-sm disabled:opacity-0">
            {t('Zurück')}
          </button>
          <span className="text-xs text-white/40 tracking-widest uppercase">{step + 1} / {steps.length}</span>
          <div className="w-10" />
        </div>
        <div className="h-0.5 bg-white/5 mx-5 mb-0 rounded-full overflow-hidden">
          <div className="h-full bg-adlr-gold transition-all duration-500 ease-out" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="flex-1 px-6 pt-20 pb-32 max-w-md mx-auto w-full">
        <div key={step} className="adlr-slide-in">
          <div className="mb-6">
            <p className="text-xs text-adlr-gold tracking-widest uppercase mb-2">{more ? t('Profil vervollständigen') : t('Schritt {n}', { n: step + 1 })}</p>
            <h1 className="text-2xl font-bold tracking-tight">{t(cur.header)}</h1>
          </div>
          {cur.render(data, update)}
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-adlr-black via-adlr-black to-transparent pt-6 pb-6 px-6 safe-bottom">
        <div className="max-w-md mx-auto">
          {err && <p className="text-xs text-red-400 mb-2 text-center">{err}</p>}
          <Button onClick={last ? finish : () => setStep((s) => s + 1)} disabled={saving || (cur.valid ? !cur.valid(data) : false)} className="w-full">
            {saving ? t('Speichert...') : last ? (more ? t('Speichern') : t('Los geht\'s')) : t('Weiter')}
          </Button>
          {!more && !last && step > 0 && (
            <button onClick={() => setStep((s) => s + 1)} className="w-full text-xs text-white/35 mt-3">{t('Überspringen')}</button>
          )}
        </div>
      </div>
    </div>
  );
}
