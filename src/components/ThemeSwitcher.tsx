import { useState } from 'react';
import { Check } from 'lucide-react';
import { THEMES, getTheme, setTheme, type Theme } from '@/lib/theme';

// Fixed preview swatches — each shows its own theme's colors regardless of the active theme.
const SWATCHES: Record<Theme, { bg: string; surface: string; accent: string }> = {
  obsidian: { bg: '#0A0A0A', surface: '#1C1C1E', accent: '#C9A84C' },
  espresso: { bg: '#191512', surface: '#241D17', accent: '#D2B15C' },
  elfenbein: { bg: '#F5F2EC', surface: '#FFFFFF', accent: '#B0862E' },
};

export default function ThemeSwitcher() {
  const [active, setActive] = useState<Theme>(getTheme());
  const pick = (t: Theme) => { setTheme(t); setActive(t); };

  return (
    <div className="space-y-2">
      {THEMES.map((t) => {
        const sw = SWATCHES[t.id];
        const on = active === t.id;
        return (
          <button
            key={t.id}
            onClick={() => pick(t.id)}
            className="adlr-tap w-full flex items-center gap-3 rounded-xl px-3 py-2.5 border transition-all"
            style={on
              ? { borderColor: 'rgb(var(--adlr-gold))', background: 'rgb(var(--adlr-gold) / 0.08)' }
              : { borderColor: 'rgb(var(--text) / 0.1)', background: 'rgb(var(--text) / 0.03)' }}
          >
            <div className="flex gap-1 shrink-0">
              <span style={{ width: 16, height: 16, borderRadius: '50%', background: sw.bg, border: '0.5px solid rgb(var(--text) / 0.2)' }} />
              <span style={{ width: 16, height: 16, borderRadius: '50%', background: sw.surface, border: '0.5px solid rgb(var(--text) / 0.2)' }} />
              <span style={{ width: 16, height: 16, borderRadius: '50%', background: sw.accent }} />
            </div>
            <div className="flex-1 text-left">
              <p className="text-sm font-medium text-white">{t.label}</p>
              <p className="text-xs text-white/40">{t.hint}</p>
            </div>
            {on && <Check size={16} className="text-adlr-gold shrink-0" />}
          </button>
        );
      })}
    </div>
  );
}
