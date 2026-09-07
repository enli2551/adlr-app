import type { IntakeData } from '@/lib/types';
import { Field, Input, Chip } from '@/components/ui';

export default function StepPersonal({ data, update }: { data: IntakeData; update: (p: Partial<IntakeData>) => void }) {
  const genders = ['Mann', 'Frau', 'Keine Angabe'];
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Vorname">
          <Input value={data.firstName ?? ''} onChange={(e) => update({ firstName: e.target.value })} placeholder="Max" />
        </Field>
        <Field label="Nachname">
          <Input value={data.lastName ?? ''} onChange={(e) => update({ lastName: e.target.value })} placeholder="Mustermann" />
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Alter">
          <Input type="number" inputMode="numeric" value={data.age ?? ''} onChange={(e) => update({ age: Number(e.target.value) })} placeholder="32" />
        </Field>
        <Field label="Größe (cm)">
          <Input type="number" inputMode="numeric" value={data.heightCm ?? ''} onChange={(e) => update({ heightCm: Number(e.target.value) })} placeholder="180" />
        </Field>
        <Field label="Gewicht (kg)">
          <Input type="number" inputMode="decimal" value={data.weightKg ?? ''} onChange={(e) => update({ weightKg: Number(e.target.value) })} placeholder="82" />
        </Field>
      </div>
      <Field label="Geschlecht">
        <div className="flex gap-2 flex-wrap">
          {genders.map((g) => (
            <Chip key={g} active={data.gender === g} onClick={() => update({ gender: g })}>{g}</Chip>
          ))}
        </div>
      </Field>
      <Field label="E-Mail">
        <Input type="email" value={data.email ?? ''} onChange={(e) => update({ email: e.target.value })} placeholder="max@email.at" />
      </Field>
      <Field label="Telefon">
        <Input type="tel" value={data.phone ?? ''} onChange={(e) => update({ phone: e.target.value })} placeholder="+43..." />
      </Field>
      <Field label="Profilfoto" hint="Optional. Lade ein Foto hoch, damit Peter dich erkennt.">
        <AvatarUpload data={data} update={update} />
      </Field>
    </div>
  );
}

function AvatarUpload({ data, update }: { data: IntakeData; update: (p: Partial<IntakeData>) => void }) {
  const handle = async (file: File) => {
    // Read as data URL for simplicity in this single-tenant demo
    const reader = new FileReader();
    reader.onload = () => update({ avatarUrl: reader.result as string });
    reader.readAsDataURL(file);
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
      <span className="text-sm text-adlr-gold/80">Foto wählen</span>
      <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && handle(e.target.files[0])} />
    </label>
  );
}
