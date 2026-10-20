import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Trash2, X } from 'lucide-react';
import { MEALS, totalsFor, type Food, type Meal } from '@/lib/food';
import { t, fmtNum } from '@/lib/i18n';

/** How much? — grams (or servings), meal, live totals. Also used to edit / delete an entry. */
export default function FoodAmountSheet({ food, initialGrams, initialMeal, onSave, onDelete, onClose }: {
  food: Food;
  initialGrams?: number;
  initialMeal: Meal;
  onSave: (grams: number, meal: Meal) => Promise<boolean>;
  onDelete?: () => Promise<void>;
  onClose: () => void;
}) {
  const [grams, setGrams] = useState(String(initialGrams ?? food.serving_g ?? 100));
  const [meal, setMeal] = useState<Meal>(initialMeal);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  const g = Number(grams.replace(',', '.'));
  const valid = Number.isFinite(g) && g > 0 && g <= 5000;
  const tot = totalsFor(food.per100, valid ? g : 0);
  const chips = [...new Set([food.serving_g ?? null, 50, 100, 150, 200].filter((x): x is number => !!x && x > 0))].slice(0, 5);

  const save = async () => {
    if (!valid) return;
    setBusy(true); setErr(false);
    const ok = await onSave(Math.round(g * 10) / 10, meal);
    setBusy(false);
    if (!ok) setErr(true);
  };

  return createPortal(
    <div className="fixed inset-0 z-[80] bg-black/70 flex items-end sm:items-center justify-center adlr-fade-in" onClick={onClose}>
      <div className="w-full max-w-md rounded-t-3xl sm:rounded-3xl p-5 bg-adlr-anthracite" style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom))' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-1">
          <div className="min-w-0">
            <p className="text-lg font-bold text-white leading-tight">{food.name}</p>
            {food.brand && <p className="text-xs text-white/45 truncate">{food.brand}</p>}
          </div>
          <button onClick={onClose} aria-label={t('Schließen')} className="adlr-tap p-1.5 text-white/40 shrink-0"><X size={18} /></button>
        </div>
        <p className="text-[11px] text-white/40 mb-4">
          {t('pro 100 g')}: {fmtNum(food.per100.kcal)} kcal · P {fmtNum(food.per100.protein)} · KH {fmtNum(food.per100.carbs)} · F {fmtNum(food.per100.fat)}
        </p>

        <div className="flex items-center gap-3 mb-2">
          <input inputMode="decimal" autoFocus value={grams} onChange={(e) => setGrams(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
            className="w-28 bg-inset border border-white/10 rounded-xl px-3 py-3 text-2xl font-bold text-white outline-none text-center" />
          <span className="text-lg text-white/60">g</span>
          <div className="flex-1 text-right">
            <p className="text-2xl font-bold text-adlr-gold leading-none">{fmtNum(tot.kcal)}</p>
            <p className="text-[10px] uppercase tracking-wide text-white/40 mt-1">kcal</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 mb-4">
          {chips.map((c) => (
            <button key={c} onClick={() => setGrams(String(c))} className="adlr-tap px-2.5 py-1.5 rounded-lg text-xs font-medium"
              style={Number(grams) === c ? { background: 'rgb(var(--adlr-gold))', color: '#000' } : { background: 'rgb(var(--text) / 0.06)', color: 'rgb(var(--text) / 0.65)' }}>
              {c === food.serving_g && food.serving_label ? `${t(food.serving_label)} · ${c} g` : `${c} g`}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-2 mb-4">
          {([['Protein', tot.protein_g], ['Kohlenhydrate', tot.carbs_g], ['Fett', tot.fat_g]] as const).map(([l, v]) => (
            <div key={l} className="rounded-xl py-2 text-center" style={{ background: 'rgb(var(--text) / 0.04)' }}>
              <p className="text-base font-bold text-white">{fmtNum(v)} g</p>
              <p className="text-[10px] text-white/40">{t(l)}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-4 gap-1 p-1 rounded-xl mb-4" style={{ background: 'rgb(var(--text) / 0.05)' }}>
          {MEALS.map((m) => (
            <button key={m.id} onClick={() => setMeal(m.id)} className="adlr-tap py-2 rounded-lg text-[11px] font-semibold"
              style={meal === m.id ? { background: 'rgb(var(--adlr-gold))', color: '#000' } : { color: 'rgb(var(--text) / 0.55)' }}>{t(m.label)}</button>
          ))}
        </div>

        {err && <p className="text-xs text-red-400 mb-2">{t('Konnte nicht gespeichert werden.')}</p>}
        <div className="flex gap-2">
          {onDelete && (
            <button onClick={async () => { setBusy(true); await onDelete(); setBusy(false); }} disabled={busy} aria-label={t('Löschen')}
              className="adlr-tap px-4 rounded-xl text-red-400 disabled:opacity-50" style={{ background: 'rgb(239 68 68 / 0.1)' }}><Trash2 size={17} /></button>
          )}
          <button onClick={save} disabled={busy || !valid} className="adlr-tap flex-1 py-3 rounded-xl text-sm font-semibold disabled:opacity-50" style={{ background: 'rgb(var(--adlr-gold))', color: '#000' }}>
            {busy ? '…' : onDelete ? t('Speichern') : t('Hinzufügen')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
