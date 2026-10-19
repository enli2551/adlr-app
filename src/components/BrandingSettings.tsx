import { useState } from 'react';
import { ImagePlus, Trash2, Check, Loader2, ChevronDown, Sparkles } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { BRAND_PRESETS, usableAccent } from '@/lib/branding';
import { resizeLogoToDataUrl } from '@/lib/image';
import { t } from '@/lib/i18n';

export const brandSwatch = (c: string | null) => (c ? `rgb(${usableAccent(c).join(' ')})` : 'rgb(201 168 76)');

/** Logo upload + main colour pickers (controlled). Used in the account menu and the coach setup wizard. */
export function BrandingFields({ color, logo, onColor, onLogo, onError }: {
  color: string | null; logo: string | null;
  onColor: (c: string | null) => void; onLogo: (l: string | null) => void; onError: (msg: string) => void;
}) {
  const pickLogo = async (f: File | undefined) => {
    if (!f) return;
    try { onLogo(await resizeLogoToDataUrl(f)); } catch { onError(t('Bild konnte nicht gelesen werden.')); }
  };
  return (
    <>
      <div className="flex items-center gap-2 mb-2">
        <div className="flex-1 h-12 rounded-lg flex items-center justify-center overflow-hidden px-2" style={{ background: 'rgb(var(--text) / 0.05)' }}>
          {logo ? <img src={logo} alt="" className="max-h-10 max-w-full object-contain" /> : <span className="text-[11px] text-white/35">{t('Kein Logo — ADLR wird angezeigt')}</span>}
        </div>
        <label className="adlr-tap w-10 h-10 rounded-lg flex items-center justify-center cursor-pointer" style={{ background: 'rgb(var(--adlr-gold) / 0.15)', color: 'rgb(var(--adlr-gold))' }} aria-label={t('Logo hochladen')}>
          <ImagePlus size={16} />
          <input type="file" accept="image/*" className="hidden" onChange={(e) => pickLogo(e.target.files?.[0])} />
        </label>
        {logo && (
          <button onClick={() => onLogo(null)} className="adlr-tap w-10 h-10 rounded-lg flex items-center justify-center bg-white/5 text-white/45" aria-label={t('Logo entfernen')}><Trash2 size={15} /></button>
        )}
      </div>
      <p className="text-[11px] text-white/40 mb-1.5 px-0.5">{t('Hauptfarbe')}</p>
      <div className="flex flex-wrap gap-1.5 items-center">
        <button onClick={() => onColor(null)} className="adlr-tap h-7 px-2 rounded-full text-[10px] font-semibold flex items-center gap-1" style={{ background: 'rgb(201 168 76)', color: '#000', outline: color ? 'none' : '2px solid rgb(var(--text))', outlineOffset: 2 }}>
          {!color && <Check size={11} />} ADLR
        </button>
        {BRAND_PRESETS.filter((c) => c.toLowerCase() !== '#c9a84c').map((c) => (
          <button key={c} onClick={() => onColor(c)} className="adlr-tap w-7 h-7 rounded-full flex items-center justify-center" style={{ background: c, outline: color?.toLowerCase() === c.toLowerCase() ? '2px solid rgb(var(--text))' : 'none', outlineOffset: 2 }} aria-label={c}>
            {color?.toLowerCase() === c.toLowerCase() && <Check size={13} color="#000" />}
          </button>
        ))}
        <label className="adlr-tap relative w-7 h-7 rounded-full overflow-hidden cursor-pointer" style={{ background: 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)' }} aria-label={t('Eigene Farbe')}>
          <input type="color" value={color ?? '#c9a84c'} onChange={(e) => onColor(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer" />
        </label>
      </div>
      <p className="text-[10px] text-white/35 mt-1.5 px-0.5 leading-snug">{t('Logo und Farbe sehen alle deine Klienten in ihrer App. Sehr dunkle oder helle Farben werden für die Lesbarkeit angepasst.')}</p>
    </>
  );
}

/** Trainer account menu: own logo + main colour, shown in the app of all their clients.
 *  Collapsed by default and nothing is applied until "Speichern" — a single tap on a
 *  swatch used to change every client's app colour on the spot. */
export default function BrandingSettings({ embedded = false }: { embedded?: boolean } = {}) {
  const { profile, refreshProfile } = useAuth();
  const [openState, setOpen] = useState(false);
  const open = embedded || openState; // embedded: inside an already collapsible section
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [color, setColor] = useState<string | null>(profile?.brand_color ?? null);
  const [logo, setLogo] = useState<string | null>(profile?.brand_logo ?? null);
  if (!profile) return null;
  const savedColor = profile.brand_color ?? null;
  const savedLogo = profile.brand_logo ?? null;
  const dirty = color !== savedColor || logo !== savedLogo;

  const save = async () => {
    setBusy(true); setErr(null);
    const { error } = await supabase.from('profiles').update({ brand_color: color, brand_logo: logo }).eq('id', profile.id);
    if (error) setErr(t('Speichern fehlgeschlagen. Ist die Datenbank-Migration für Branding ausgeführt?'));
    else await refreshProfile();
    setBusy(false);
  };

  return (
    <div>
      {!embedded && <button onClick={() => setOpen(!open)} className="adlr-tap w-full flex items-center gap-2 px-1 py-1 text-left">
        <Sparkles size={15} className="text-adlr-gold shrink-0" />
        <span className="flex-1 text-xs font-medium uppercase tracking-wider text-white/50">{t('Dein Branding')}</span>
        <span className="w-4 h-4 rounded-full shrink-0" style={{ background: brandSwatch(savedColor) }} />
        <ChevronDown size={14} className="text-white/35 transition-transform" style={{ transform: open ? 'rotate(180deg)' : 'none' }} />
      </button>}
      {open && (
        <div className={embedded ? '' : 'mt-2 adlr-fade-in'}>
          <BrandingFields color={color} logo={logo} onColor={setColor} onLogo={setLogo} onError={setErr} />
          {err && <p className="text-[11px] text-red-400 mt-1">{err}</p>}
          {dirty && (
            <div className="flex gap-1.5 mt-2.5">
              <button onClick={save} disabled={busy} className="adlr-tap flex-1 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50" style={{ background: brandSwatch(color), color: '#000' }}>
                {busy && <Loader2 size={13} className="animate-spin" />} {t('Speichern')}
              </button>
              <button onClick={() => { setColor(savedColor); setLogo(savedLogo); }} className="adlr-tap px-3 py-2 rounded-lg text-xs bg-white/5 text-white/60">{t('Verwerfen')}</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
