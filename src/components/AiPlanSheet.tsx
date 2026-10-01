import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Sparkles, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { captureError } from '@/lib/monitoring';
import { t } from '@/lib/i18n';
import type { Profile } from '@/lib/types';

export interface AiPlanResult { plan_id: string; name: string; rationale: string | null; unknown: string[]; used: number; limit: number }

const STEPS = ['Analysiere Ziele & Historie…', 'Wähle Übungen aus deiner Bibliothek…', 'Plane Volumen & Pausen…', 'Formuliere Hinweise für den Klienten…'];

/** Trainer: "Plan mit KI erstellen" — pick the client, add instructions, get a draft plan. */
export default function AiPlanSheet({ clients, initialClientId, onClose, onCreated }: {
  clients: Profile[];
  initialClientId?: string | null;
  onClose: () => void;
  onCreated: (r: AiPlanResult, clientId: string) => void;
}) {
  const [clientId, setClientId] = useState(initialClientId ?? '');
  const [days, setDays] = useState<number | null>(null);
  const [instructions, setInstructions] = useState('');
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const client = clients.find((c) => c.id === clientId);
  const intakeDays = (client?.intake?.trainingDays ?? []).length;

  useEffect(() => {
    if (!busy) return;
    const id = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 7000);
    return () => clearInterval(id);
  }, [busy]);

  const generate = async () => {
    if (!clientId) return;
    setBusy(true); setStep(0); setErr(null);
    const { data, error } = await supabase.functions.invoke('ai-plan', { body: { client_id: clientId, instructions, days_per_week: days } });
    setBusy(false);
    if (error || !data?.plan_id) {
      let code = '';
      try { code = (await (error as { context?: Response })?.context?.json())?.error ?? ''; } catch { /* not JSON */ }
      if (code === 'quota') setErr(t('Monatliches KI-Kontingent erreicht.'));
      else if (code === 'refused') setErr(t('Die KI konnte diesen Plan nicht erstellen. Formuliere die Anweisung anders.'));
      else {
        captureError(error ?? new Error('ai-plan: no plan_id'), { action: 'ai-plan' });
        setErr(t('KI-Plan fehlgeschlagen. Ist die Funktion „ai-plan“ deployt und der API-Schlüssel gesetzt?'));
      }
      return;
    }
    onCreated(data as AiPlanResult, clientId);
  };

  return createPortal(
    <div className="fixed inset-0 z-[70] bg-black/70 flex items-end justify-center adlr-fade-in" onClick={() => !busy && onClose()}>
      <div className="w-full max-w-md max-h-[92vh] overflow-y-auto rounded-t-3xl p-5 bg-adlr-anthracite" style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom))' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-lg font-bold text-white flex items-center gap-2"><Sparkles size={18} className="text-adlr-gold" /> {t('Plan mit KI erstellen')}</p>
            <p className="text-xs text-white/45 mt-0.5">{t('Entwurf aus Intake, Historie und Rekorden — du prüfst und weist zu.')}</p>
          </div>
          {!busy && <button onClick={onClose} aria-label={t('Schließen')} className="adlr-tap p-1.5 text-white/40"><X size={18} /></button>}
        </div>

        {busy ? (
          <div className="py-10 text-center">
            <div className="w-10 h-10 mx-auto mb-4 rounded-full border-2 border-adlr-gold/30 border-t-adlr-gold animate-spin" />
            <p className="text-sm text-white/80">{t(STEPS[step])}</p>
            <p className="text-xs text-white/35 mt-2">{t('Dauert etwa 20–60 Sekunden.')}</p>
          </div>
        ) : (
          <div className="space-y-5">
            <div>
              <p className="text-sm text-white/80 mb-2">{t('Klient')}</p>
              {clients.length === 0 ? <p className="text-xs text-white/40">{t('Noch keine Klienten.')}</p> : (
                <div className="flex flex-wrap gap-2">
                  {clients.map((c) => (
                    <button key={c.id} onClick={() => setClientId(c.id)}
                      className="adlr-tap px-3 py-1.5 rounded-full text-sm border"
                      style={clientId === c.id ? { background: 'rgb(var(--adlr-gold))', color: '#000', borderColor: 'rgb(var(--adlr-gold))' } : { color: 'rgb(var(--text) / 0.7)', borderColor: 'rgb(var(--text) / 0.15)' }}>
                      {c.first_name} {c.last_name?.[0] ? `${c.last_name[0]}.` : ''}
                    </button>
                  ))}
                </div>
              )}
              {client && (
                <p className="text-[11px] text-white/40 mt-2">
                  {[(client.intake?.goals ?? [])[0] && t(client.intake!.goals![0]), client.intake?.experience && t(`exp|${client.intake.experience}`), client.intake?.equipment && t(client.intake.equipment), (client.intake?.injuries ?? []).filter((i) => i !== 'Keine').map((i) => t(i)).join(', ')].filter(Boolean).join(' · ') || t('Kein Intake vorhanden — gib der KI ein paar Infos.')}
                </p>
              )}
            </div>
            <div>
              <p className="text-sm text-white/80 mb-2">{t('Trainingstage pro Woche')}</p>
              <div className="flex gap-1.5">
                <button onClick={() => setDays(null)} className="adlr-tap px-3 py-1.5 rounded-lg text-xs border"
                  style={days === null ? { background: 'rgb(var(--adlr-gold))', color: '#000', borderColor: 'rgb(var(--adlr-gold))' } : { color: 'rgb(var(--text) / 0.6)', borderColor: 'rgb(var(--text) / 0.12)' }}>
                  {intakeDays ? t('Laut Intake ({n})', { n: intakeDays }) : t('Automatisch')}
                </button>
                {[2, 3, 4, 5, 6].map((n) => (
                  <button key={n} onClick={() => setDays(n)} className="adlr-tap flex-1 py-1.5 rounded-lg text-xs border"
                    style={days === n ? { background: 'rgb(var(--adlr-gold))', color: '#000', borderColor: 'rgb(var(--adlr-gold))' } : { color: 'rgb(var(--text) / 0.6)', borderColor: 'rgb(var(--text) / 0.12)' }}>{n}</button>
                ))}
              </div>
            </div>
            <label className="block">
              <span className="text-sm text-white/80">{t('Deine Anweisungen (optional)')}</span>
              <textarea rows={3} value={instructions} onChange={(e) => setInstructions(e.target.value)}
                placeholder={t('z.B. Fokus Po & Beine, Knie schonen, max. 45 Min, Kurzhanteln zu Hause')}
                className="mt-1 w-full bg-inset border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none resize-none placeholder-white/25" />
            </label>
            {err && <p className="text-xs text-red-400">{err}</p>}
            <button onClick={generate} disabled={!clientId} className="adlr-tap w-full py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-40" style={{ background: 'rgb(var(--adlr-gold))', color: '#000' }}>
              <Sparkles size={16} /> {t('Entwurf erstellen')}
            </button>
            <p className="text-[10px] text-white/30 text-center">{t('Die KI nutzt nur Übungen aus deiner Bibliothek. Der Klient sieht nichts, bis du zuweist.')}</p>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
