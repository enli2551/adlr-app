import { useState } from 'react';
import { ImagePlus, Trash2, Check, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { BRAND_PRESETS } from '@/lib/branding';
import { resizeLogoToDataUrl } from '@/lib/image';
import { t } from '@/lib/i18n';

/** Trainer account menu: own logo + main colour, shown in the app of all their clients. */
export default function BrandingSettings() {
  const { profile, refreshProfile } = useAuth();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!profile) return null;
  const color = profile.brand_color ?? null;

  const save = async (patch: { brand_logo?: string | null; brand_color?: string | null }) => {
    setBusy(true); setErr(null);
    const { error } = await supabase.from('profiles').update(patch).eq('id', profile.id);
    if (error) setErr(t('Speichern fehlgeschlagen. Ist die Datenbank-Migration für Branding ausgeführt?'));
    else await refreshProfile();
    setBusy(false);
  };
  const pickLogo = async (f: File | undefined) => {
    if (!f) return;
    try { await save({ brand_logo: await resizeLogoToDataUrl(f) }); } catch { setErr(t('Bild konnte nicht gelesen werden.')); }
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <div className="flex-1 h-12 rounded-lg flex items-center justify-center overflow-hidden px-2" style={{ background: 'rgb(var(--text) / 0.05)' }}>
          {profile.brand_logo ? <img src={profile.brand_logo} alt="" className="max-h-10 max-w-full object-contain" /> : <span className="text-[11px] text-white/35">{t('Kein Logo — ADLR wird angezeigt')}</span>}
        </div>
        <label className="adlr-tap w-10 h-10 rounded-lg flex items-center justify-center cursor-pointer" style={{ background: 'rgb(var(--adlr-gold) / 0.15)', color: 'rgb(var(--adlr-gold))' }} aria-label={t('Logo hochladen')}>
          {busy ? <Loader2 size={16} className="animate-spin" /> : <ImagePlus size={16} />}
          <input type="file" accept="image/*" className="hidden" onChange={(e) => pickLogo(e.target.files?.[0])} />
        </label>
        {profile.brand_logo && (
          <button onClick={() => save({ brand_logo: null })} className="adlr-tap w-10 h-10 rounded-lg flex items-center justify-center bg-white/5 text-white/45" aria-label={t('Logo entfernen')}><Trash2 size={15} /></button>
        )}
      </div>
      <p className="text-[11px] text-white/40 mb-1.5 px-0.5">{t('Hauptfarbe')}</p>
      <div className="flex flex-wrap gap-1.5 items-center">
        <button onClick={() => save({ brand_color: null })} className="adlr-tap h-7 px-2 rounded-full text-[10px] font-semibold flex items-center gap-1" style={{ background: 'rgb(var(--text) / 0.06)', color: 'rgb(var(--text) / 0.7)', outline: color ? 'none' : '2px solid rgb(var(--text) / 0.6)' }}>
          {!color && <Check size={11} />} ADLR
        </button>
        {BRAND_PRESETS.map((c) => (
          <button key={c} onClick={() => save({ brand_color: c })} className="adlr-tap w-7 h-7 rounded-full flex items-center justify-center" style={{ background: c, outline: color?.toLowerCase() === c.toLowerCase() ? '2px solid rgb(var(--text))' : 'none', outlineOffset: 2 }} aria-label={c}>
            {color?.toLowerCase() === c.toLowerCase() && <Check size={13} color="#000" />}
          </button>
        ))}
        <label className="adlr-tap relative w-7 h-7 rounded-full overflow-hidden cursor-pointer" style={{ background: 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)' }} aria-label={t('Eigene Farbe')}>
          <input type="color" value={color ?? '#c9a84c'} onChange={(e) => save({ brand_color: e.target.value })} className="absolute inset-0 opacity-0 cursor-pointer" />
        </label>
      </div>
      <p className="text-[10px] text-white/35 mt-1.5 px-0.5 leading-snug">{t('Logo und Farbe sehen alle deine Klienten in ihrer App. Sehr dunkle oder helle Farben werden für die Lesbarkeit angepasst.')}</p>
      {err && <p className="text-[11px] text-red-400 mt-1">{err}</p>}
    </div>
  );
}
