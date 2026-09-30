import { useEffect, useState } from 'react';
import { Footprints, Utensils, Moon, Scale, HeartPulse } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { localDateKey } from '@/lib/dates';
import type { HealthDay } from '@/lib/health';
import { t, fmtNum } from '@/lib/i18n';

interface Props {
  clientId: string;
  refreshKey?: number; // bump to reload after a sync
  emptyText?: string;
}

const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const fmtSleep = (m: number) => `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}`;

/** Last 7 days of synced health data (Apple Health / Health Connect), read-only. */
export default function HealthSummary({ clientId, refreshKey = 0, emptyText }: Props) {
  const [rows, setRows] = useState<HealthDay[] | null>(null);

  useEffect(() => {
    const since = new Date(); since.setDate(since.getDate() - 6);
    supabase.from('health_daily').select('*').eq('client_id', clientId).gte('day', localDateKey(since)).order('day', { ascending: true })
      .then(({ data }) => setRows((data ?? []) as HealthDay[]));
  }, [clientId, refreshKey]);

  if (rows === null) return null;
  if (rows.length === 0) return <p className="text-sm text-white/35">{emptyText ?? t('Noch keine Gesundheitsdaten synchronisiert.')}</p>;

  const avg = (f: (r: HealthDay) => number | null) => {
    const v = rows.map(f).filter((x): x is number => x != null);
    return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
  };
  const latestWeight = [...rows].reverse().find((r) => r.weight_kg != null)?.weight_kg ?? null;
  const tiles = [
    { icon: Footprints, label: 'Ø Schritte', value: (() => { const v = avg((r) => r.steps); return v != null ? fmtNum(v) : undefined; })() },
    { icon: Utensils, label: 'Ø kcal gegessen', value: (() => { const v = avg((r) => r.kcal_in); return v != null ? fmtNum(v) : undefined; })() },
    { icon: Moon, label: 'Ø Schlaf', value: (() => { const m = avg((r) => r.sleep_min); return m != null ? fmtSleep(m) : undefined; })() },
    { icon: Scale, label: 'Gewicht', value: latestWeight != null ? `${fmtNum(latestWeight)} kg` : undefined },
    { icon: HeartPulse, label: 'Ø Ruhepuls', value: avg((r) => r.resting_hr) != null ? `${avg((r) => r.resting_hr)} bpm` : undefined },
  ].filter((x) => x.value != null);

  // Day-by-day table (newest first)
  const days = [...rows].reverse();
  return (
    <div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        {tiles.map((tile) => (
          <div key={tile.label} className="rounded-xl px-3 py-2.5 flex items-center gap-2.5" style={{ background: 'rgb(var(--text) / 0.04)' }}>
            <tile.icon size={16} className="text-adlr-gold shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-bold text-white leading-tight">{tile.value}</p>
              <p className="text-[10px] text-white/40 uppercase">{t(tile.label)}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="text-xs">
        <div className="grid grid-cols-[2.5rem_1fr_1fr_1fr] gap-2 px-1 pb-1.5 text-white/35 uppercase text-[10px]">
          <span>{t('Tag')}</span><span className="text-right">{t('Schritte')}</span><span className="text-right">kcal</span><span className="text-right">{t('Schlaf')}</span>
        </div>
        {days.map((r) => (
          <div key={r.day} className="grid grid-cols-[2.5rem_1fr_1fr_1fr] gap-2 px-1 py-1.5 border-t" style={{ borderColor: 'rgb(var(--text) / 0.05)' }}>
            <span className="text-white/50">{t(WD[new Date(`${r.day}T12:00:00`).getDay()])} {r.day.slice(8)}.</span>
            <span className="text-right text-white/80">{r.steps != null ? fmtNum(r.steps) : '—'}</span>
            <span className="text-right text-white/80">{r.kcal_in != null ? fmtNum(r.kcal_in) : '—'}</span>
            <span className="text-right text-white/80">{r.sleep_min != null ? fmtSleep(r.sleep_min) : '—'}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
