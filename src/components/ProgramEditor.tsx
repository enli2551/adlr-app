import { useEffect, useState } from 'react';
import { CalendarRange, ChevronDown, Minus, Plus } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Plan } from '@/lib/types';
import { presetRules, ruleSummary, type WeekRule, type ProgramPreset } from '@/lib/program';
import { t } from '@/lib/i18n';

const FIELDS: { key: 'sets_pct' | 'reps_delta' | 'weight_pct' | 'rpe_delta'; label: string; step: number; placeholder: string }[] = [
  { key: 'sets_pct', label: 'Sätze %', step: 10, placeholder: '100' },
  { key: 'reps_delta', label: 'Wdh ±', step: 1, placeholder: '0' },
  { key: 'weight_pct', label: 'Gewicht %', step: 2.5, placeholder: '0' },
  { key: 'rpe_delta', label: 'RPE ±', step: 0.5, placeholder: '0' },
];

/** Plan Builder: turn a weekly plan into a multi-week program with per-week rules. */
export default function ProgramEditor({ plan, onChange }: { plan: Plan; onChange: (p: Plan) => void }) {
  const weeks = plan.weeks && plan.weeks > 1 ? plan.weeks : 0;
  const [open, setOpen] = useState(weeks > 0);
  const [rules, setRules] = useState<WeekRule[]>(plan.week_rules ?? []);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { setRules(plan.week_rules ?? []); }, [plan.id]);

  const save = async (patch: { weeks?: number | null; week_rules?: WeekRule[] | null }) => {
    setErr(null);
    const { data, error } = await supabase.from('plans').update(patch).eq('id', plan.id).select('*').single();
    if (error || !data) { setErr(t('Speichern fehlgeschlagen. Ist die Migration für Programme ausgeführt?')); return; }
    onChange(data as Plan);
  };
  const setWeeks = (n: number | null) => {
    const next = n && n > 1 ? Math.min(16, n) : null;
    const trimmed = next ? rules.filter((r) => r.week <= next) : [];
    setRules(trimmed);
    save({ weeks: next, week_rules: next ? trimmed : null });
  };
  const applyPreset = (p: ProgramPreset) => {
    const r = presetRules(weeks || 6, p);
    setRules(r);
    save({ weeks: weeks || 6, week_rules: r });
  };
  const setField = (week: number, key: (typeof FIELDS)[number]['key'], raw: string) => {
    const v = raw === '' || raw === '-' ? undefined : Number(raw.replace(',', '.'));
    setRules((prev) => {
      const cur = prev.find((r) => r.week === week) ?? { week };
      const nextRule: WeekRule = { ...cur, [key]: Number.isNaN(v as number) ? undefined : v };
      return [...prev.filter((r) => r.week !== week), nextRule].sort((a, b) => a.week - b.week);
    });
  };
  const toggleDeload = (week: number) => {
    const cur = rules.find((r) => r.week === week) ?? { week };
    const next: WeekRule = cur.deload ? { week } : { week, deload: true, sets_pct: 60, weight_pct: -10, rpe_delta: -2 };
    const all = [...rules.filter((r) => r.week !== week), next].sort((a, b) => a.week - b.week);
    setRules(all);
    save({ week_rules: all });
  };

  const inputCls = 'w-full bg-inset border border-white/10 rounded-md px-1 py-1.5 text-xs text-white placeholder-white/20 outline-none text-center';
  return (
    <div className="rounded-xl mb-5" style={{ background: 'rgb(var(--text) / 0.04)', border: `1px solid ${weeks ? 'rgb(var(--adlr-gold) / 0.3)' : 'rgb(var(--text) / 0.07)'}` }}>
      <button onClick={() => setOpen(!open)} className="adlr-tap w-full flex items-center gap-2.5 px-4 py-3 text-left">
        <CalendarRange size={16} className="text-adlr-gold shrink-0" />
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-semibold text-white">{t('Programm über mehrere Wochen')}</span>
          <span className="block text-xs text-white/45">{weeks ? t('{n} Wochen · Woche für Woche angepasst', { n: weeks }) : t('Aus — der Plan wiederholt sich jede Woche gleich')}</span>
        </span>
        <ChevronDown size={15} className="text-white/35 transition-transform" style={{ transform: open ? 'rotate(180deg)' : 'none' }} />
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3 adlr-fade-in">
          <div className="flex items-center gap-2">
            <span className="text-xs text-white/55 flex-1">{t('Dauer')}</span>
            <button onClick={() => setWeeks(weeks ? weeks - 1 : null)} disabled={!weeks} className="adlr-tap w-8 h-8 rounded-lg flex items-center justify-center bg-white/5 text-white/60 disabled:opacity-30" aria-label={t('Weniger')}><Minus size={14} /></button>
            <span className="w-20 text-center text-sm font-semibold text-white">{weeks ? t('{n} Wochen', { n: weeks }) : t('Aus')}</span>
            <button onClick={() => setWeeks(weeks ? weeks + 1 : 4)} disabled={weeks >= 16} className="adlr-tap w-8 h-8 rounded-lg flex items-center justify-center bg-white/5 text-white/60 disabled:opacity-30" aria-label={t('Mehr')}><Plus size={14} /></button>
          </div>
          <div>
            <p className="text-[11px] text-white/40 mb-1.5">{t('Vorlage übernehmen')}</p>
            <div className="flex flex-wrap gap-1.5">
              {([['linear', t('Linear: +2,5 % Gewicht/Woche')], ['volume', t('Volumen: +1 Wdh/Woche')], ['flat', t('Gleich, nur Deload markieren')]] as const).map(([p, label]) => (
                <button key={p} onClick={() => applyPreset(p)} className="adlr-tap px-2.5 py-1.5 rounded-lg text-[11px] font-medium" style={{ background: 'rgb(var(--adlr-gold) / 0.12)', color: 'rgb(var(--adlr-gold))' }}>{label}</button>
              ))}
            </div>
            <p className="text-[10px] text-white/35 mt-1.5">{t('Jede 4. Woche ist bei den Vorlagen eine Deload-Woche.')}</p>
          </div>
          {weeks > 0 && (
            <div className="space-y-1.5">
              <div className="grid grid-cols-[2.2rem_repeat(4,1fr)_3.2rem] gap-1.5 text-[9px] uppercase tracking-wide text-white/35 text-center">
                <span />{FIELDS.map((f) => <span key={f.key}>{t(f.label)}</span>)}<span>{t('Deload')}</span>
              </div>
              {Array.from({ length: weeks }, (_, i) => i + 1).map((wk) => {
                const r = rules.find((x) => x.week === wk);
                return (
                  <div key={wk}>
                    <div className="grid grid-cols-[2.2rem_repeat(4,1fr)_3.2rem] gap-1.5 items-center">
                      <span className="text-xs font-semibold text-white/70">W{wk}</span>
                      {FIELDS.map((f) => (
                        <input
                          key={f.key}
                          type="number"
                          inputMode="decimal"
                          step={f.step}
                          value={r?.[f.key] ?? ''}
                          placeholder={f.placeholder}
                          onChange={(e) => setField(wk, f.key, e.target.value)}
                          onBlur={() => save({ week_rules: rules })}
                          className={inputCls}
                        />
                      ))}
                      <button onClick={() => toggleDeload(wk)} className="adlr-tap h-7 rounded-md text-[10px] font-semibold" style={r?.deload ? { background: 'rgb(var(--adlr-gold))', color: '#000' } : { background: 'rgb(var(--text) / 0.06)', color: 'rgb(var(--text) / 0.4)' }}>
                        {r?.deload ? '✓' : '–'}
                      </button>
                    </div>
                    <p className="text-[10px] text-white/35 pl-[2.6rem] mt-0.5">{ruleSummary(r ?? null)}</p>
                  </div>
                );
              })}
              <p className="text-[10px] text-white/35">{t('Woche 1 beginnt am Tag der Zuweisung. Erneutes Zuweisen startet das Programm neu.')}</p>
            </div>
          )}
          {err && <p className="text-xs text-red-400">{err}</p>}
        </div>
      )}
    </div>
  );
}
