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

export default function StepHealth({ data, update }: { data: IntakeData; update: (p: Partial<IntakeData>) => void }) {
  const injuries = ['Knie', 'Rücken', 'Schulter', 'Hüfte', 'Nacken', 'Keine', 'Sonstiges'];
  const jobs = ['Sitzend', 'Aktiv', 'Gemischt'];
  const toggleInjury = (i: string) => {
    const cur = data.injuries ?? [];
    update({ injuries: cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i] });
  };
  return (
    <div className="space-y-7">
      <div>
        <p className="text-sm font-medium text-white/80 mb-3">Aktuelles Aktivitätslevel</p>
        <Slider value={data.activityLevel ?? 3} onChange={(n) => update({ activityLevel: n })} labels={['Kaum', 'Selten', 'Gelegentlich', 'Oft', 'Täglich']} />
      </div>
      <div>
        <p className="text-sm font-medium text-white/80 mb-3">Verletzungen oder Beschwerden</p>
        <div className="flex gap-2 flex-wrap">
          {injuries.map((i) => (
            <Chip key={i} active={(data.injuries ?? []).includes(i)} onClick={() => toggleInjury(i)}>{i}</Chip>
          ))}
        </div>
      </div>
      <div>
        <p className="text-sm font-medium text-white/80 mb-3">Schlafqualität</p>
        <Slider value={data.sleepQuality ?? 3} onChange={(n) => update({ sleepQuality: n })} labels={['Schlecht', 'Mittel', 'Okay', 'Gut', 'Tief']} />
      </div>
      <div>
        <p className="text-sm font-medium text-white/80 mb-3">Stresslevel</p>
        <Slider value={data.stressLevel ?? 3} onChange={(n) => update({ stressLevel: n })} labels={['Ruhig', 'Entspannt', 'Normal', 'Hoch', 'Extrem']} />
      </div>
      <div>
        <p className="text-sm font-medium text-white/80 mb-3">Berufsart</p>
        <div className="flex gap-2 flex-wrap">
          {jobs.map((j) => (
            <Chip key={j} active={data.jobType === j} onClick={() => update({ jobType: j })}>{j}</Chip>
          ))}
        </div>
      </div>
    </div>
  );
}
