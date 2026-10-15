import { useEffect, useState } from 'react';
import { UserCheck, Check } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { Card } from '@/components/ui';
import { t, fmtDate } from '@/lib/i18n';

interface Unassigned { id: string; first_name: string | null; last_name: string | null; email: string | null; created_at: string; intake_completed: boolean; goal: string | null }
interface TrainerRow { id: string; first_name: string | null; last_name: string | null; email: string | null; clients: number }

const trainerName = (tr: TrainerRow) => [tr.first_name, tr.last_name].filter(Boolean).join(' ') || tr.email?.split('@')[0] || '—';

/** Master trainer (Übersicht): clients who signed up without an invite code, assignable to any trainer. */
export default function MasterAssignCard({ onAssigned }: { onAssigned?: () => void }) {
  const { profile } = useAuth();
  const [clients, setClients] = useState<Unassigned[] | null>(null);
  const [trainers, setTrainers] = useState<TrainerRow[]>([]);
  const [pick, setPick] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    const [c, tr] = await Promise.all([supabase.rpc('master_unassigned_clients'), supabase.rpc('master_trainers')]);
    if (c.error || tr.error) { setClients([]); return; } // not master / migration missing → card stays hidden
    setClients((c.data ?? []) as Unassigned[]);
    setTrainers((tr.data ?? []) as TrainerRow[]);
  };
  useEffect(() => { load(); }, [profile?.id]);

  const assign = async (client: Unassigned) => {
    const trainerId = pick[client.id] ?? profile?.id;
    if (!trainerId) return;
    setBusy(client.id); setErr(null);
    const { data, error } = await supabase.rpc('master_assign_client', { p_client: client.id, p_trainer: trainerId });
    setBusy(null);
    if (error || data !== true) { setErr(t('Zuweisen fehlgeschlagen. Bitte erneut versuchen.')); return; }
    const tr = trainers.find((x) => x.id === trainerId);
    setDone((d) => ({ ...d, [client.id]: tr ? trainerName(tr) : '' }));
    setTimeout(() => { setClients((list) => (list ?? []).filter((x) => x.id !== client.id)); onAssigned?.(); }, 1200);
  };

  if (!clients || (clients.length === 0 && Object.keys(done).length === 0)) return null;

  return (
    <Card className="mb-4 adlr-gold-border">
      <div className="flex items-center gap-3 mb-1">
        <UserCheck size={18} className="text-adlr-gold" />
        <p className="text-sm font-medium text-white/80">{t('Ohne Coach')}</p>
        <span className="ml-auto text-adlr-gold font-bold">{clients.length}</span>
      </div>
      <p className="text-xs text-white/45 mb-3">{t('Neu registriert ohne Einladungscode. Weise sie einem Trainer zu.')}</p>
      <div className="space-y-2.5">
        {clients.map((c) => {
          const name = [c.first_name, c.last_name].filter(Boolean).join(' ') || c.email || t('Unbekannt');
          const selected = pick[c.id] ?? profile?.id ?? '';
          return (
            <div key={c.id} className="rounded-xl p-3" style={{ background: 'rgb(var(--text) / 0.04)', border: '1px solid rgb(var(--text) / 0.07)' }}>
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm font-semibold text-white truncate">{name}</p>
                <span className="text-[11px] text-white/35 shrink-0">{fmtDate(c.created_at, { day: '2-digit', month: '2-digit' })}</span>
              </div>
              <p className="text-xs text-white/45 truncate">
                {c.email && c.email !== name ? `${c.email} · ` : ''}{c.goal ? t(c.goal) : c.intake_completed ? t('Intake ausgefüllt') : t('Intake offen')}
              </p>
              {done[c.id] !== undefined ? (
                <p className="text-xs text-green-500 mt-2 flex items-center gap-1.5"><Check size={13} /> {t('Zugewiesen an {name}', { name: done[c.id] })}</p>
              ) : (
                <>
                  <div className="flex flex-wrap gap-1.5 mt-2.5">
                    {trainers.map((tr) => {
                      const on = selected === tr.id;
                      return (
                        <button key={tr.id} onClick={() => setPick((p) => ({ ...p, [c.id]: tr.id }))} className="adlr-tap px-2.5 py-1.5 rounded-lg text-xs border"
                          style={on ? { background: 'rgb(var(--adlr-gold))', color: '#000', borderColor: 'rgb(var(--adlr-gold))', fontWeight: 600 } : { color: 'rgb(var(--text) / 0.7)', borderColor: 'rgb(var(--text) / 0.12)' }}>
                          {trainerName(tr)}{tr.id === profile?.id ? ` (${t('ich')})` : ''} · {tr.clients}
                        </button>
                      );
                    })}
                  </div>
                  <button onClick={() => assign(c)} disabled={busy === c.id || !selected} className="adlr-tap w-full mt-2.5 py-2 rounded-xl text-sm font-semibold disabled:opacity-50"
                    style={{ background: 'rgb(var(--adlr-gold) / 0.15)', color: 'rgb(var(--adlr-gold))', border: '1px solid rgb(var(--adlr-gold) / 0.35)' }}>
                    {busy === c.id ? '…' : t('Zuweisen')}
                  </button>
                </>
              )}
            </div>
          );
        })}
      </div>
      {err && <p className="text-xs text-red-400 mt-2">{err}</p>}
    </Card>
  );
}
