import { Check } from 'lucide-react';
import { LANGS, setLang, useLang } from '@/lib/i18n';

/** Full list picker (Profile / trainer menu). */
export default function LanguageSwitcher() {
  const active = useLang();
  return (
    <div className="space-y-2">
      {LANGS.map((l) => {
        const on = active === l.id;
        return (
          <button
            key={l.id}
            onClick={() => setLang(l.id)}
            className="adlr-tap w-full flex items-center gap-3 rounded-xl px-3 py-2.5 border transition-all"
            style={on
              ? { borderColor: 'rgb(var(--adlr-gold))', background: 'rgb(var(--adlr-gold) / 0.08)' }
              : { borderColor: 'rgb(var(--text) / 0.1)', background: 'rgb(var(--text) / 0.03)' }}
          >
            <span className="w-8 text-xs font-bold tracking-wider text-adlr-gold shrink-0">{l.short}</span>
            <span className="flex-1 text-left text-sm font-medium text-white">{l.label}</span>
            {on && <Check size={16} className="text-adlr-gold shrink-0" />}
          </button>
        );
      })}
    </div>
  );
}

/** Compact DE · EN · HU segmented pill (login screen). */
export function LanguagePill() {
  const active = useLang();
  return (
    <div className="inline-flex gap-0.5 p-0.5 rounded-lg border border-white/10 bg-inset">
      {LANGS.map((l) => (
        <button
          key={l.id}
          onClick={() => setLang(l.id)}
          aria-label={l.label}
          className="adlr-tap px-2.5 py-1 rounded-md text-[11px] font-semibold tracking-wider transition-all"
          style={active === l.id
            ? { background: 'rgb(var(--adlr-gold))', color: '#000' }
            : { color: 'rgb(var(--text) / 0.5)' }}
        >
          {l.short}
        </button>
      ))}
    </div>
  );
}
