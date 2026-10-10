import { Dumbbell, Footprints, Utensils, Moon, Scale, Timer, Beef } from 'lucide-react';
import type { CheckinStats } from '@/lib/checkinStats';
import { t, fmtNum } from '@/lib/i18n';

const fmtSleep = (m: number) => `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}`;

/** The automatically collected week behind a check-in (client preview + coach view). */
export default function CheckinStatsView({ stats }: { stats: CheckinStats }) {
  const s = stats;
  const delta = s.weight_start != null && s.weight_end != null ? Math.round((s.weight_end - s.weight_start) * 10) / 10 : null;
  const macros = s.protein_avg != null ? `${s.protein_avg} · ${s.carbs_avg ?? '—'} · ${s.fat_avg ?? '—'} g` : null;
  const tiles: { icon: typeof Dumbbell; label: string; value: string; sub?: string; tone?: 'good' | 'bad' }[] = [
    {
      icon: Dumbbell, label: 'Trainings',
      value: s.target ? `${s.workouts}/${s.target}` : String(s.workouts),
      sub: s.sets > 0 ? `${t('{n} Sätze', { n: s.sets })} · ${fmtNum(s.volume_kg)} kg` : undefined,
      tone: s.target ? (s.workouts >= s.target ? 'good' : s.workouts < s.target - 1 ? 'bad' : undefined) : undefined,
    },
  ];
  if (s.minutes > 0) tiles.push({ icon: Timer, label: 'Trainingszeit', value: `${fmtNum(s.minutes)} min` });
  if (s.steps_avg != null) tiles.push({ icon: Footprints, label: 'Ø Schritte', value: fmtNum(s.steps_avg) });
  if (s.kcal_avg != null) {
    const pct = s.kcal_avg != null && s.kcal_target ? s.kcal_avg / s.kcal_target : null;
    tiles.push({
      icon: Utensils, label: 'Ø kcal gegessen',
      value: `${fmtNum(s.kcal_avg)}${s.kcal_target ? ` / ${fmtNum(s.kcal_target)}` : ''}`,
      tone: pct == null ? undefined : Math.abs(pct - 1) <= 0.1 ? 'good' : 'bad',
    });
  }
  if (macros) tiles.push({ icon: Beef, label: 'Makros (Eiweiß · KH · Fett)', value: macros });
  if (s.sleep_avg_min != null) tiles.push({ icon: Moon, label: 'Ø Schlaf', value: fmtSleep(s.sleep_avg_min) });
  if (s.weight_end != null) tiles.push({ icon: Scale, label: 'Gewicht', value: `${fmtNum(s.weight_end)} kg`, sub: delta != null && delta !== 0 ? `${delta > 0 ? '+' : ''}${fmtNum(delta)} kg ${t('diese Woche')}` : undefined });

  return (
    <div className="grid grid-cols-2 gap-1.5">
      {tiles.map((tile) => (
        <div key={tile.label} className="rounded-xl px-3 py-2 flex items-start gap-2" style={{ background: 'rgb(var(--text) / 0.04)' }}>
          <tile.icon size={14} className="text-adlr-gold shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className={`text-sm font-bold leading-tight ${tile.tone === 'good' ? 'text-emerald-400' : tile.tone === 'bad' ? 'text-amber-400' : 'text-white'}`}>{tile.value}</p>
            <p className="text-[10px] text-white/45">{t(tile.label)}</p>
            {tile.sub && <p className="text-[10px] text-white/55 truncate">{tile.sub}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}
