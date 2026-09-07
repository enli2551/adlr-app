import type { IntakeData } from '@/lib/types';
import { Chip, Textarea, Field } from '@/components/ui';

const GOALS = [
  'Gewicht reduzieren',
  'Muskeln aufbauen',
  'Beweglichkeit & Flexibilität',
  'Verletzungsprävention',
  'Allgemeine Fitness & Energie',
  'Haltungsverbesserung',
  'Longevity & Gesundheit',
];

export default function StepGoals({ data, update }: { data: IntakeData; update: (p: Partial<IntakeData>) => void }) {
  const selected = data.goals ?? [];
  const toggle = (g: string) => {
    update({ goals: selected.includes(g) ? selected.filter((x) => x !== g) : [...selected, g] });
  };
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-white/50 mb-3">Wähle alles, was auf dich zutrifft. Priorisiere danach.</p>
        <div className="flex gap-2 flex-wrap">
          {GOALS.map((g) => (
            <Chip key={g} active={selected.includes(g)} onClick={() => toggle(g)}>{g}</Chip>
          ))}
        </div>
        {selected.length > 0 && (
          <div className="mt-4 text-xs text-white/40">
            {selected.length} ausgewählt {selected.length > 0 && `— Priorität: ${selected[0]}`}
          </div>
        )}
      </div>
      <Field label="Eigenes Ziel" hint="Wenn dein Ziel nicht dabei ist, schreib es selbst.">
        <Textarea rows={2} value={data.customGoal ?? ''} onChange={(e) => update({ customGoal: e.target.value })} placeholder="z.B. Marathon in 6 Monaten finishen" />
      </Field>
    </div>
  );
}
