import type { IntakeData } from '@/lib/types';
import { Field, Input, Chip } from '@/components/ui';
import { t } from '@/lib/i18n';

// The short sign-up: only what the coach (and the kcal suggestion) needs on day one.
// Everything else (sleep, stress, nutrition, motivation, photo, phone) is asked later
// from Profil → "Profil vervollständigen" (Onboarding ?more=1).

type StepProps = { data: IntakeData; update: (p: Partial<IntakeData>) => void };

const GENDERS = ['Mann', 'Frau', 'Keine Angabe'];
const GOALS = ['Muskeln aufbauen', 'Gewicht reduzieren', 'Allgemeine Fitness & Energie', 'Longevity & Gesundheit', 'Beweglichkeit & Flexibilität', 'Haltungsverbesserung', 'Verletzungsprävention'];
const EXP = ['Anfänger', 'Mittel', 'Fortgeschritten'];
const EQUIP = ['Gym', 'Zuhause', 'Beides'];
const DAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const INJURIES = ['Keine', 'Knie', 'Rücken', 'Schulter', 'Hüfte', 'Nacken', 'Sonstiges'];
const JOBS = ['Sitzend', 'Gemischt', 'Aktiv'];

const Label = ({ children }: { children: React.ReactNode }) => <p className="text-sm font-medium text-white/80 mb-3">{children}</p>;

export function StepBasics({ data, update }: StepProps) {
  return (
    <div className="space-y-5">
      <Field label={t('Vorname')}>
        <Input value={data.firstName ?? ''} onChange={(e) => update({ firstName: e.target.value })} placeholder="Max" autoFocus />
      </Field>
      <Field label={t('Geschlecht')}>
        <div className="flex gap-2 flex-wrap">
          {GENDERS.map((g) => <Chip key={g} active={data.gender === g} onClick={() => update({ gender: g })}>{t(g)}</Chip>)}
        </div>
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label={t('Alter')}>
          <Input type="number" inputMode="numeric" value={data.age ?? ''} onChange={(e) => update({ age: Number(e.target.value) || undefined })} placeholder="32" />
        </Field>
        <Field label={t('Größe (cm)')}>
          <Input type="number" inputMode="numeric" value={data.heightCm ?? ''} onChange={(e) => update({ heightCm: Number(e.target.value) || undefined })} placeholder="180" />
        </Field>
        <Field label={t('Gewicht (kg)')}>
          <Input type="number" inputMode="decimal" value={data.weightKg ?? ''} onChange={(e) => update({ weightKg: Number(e.target.value.replace(',', '.')) || undefined })} placeholder="82" />
        </Field>
      </div>
    </div>
  );
}

export function StepGoalLevel({ data, update }: StepProps) {
  const goals = data.goals ?? [];
  const toggle = (g: string) => update({ goals: goals.includes(g) ? goals.filter((x) => x !== g) : [...goals, g] });
  return (
    <div className="space-y-7">
      <div>
        <Label>{t('Dein Ziel')}</Label>
        <div className="flex gap-2 flex-wrap">
          {GOALS.map((g) => <Chip key={g} active={goals.includes(g)} onClick={() => toggle(g)}>{t(g)}</Chip>)}
        </div>
      </div>
      <div>
        <Label>{t('Trainingserfahrung')}</Label>
        <div className="flex gap-2">
          {EXP.map((e) => <Chip key={e} active={data.experience === e} onClick={() => update({ experience: e })}>{t(`exp|${e}`)}</Chip>)}
        </div>
      </div>
      <div>
        <Label>{t('Wo trainierst du?')}</Label>
        <div className="flex gap-2">
          {EQUIP.map((e) => <Chip key={e} active={data.equipment === e} onClick={() => update({ equipment: e })}>{t(e)}</Chip>)}
        </div>
      </div>
    </div>
  );
}

export function StepSchedule({ data, update }: StepProps) {
  const days = data.trainingDays ?? [];
  const injuries = data.injuries ?? [];
  const toggleDay = (i: number) => update({ trainingDays: days.includes(i) ? days.filter((x) => x !== i) : [...days, i].sort() });
  const toggleInjury = (i: string) => {
    if (i === 'Keine') return update({ injuries: injuries.includes('Keine') ? [] : ['Keine'] });
    const rest = injuries.filter((x) => x !== 'Keine');
    update({ injuries: rest.includes(i) ? rest.filter((x) => x !== i) : [...rest, i] });
  };
  return (
    <div className="space-y-7">
      <div>
        <Label>{t('An welchen Tagen kannst du trainieren?')}</Label>
        <div className="grid grid-cols-7 gap-1.5">
          {DAYS.map((d, i) => (
            <button key={d} onClick={() => toggleDay(i)}
              className={`adlr-tap py-3 rounded-lg text-sm font-medium border transition-all ${days.includes(i) ? 'bg-adlr-gold text-black border-adlr-gold' : 'bg-white/5 text-white/60 border-white/10'}`}>
              {t(d)}
            </button>
          ))}
        </div>
      </div>
      <div>
        <Label>{t('Verletzungen oder Beschwerden')}</Label>
        <div className="flex gap-2 flex-wrap">
          {INJURIES.map((i) => <Chip key={i} active={injuries.includes(i)} onClick={() => toggleInjury(i)}>{t(i)}</Chip>)}
        </div>
      </div>
      <div>
        <Label>{t('Berufsart')}</Label>
        <div className="flex gap-2 flex-wrap">
          {JOBS.map((j) => <Chip key={j} active={data.jobType === j} onClick={() => update({ jobType: j })}>{t(j)}</Chip>)}
        </div>
      </div>
    </div>
  );
}
