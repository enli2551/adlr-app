import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Utensils } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { localDateKey } from '@/lib/dates';
import { addLog, dayLogs, MEALS, sumLogs, totalsFor, type Food, type FoodLog, type Meal } from '@/lib/food';
import FoodSearch from '@/components/food/FoodSearch';
import FoodAmountSheet from '@/components/food/FoodAmountSheet';
import { haptic } from '@/lib/haptics';
import { t, fmtNum, fmtDate } from '@/lib/i18n';

/** Client Ernährung: what I ate, per meal — add from search/barcode, tap to change or delete. */
export default function FoodDiary({ clientId, onChanged, readOnly = false }: { clientId: string; onChanged?: () => void; readOnly?: boolean }) {
  const [day, setDay] = useState(localDateKey(new Date()));
  const [logs, setLogs] = useState<FoodLog[] | null>(null);
  const [missing, setMissing] = useState(false);
  const [searchFor, setSearchFor] = useState<Meal | null>(null);
  const [picked, setPicked] = useState<{ food: Food; grams?: number; meal: Meal } | null>(null);
  const [editing, setEditing] = useState<FoodLog | null>(null);
  const [open, setOpen] = useState<Set<Meal>>(new Set());

  const load = async () => {
    const r = await dayLogs(clientId, day);
    if (r === null) { setMissing(true); setLogs([]); return; }
    setLogs(r);
  };
  useEffect(() => { setLogs(null); load(); }, [clientId, day]);

  const today = localDateKey(new Date());
  const shift = (n: number) => { const d = new Date(`${day}T12:00:00`); d.setDate(d.getDate() + n); setDay(localDateKey(d)); };
  const changed = () => { load(); onChanged?.(); };

  if (missing) return null; // migration not run yet → the screen stays as before

  const total = sumLogs(logs ?? []);
  return (
    <div className={readOnly ? 'pb-2' : 'adlr-card p-4 mb-4'}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-medium text-white/85 flex items-center gap-2"><Utensils size={16} className="text-adlr-gold" /> {readOnly ? '' : t('Ernährungstagebuch')}</p>
        <div className="flex items-center gap-1">
          <button onClick={() => shift(-1)} aria-label={t('Vortag')} className="adlr-tap p-1 text-white/45"><ChevronLeft size={16} /></button>
          <span className="text-xs text-white/60 min-w-[4.5rem] text-center">{day === today ? t('Heute') : fmtDate(`${day}T12:00:00`, { weekday: 'short', day: 'numeric', month: 'numeric' })}</span>
          <button onClick={() => shift(1)} disabled={day >= today} aria-label={t('Nächster Tag')} className="adlr-tap p-1 text-white/45 disabled:opacity-20"><ChevronRight size={16} /></button>
        </div>
      </div>

      {MEALS.map((m) => {
        const items = (logs ?? []).filter((l) => l.meal === m.id);
        const sum = sumLogs(items);
        const isOpen = open.has(m.id) || items.length <= 3;
        return (
          <div key={m.id} className="py-2" style={{ borderTop: '1px solid rgb(var(--text) / 0.05)' }}>
            <div className="flex items-center gap-2">
              <button onClick={() => setOpen((s) => { const n = new Set(s); if (n.has(m.id)) n.delete(m.id); else n.add(m.id); return n; })} className="adlr-tap flex-1 min-w-0 flex items-baseline gap-2 text-left">
                <span className="text-sm font-semibold text-white">{t(m.label)}</span>
                <span className="text-xs text-white/40">{items.length ? `${fmtNum(sum.kcal)} kcal` : ''}</span>
              </button>
              {!readOnly && <button onClick={() => setSearchFor(m.id)} aria-label={t('Hinzufügen')} className="adlr-tap w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'rgb(var(--adlr-gold) / 0.14)', color: 'rgb(var(--adlr-gold))' }}><Plus size={16} /></button>}
            </div>
            {items.length > 0 && isOpen && (
              <div className="mt-1">
                {items.map((l) => (
                  <button key={l.id} onClick={() => { if (!readOnly) setEditing(l); }} className="adlr-tap w-full flex items-center gap-2 py-1.5 text-left">
                    <span className="flex-1 min-w-0 text-[13px] text-white/75 truncate">{l.name}{l.brand ? <span className="text-white/35"> · {l.brand}</span> : null}</span>
                    <span className="text-[11px] text-white/40 shrink-0">{fmtNum(Number(l.amount_g))} g · {fmtNum(Number(l.kcal))} kcal</span>
                  </button>
                ))}
              </div>
            )}
            {items.length > 3 && !open.has(m.id) && (
              <button onClick={() => setOpen((s) => new Set(s).add(m.id))} className="adlr-tap text-[11px] text-adlr-gold mt-1">{t('{n} Einträge anzeigen', { n: items.length })}</button>
            )}
          </div>
        );
      })}

      {readOnly && logs && logs.length === 0 && <p className="text-xs text-white/40 text-center py-3">{t('An diesem Tag nichts eingetragen.')}</p>}
      {logs && logs.length > 0 && (
        <div className="grid grid-cols-4 gap-1.5 pt-3" style={{ borderTop: '1px solid rgb(var(--text) / 0.05)' }}>
          {([['kcal', total.kcal, ''], ['Protein', total.protein_g, ' g'], ['KH', total.carbs_g, ' g'], ['Fett', total.fat_g, ' g']] as const).map(([l, v, u]) => (
            <div key={l} className="text-center">
              <p className="text-sm font-bold text-white">{fmtNum(Math.round(v))}{u}</p>
              <p className="text-[10px] text-white/40">{t(l)}</p>
            </div>
          ))}
        </div>
      )}

      {searchFor && (
        <FoodSearch clientId={clientId} title={t(MEALS.find((m) => m.id === searchFor)!.label)} onClose={() => setSearchFor(null)}
          onPick={(food, grams) => setPicked({ food, grams, meal: searchFor })} />
      )}
      {picked && (
        <FoodAmountSheet food={picked.food} initialGrams={picked.grams} initialMeal={picked.meal} onClose={() => setPicked(null)}
          onSave={async (g, meal) => {
            const { error } = await addLog(clientId, day, meal, picked.food, g);
            if (error) return false;
            haptic.light();
            setPicked(null); setSearchFor(null); changed();
            return true;
          }} />
      )}
      {editing && (
        <FoodAmountSheet
          food={{ source: editing.source, id: editing.source_id ?? editing.id, name: editing.name, brand: editing.brand, per100: editing.per100 ?? perHundredFrom(editing) }}
          initialGrams={Number(editing.amount_g)} initialMeal={editing.meal} onClose={() => setEditing(null)}
          onSave={async (g, meal) => {
            const per100 = editing.per100 ?? perHundredFrom(editing);
            const { error } = await supabase.from('food_logs').update({ amount_g: g, meal, ...totalsFor(per100, g) }).eq('id', editing.id);
            if (error) return false;
            setEditing(null); changed();
            return true;
          }}
          onDelete={async () => { await supabase.from('food_logs').delete().eq('id', editing.id); setEditing(null); changed(); }} />
      )}
    </div>
  );
}

const perHundredFrom = (l: FoodLog) => {
  const f = 100 / Number(l.amount_g || 100);
  return { kcal: Number(l.kcal) * f, protein: Number(l.protein_g) * f, carbs: Number(l.carbs_g) * f, fat: Number(l.fat_g) * f };
};

