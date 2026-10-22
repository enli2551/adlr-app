import { useState } from 'react';
import { Download } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { t } from '@/lib/i18n';
import { buildExport, saveExport } from '@/lib/dataExport';
import { captureError } from '@/lib/monitoring';

/** "Meine Daten exportieren": all of the user's own data as a JSON file. */
export default function DataExport() {
  const { profile } = useAuth();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const run = async () => {
    if (!profile || busy) return;
    setBusy(true); setMsg(null); setErr(null);
    try {
      const data = await buildExport(profile.id, profile.role);
      const res = await saveExport(data);
      if (res !== 'cancelled') setMsg(t('Export erstellt.'));
    } catch (e) {
      captureError(e, { action: 'data_export' });
      setErr(t('Export fehlgeschlagen. Bitte später erneut versuchen.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <p className="text-xs text-white/55 leading-relaxed mb-4">
        {t('Lade alle deine gespeicherten Daten (Profil, Trainings, Fortschritt, Ernährung, Nachrichten …) als JSON-Datei herunter.')}
      </p>
      {err && <p className="text-xs text-red-400 mb-2">{err}</p>}
      {msg && <p className="text-xs text-green-400 mb-2">{msg}</p>}
      <button
        onClick={run}
        disabled={busy}
        className="adlr-tap w-full py-3 rounded-xl text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
        style={{ background: 'rgb(var(--adlr-gold))', color: '#000' }}
      >
        <Download size={16} /> {busy ? t('Wird erstellt …') : t('Daten exportieren')}
      </button>
    </div>
  );
}
