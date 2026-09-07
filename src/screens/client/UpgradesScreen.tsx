import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { SectionHeader, Button } from '@/components/ui';
import { Check } from 'lucide-react';

interface Upgrade {
  key: string;
  title: string;
  desc: string;
  price: string;
  cta: string;
}

const UPGRADES: Upgrade[] = [
  { key: 'nutrition', title: 'ERNÄHRUNGS-ANALYSE', desc: 'Personalisierter Ernährungsplan basierend auf deinen Zielen.', price: '€49', cta: 'Jetzt anfragen' },
  { key: 'body', title: 'KÖRPERANALYSE SESSION', desc: 'InBody-Messung + detaillierter Report von Peter persönlich.', price: '€29 / Session', cta: 'Termin anfragen' },
  { key: 'extra', title: 'EXTRA SESSION', desc: 'Eine zusätzliche 1-on-1 Einheit mit Peter.', price: '€65 / Session', cta: 'Buchen' },
  { key: 'checkin', title: 'MONATLICHER CHECK-IN CALL', desc: '30 Minuten Video-Review deiner Fortschritte mit Peter.', price: '€39 / Monat', cta: 'Aktivieren' },
  { key: 'transformation', title: 'TRANSFORMATION PAKET', desc: '3 Monate intensiv. Für die, die es ernst meinen.', price: 'Individuell — kontaktiere Peter', cta: 'Gespräch anfragen' },
];

export default function UpgradesScreen() {
  const { profile } = useAuth();
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
      <SectionHeader title="Geh weiter." subtitle="Für die, die mehr wollen." />
      <div className="space-y-4">
        {UPGRADES.map((u) => {
          const isRequested = requested === u.key;
          return (
            <div key={u.key} className="adlr-card adlr-gold-border p-5 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-adlr-gold/5 rounded-full blur-3xl -mr-16 -mt-16" />
              <p className="text-xs adlr-gold-text font-bold tracking-widest mb-2">{u.title}</p>
              <p className="text-sm text-white/60 mb-4 leading-relaxed">{u.desc}</p>
              <div className="flex items-center justify-between">
                <p className="text-lg font-bold text-white">{u.price}</p>
                <Button
                  variant={isRequested ? 'ghost' : 'gold-outline'}
                  onClick={() => request(u)}
                  disabled={busy || isRequested}
                  className="text-sm"
                >
                  {isRequested ? (
                    <span className="flex items-center gap-1.5"><Check size={14} /> An Peter gesendet</span>
                  ) : u.cta}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-center text-xs text-white/30 mt-8">Bereit für mehr? Peter wartet.</p>
    </div>
  );
}
