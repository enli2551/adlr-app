import { useState } from 'react';
import { useAuth, useCoachName } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { SectionHeader, Button } from '@/components/ui';
import { Check } from 'lucide-react';
import { t } from '@/lib/i18n';

interface Upgrade {
  key: string;
  title: string;
  desc: string;
  price: string;
  cta: string;
}

const UPGRADES: Upgrade[] = [
  { key: 'nutrition', title: 'ERNÄHRUNGS-ANALYSE', desc: 'Personalisierter Ernährungsplan basierend auf deinen Zielen.', price: '€49', cta: 'Jetzt anfragen' },
  { key: 'body', title: 'KÖRPERANALYSE SESSION', desc: 'InBody-Messung + detaillierter Report von deinem Coach persönlich.', price: '€29 / Session', cta: 'Termin anfragen' },
  { key: 'extra', title: 'EXTRA SESSION', desc: 'Eine zusätzliche 1-on-1 Einheit mit deinem Coach.', price: '€65 / Session', cta: 'Buchen' },
  { key: 'checkin', title: 'MONATLICHER CHECK-IN CALL', desc: '30 Minuten Video-Review deiner Fortschritte mit deinem Coach.', price: '€39 / Monat', cta: 'Aktivieren' },
  { key: 'transformation', title: 'TRANSFORMATION PAKET', desc: '3 Monate intensiv. Für die, die es ernst meinen.', price: 'Individuell — frag deinen Coach', cta: 'Gespräch anfragen' },
];

export default function UpgradesScreen() {
  const { profile } = useAuth();
  const coach = useCoachName();
  const [requested, setRequested] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const request = async (u: Upgrade) => {
    if (!profile) return;
    setBusy(true);
    await supabase.from('upsell_requests').insert({ client_id: profile.id, upgrade_key: u.key });
    setBusy(false);
    setRequested(u.key);
    setTimeout(() => setRequested(null), 2500);
  };

  return (
    <div className="adlr-fade-in">
      <SectionHeader title={t('Geh weiter.')} subtitle={t('Für die, die mehr wollen.')} />
      <div className="space-y-4">
        {UPGRADES.map((u) => {
          const isRequested = requested === u.key;
          return (
            <div key={u.key} className="adlr-card adlr-gold-border p-5 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-adlr-gold/5 rounded-full blur-3xl -mr-16 -mt-16" />
              <p className="text-xs adlr-gold-text font-bold tracking-widest mb-2">{t(u.title)}</p>
              <p className="text-sm text-white/60 mb-4 leading-relaxed">{t(u.desc)}</p>
              <div className="flex items-center justify-between">
                <p className="text-lg font-bold text-white">{t(u.price)}</p>
                <Button
                  variant={isRequested ? 'ghost' : 'gold-outline'}
                  onClick={() => request(u)}
                  disabled={busy || isRequested}
                  className="text-sm"
                >
                  {isRequested ? (
                    <span className="flex items-center gap-1.5"><Check size={14} /> {t('An {coach} gesendet', { coach })}</span>
                  ) : t(u.cta)}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-center text-xs text-white/30 mt-8">{t('Bereit für mehr? {coach} wartet.', { coach })}</p>
    </div>
  );
}
