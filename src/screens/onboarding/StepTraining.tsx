import type { IntakeData } from '@/lib/types';
import { Chip } from '@/components/ui';

const DAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const TIMES = ['Früh', 'Mittag', 'Abend'];
const EXP = ['Anfänger', 'Mittel', 'Fortgeschritten'];
const EQUIP = ['Gym', 'Zuhause', 'Beides'];

export default function StepTraining({ data, update }: { data: IntakeData; update: (p: Partial<IntakeData>) => void }) {
  const days = data.trainingDays ?? [];
  const toggleDay = (i: number) => {
    update({ trainingDays: days.includes(i) ? days.filter((x) => x !== i) : [...days, i] });
  };
  return (
    <div className="space-y-7">
      <div>
        <p className="text-sm font-medium text-white/80 mb-3">Bevorzugte Trainingstage</p>
        <div className="grid grid-cols-7 gap-1.5">
          {DAYS.map((d, i) => (
            <button
              key={d}
              onClick={() => toggleDay(i)}
              className={`adlr-tap py-3 rounded-lg text-sm font-medium border transition-all ${
                days.includes(i) ? 'bg-adlr-gold text-black border-adlr-gold' : 'bg-white/5 text-white/60 border-white/10'
              }`}
            >
              {d}
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="text-sm font-medium text-white/80 mb-3">Bevorzugte Uhrzeit</p>
        <div className="flex gap-2">
          {TIMES.map((t) => (
            <Chip key={t} active={data.trainingTime === t} onClick={() => update({ trainingTime: t })}>{t}</Chip>
          ))}
        </div>
      </div>
      <div>
        <p className="text-sm font-medium text-white/80 mb-3">Trainingserfahrung</p>
        <div className="flex gap-2">
          {EXP.map((e) => (
            <Chip key={e} active={data.experience === e} onClick={() => update({ experience: e })}>{e}</Chip>
          ))}
        </div>
      </div>
      <div>
        <p className="text-sm font-medium text-white/80 mb-3">Zugang zu Equipment</p>
        <div className="flex gap-2">
          {EQUIP.map((e) => (
            <Chip key={e} active={data.equipment === e} onClick={() => update({ equipment: e })}>{e}</Chip>
          ))}
        </div>
      </div>
    </div>
  );
}
