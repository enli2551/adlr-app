import type { IntakeData } from '@/lib/types';
import { Chip } from '@/components/ui';

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

const RESTRICTIONS = ['Vegan', 'Vegetarisch', 'Glutenfrei', 'Laktosefrei', 'Keine', 'Sonstiges'];
const WATER = ['Unter 1L', '1-2L', 'Über 2L'];
const ALCOHOL = ['Nie', 'Gelegentlich', 'Regelmäßig'];

export default function StepNutrition({ data, update }: { data: IntakeData; update: (p: Partial<IntakeData>) => void }) {
  const toggle = (r: string) => {
    const cur = data.dietRestrictions ?? [];
    update({ dietRestrictions: cur.includes(r) ? cur.filter((x) => x !== r) : [...cur, r] });
  };
  return (
    <div className="space-y-7">
      <div>
        <p className="text-sm font-medium text-white/80 mb-3">Aktuelle Essgewohnheiten</p>
        <Slider value={data.eatingHabits ?? 3} onChange={(n) => update({ eatingHabits: n })} labels={['Sehr schlecht', 'Schlecht', 'Okay', 'Gut', 'Sehr clean']} />
      </div>
      <div>
        <p className="text-sm font-medium text-white/80 mb-3">Einschränkungen</p>
        <div className="flex gap-2 flex-wrap">
          {RESTRICTIONS.map((r) => (
            <Chip key={r} active={(data.dietRestrictions ?? []).includes(r)} onClick={() => toggle(r)}>{r}</Chip>
          ))}
        </div>
      </div>
      <div>
        <p className="text-sm font-medium text-white/80 mb-3">Wasseraufnahme täglich</p>
        <div className="flex gap-2">
          {WATER.map((w) => (
            <Chip key={w} active={data.waterIntake === w} onClick={() => update({ waterIntake: w })}>{w}</Chip>
          ))}
        </div>
      </div>
      <div>
        <p className="text-sm font-medium text-white/80 mb-3">Alkohol</p>
        <div className="flex gap-2">
          {ALCOHOL.map((a) => (
            <Chip key={a} active={data.alcohol === a} onClick={() => update({ alcohol: a })}>{a}</Chip>
          ))}
        </div>
      </div>
    </div>
  );
}
