import type { IntakeData } from '@/lib/types';
import { Field, Input, Chip } from '@/components/ui';
import { resizeImageToDataUrl } from '@/lib/image';
import { t } from '@/lib/i18n';
import { useCoachName } from '@/lib/auth';

export default function StepPersonal({ data, update }: { data: IntakeData; update: (p: Partial<IntakeData>) => void }) {
  const genders = ['Mann', 'Frau', 'Keine Angabe'];
  const coach = useCoachName();
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('Vorname')}>
          <Input value={data.firstName ?? ''} onChange={(e) => update({ firstName: e.target.value })} placeholder="Max" />
        </Field>
        <Field label={t('Nachname')}>
          <Input value={data.lastName ?? ''} onChange={(e) => update({ lastName: e.target.value })} placeholder="Mustermann" />
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label={t('Alter')}>
          <Input type="number" inputMode="numeric" value={data.age ?? ''} onChange={(e) => update({ age: Number(e.target.value) })} placeholder="32" />
        </Field>
        <Field label={t('Größe (cm)')}>
          <Input type="number" inputMode="numeric" value={data.heightCm ?? ''} onChange={(e) => update({ heightCm: Number(e.target.value) })} placeholder="180" />
        </Field>
        <Field label={t('Gewicht (kg)')}>
          <Input type="number" inputMode="decimal" value={data.weightKg ?? ''} onChange={(e) => update({ weightKg: Number(e.target.value) })} placeholder="82" />
        </Field>
      </div>
      <Field label={t('Geschlecht')}>
        <div className="flex gap-2 flex-wrap">
          {genders.map((g) => (
            <Chip key={g} active={data.gender === g} onClick={() => update({ gender: g })}>{t(g)}</Chip>
          ))}
        </div>
      </Field>
      <Field label={t('E-Mail')}>
        <Input type="email" value={data.email ?? ''} onChange={(e) => update({ email: e.target.value })} placeholder="max@email.at" />
      </Field>
      <Field label={t('Telefon')}>
        <Input type="tel" value={data.phone ?? ''} onChange={(e) => update({ phone: e.target.value })} placeholder="+43..." />
      </Field>
      <Field label={t('Profilfoto')} hint={t('Optional. Lade ein Foto hoch, damit {coach} dich erkennt.', { coach })}>
        <AvatarUpload data={data} update={update} />
      </Field>
    </div>
  );
}

function AvatarUpload({ data, update }: { data: IntakeData; update: (p: Partial<IntakeData>) => void }) {
  const handle = async (file: File) => {
    // Stored inline as a data URL — downscale first so it stays ~20 KB instead of
    // several MB (every profile query would otherwise download the full photo).
    update({ avatarUrl: await resizeImageToDataUrl(file) });
  };
  return (
    <label className="flex items-center gap-4 cursor-pointer">
      <div className="w-16 h-16 rounded-full bg-white/5 border border-white/10 flex items-center justify-center overflow-hidden">
        {data.avatarUrl ? (
          <img src={data.avatarUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="text-white/30 text-2xl">+</span>
        )}
      </div>
      <span className="text-sm text-adlr-gold/80">{t('Foto wählen')}</span>
      <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && handle(e.target.files[0])} />
    </label>
  );
}
