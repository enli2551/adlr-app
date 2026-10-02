import { useEffect, useState } from 'react';
import { HeartPulse, RefreshCw, Settings2 } from 'lucide-react';
import { CollapsibleCard } from '@/components/ui';
import HealthSummary from '@/components/HealthSummary';
import {
  healthAvailability, connectHealth, disconnectHealth, isHealthEnabled, syncHealth, openHealthSettings, healthPlatformName,
} from '@/lib/health';
import { Capacitor } from '@capacitor/core';
import { t } from '@/lib/i18n';

// Client-side (Profil): connect Apple Health / Health Connect and show the synced week.
export default function HealthConnectCard({ clientId }: { clientId: string }) {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [reason, setReason] = useState<string | undefined>();
  const [enabled, setEnabled] = useState(isHealthEnabled());
  const [busy, setBusy] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);
  const name = healthPlatformName();

  useEffect(() => { healthAvailability().then((a) => { setAvailable(a.available); setReason(a.reason); }); }, []);

  const connect = async () => {
    setBusy(true); setMsg(null);
    try {
      const ok = await connectHealth();
      setEnabled(ok);
      if (ok) { await syncHealth(clientId, true); setRefreshKey((k) => k + 1); }
      else setMsg(t('Keine Berechtigung erteilt. Du kannst sie jederzeit in den Einstellungen ändern.'));
    } catch {
      setMsg(t('{name} konnte nicht geöffnet werden.', { name }));
    }
    setBusy(false);
  };
  const resync = async () => {
    setBusy(true);
    await syncHealth(clientId, true);
    setRefreshKey((k) => k + 1);
    setBusy(false);
  };

  return (
    <CollapsibleCard
      id="health"
      className="mb-5"
      icon={HeartPulse}
      title={name}
      defaultOpen={false}
      summary={enabled ? t('Verbunden') : t('Nicht verbunden')}
      actions={enabled && (
          <div className="flex items-center gap-1">
            <button onClick={resync} disabled={busy} aria-label={t('Synchronisieren')} className="adlr-tap p-1.5 rounded-lg bg-white/5 text-white/50 disabled:opacity-40">
              <RefreshCw size={14} className={busy ? 'animate-spin' : ''} />
            </button>
            {Capacitor.getPlatform() === 'android' && (
              <button onClick={openHealthSettings} aria-label={t('Einstellungen')} className="adlr-tap p-1.5 rounded-lg bg-white/5 text-white/50"><Settings2 size={14} /></button>
            )}
          </div>
        )}
    >
      {!enabled ? (
        <>
          <p className="text-xs text-white/50 mb-3 leading-relaxed">
            {t('Verbinde {name}, damit Schritte, Schlaf, Gewicht, Ruhepuls und deine gegessenen Kalorien (z. B. aus YAZIO) automatisch übernommen werden — auch dein Coach sieht sie. Nur Lesen, nichts wird verändert.', { name })}
          </p>
          {available === false ? (
            <p className="text-xs text-white/35">
              {Capacitor.isNativePlatform()
                ? `${t('{name} ist auf diesem Gerät nicht verfügbar', { name })}${Capacitor.getPlatform() === 'android' ? t(' — installiere „Health Connect“ aus dem Play Store.') : '.'}`
                : reason && t(reason)}
            </p>
          ) : (
            <button
              onClick={connect}
              disabled={busy || available === null}
              className="adlr-tap w-full py-3 rounded-xl text-sm font-semibold disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, rgb(var(--adlr-gold)), rgb(var(--adlr-gold-dim)))', color: '#000' }}
            >
              {busy ? '…' : t('Mit {name} verbinden', { name })}
            </button>
          )}
        </>
      ) : (
        <>
          <HealthSummary clientId={clientId} refreshKey={refreshKey} emptyText={t('Verbunden — sobald {name} Daten hat, erscheinen sie hier.', { name })} />
          <button onClick={() => { disconnectHealth(); setEnabled(false); }} className="adlr-tap mt-3 text-xs text-white/35 underline">
            {t('Synchronisierung beenden')}
          </button>
        </>
      )}
      {msg && <p className="text-xs text-white/45 mt-2">{msg}</p>}
    </CollapsibleCard>
  );
}
