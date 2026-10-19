import { useState } from 'react';
import { Vibrate } from 'lucide-react';
import { hapticsEnabled, setHapticsEnabled } from '@/lib/haptics';
import { t } from '@/lib/i18n';

/** Settings switch: short vibrations on meaningful actions (set ticked, workout done …). */
export default function HapticsToggle() {
  const [on, setOn] = useState(hapticsEnabled());
  return (
    <label className="flex items-center gap-2.5 mt-4 text-sm text-white/75">
      <Vibrate size={14} className="text-adlr-gold" />
      <span className="flex-1">{t('Vibration bei Aktionen')}</span>
      <input type="checkbox" checked={on} onChange={(e) => { setOn(e.target.checked); setHapticsEnabled(e.target.checked); }} className="accent-[rgb(var(--adlr-gold))] w-4 h-4" />
    </label>
  );
}
