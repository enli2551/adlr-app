import { useState } from 'react';
import { Check, Pencil } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/types';
import type { MacroTargets } from '@/lib/food';
import { t, fmtNum } from '@/lib/i18n';

/** Coach: daily protein / carbs / fat targets for a client (shown in their food diary).
 *  Suggestion from the kcal target + body weight: protein 2 g/kg, fat 25 % of kcal, rest carbs. */
export default function MacroTargetsEditor({ client, kcalTarget }: { client: Profile; kcalTarget: number | null }) {
  const initial = (client as Profile & { macro_targets?: MacroTargets | null }).macro_targets ?? null;
  const [saved, setSaved] = useState<MacroTargets | null>(initial);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ p: '', c: '', f: '' });
  const [err, setErr] = useState<string | null>(null);

  const suggest = (): { p: number; c: number; f: number } | null => {
    if (!kcalTarget || !client.weight_kg) return null;
    const p = Math.round((client.weight_kg * 2) / 5) * 5;
    const f = Math.round((kcalTarget * 0.25) / 9 / 5) * 5;
    const c = Math.max(0, Math.round((kcalTarget - p * 4 - f * 9) / 4 / 5) * 5);
    return { p, c, f };
  };
  const open = () => {
    const s = saved?.protein_g != null ? { p: saved.protein_g, c: saved.carbs_g ?? 0, f: saved.fat_g ?? 0 } : suggest();
    setForm({ p: s ? String(s.p) : '', c: s ? String(s.c) : '', f: s ? String(s.f) : '' });
    setEditing(true);
  };
  const save = async () => {
    const n = (v: string) => (v.trim() === '' ? null : Math.round(Number(v.replace(',', '.'))));
    const value: MacroTargets | null = n(form.p) == null && n(form.c) == null && n(form.f) == null ? null : { protein_g: n(form.p), carbs_g: n(form.c), fat_g: n(form.f) };
    setErr(null);
    const { error } = await supabase.from('profiles').update({ macro_targets: value }).eq('id', client.id);
    if (error) { setErr(t('Speichern fehlgeschlagen (Migration food_log ausgeführt?)')); return; }
    setSaved(value); setEditing(false);
  };
  const kcalOf = (m: { p: number; c: number; f: number }) => m.p * 4 + m.c * 4 + m.f * 9;

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-1">
        <p className="text-[10px] uppercase text-white/35">{t('Makro-Ziele pro Tag')}</p>
        {!editing && <button onClick={open} className="adlr-tap p-1 text-white/40" aria-label={t('Bearbeiten')}><Pencil size={12} /></button>}
      </div>
      {editing ? (
        <div className="space-y-2">
          <div className="grid grid-cols-3 gap-2">
            {([['p', 'Protein'], ['c', 'KH'], ['f', 'Fett']] as const).map(([k, l]) => (
              <label key={k} className="text-[10px] text-white/45">{t(l)} (g)
                <input inputMode="numeric" value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                  className="mt-1 w-full bg-inset border border-white/10 rounded-lg px-2 py-1.5 text-sm text-white outline-none text-center" />
              </label>
            ))}
          </div>
          <p className="text-[11px] text-white/40">
            ≈ {fmtNum(kcalOf({ p: Number(form.p) || 0, c: Number(form.c) || 0, f: Number(form.f) || 0 }))} kcal
            {kcalTarget ? ` · ${t('Kalorienziel')} ${fmtNum(kcalTarget)} kcal` : ''}
          </p>
          {err && <p className="text-xs text-red-400">{err}</p>}
          <div className="flex gap-2">
            <button onClick={save} className="adlr-tap flex-1 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1" style={{ background: 'rgb(var(--adlr-gold))', color: '#000' }}><Check size={13} /> {t('Speichern')}</button>
            {suggest() && <button onClick={() => { const s = suggest()!; setForm({ p: String(s.p), c: String(s.c), f: String(s.f) }); }} className="adlr-tap px-3 rounded-lg text-xs bg-white/5 text-white/60">{t('Vorschlag')}</button>}
            <button onClick={() => setEditing(false)} className="adlr-tap px-3 rounded-lg text-xs bg-white/5 text-white/60">{t('Abbrechen')}</button>
          </div>
        </div>
      ) : saved?.protein_g != null ? (
        <p className="text-sm text-white/85 font-semibold">P {saved.protein_g} g · KH {saved.carbs_g ?? '—'} g · F {saved.fat_g ?? '—'} g</p>
      ) : (
        <button onClick={open} className="adlr-tap text-xs text-adlr-gold">{t('Makro-Ziele festlegen')}</button>
      )}
    </div>
  );
}
