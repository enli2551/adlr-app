import type { IntakeData } from '@/lib/types';
import { Textarea, Field, Chip } from '@/components/ui';

function Slider({ value, onChange, labels }: { value: number; onChange: (n: number) => void; labels: string[] }) {
  return (
    <div>
      <div className="flex justify-between text-xs text-white/40 mb-2">
        {labels.map((l, i) => <span key={i} className={value === i + 1 ? 'text-adlr-gold font-medium' : ''}>{i + 1}</span>)}
      </div>
      <input type="range" min={1} max={5} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full" />
      <div className="flex justify-between text-[10px] text-white/30 mt-1.5">
        {labels.map((l, i) => <span key={i} className="flex-1 text-center">{l}</span>)}
      </div>
    </div>
  );
}

const SOURCES = ['Empfehlung', 'Social Media', 'Gym', 'Sonstiges'];

export default function StepMotivation({ data, update }: { data: IntakeData; update: (p: Partial<IntakeData>) => void }) {
  return (
    <div className="space-y-7">
      <Field label="Warum jetzt?" hint="Mindestens 2 Sätze. Sei ehrlich — Peter liest das.">
        <Textarea
          rows={4}
          value={data.whyNow ?? ''}
          onChange={(e) => update({ whyNow: e.target.value })}
          placeholder="Ich will wieder Energie haben für meine Kinder. Keine Ausreden mehr..."
        />
      </Field>
      <div>
        <p className="text-sm font-medium text-white/80 mb-3">Commitment Level</p>
        <Slider value={data.commitmentLevel ?? 3} onChange={(n) => update({ commitmentLevel: n })} labels={['Neugierig', 'Interessiert', 'Bereit', 'Fokussiert', 'Alles oder nichts']} />
      </div>
      <div>
        <p className="text-sm font-medium text-white/80 mb-3">Wie hast du ADLR gefunden?</p>
        <div className="flex gap-2 flex-wrap">
          {SOURCES.map((s) => (
            <Chip key={s} active={data.referralSource === s} onClick={() => update({ referralSource: s })}>{s}</Chip>
          ))}
        </div>
      </div>
    </div>
  );
}
