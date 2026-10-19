import { useEffect, useState } from 'react';
import { UserCheck, Check, EyeOff, Eye } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { Card } from '@/components/ui';
import { t, fmtDate } from '@/lib/i18n';

interface Unassigned { id: string; first_name: string | null; last_name: string | null; email: string | null; created_at: string; intake_completed: boolean; goal: string | null; hidden?: boolean }
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
  const [showHidden, setShowHidden] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [canHide, setCanHide] = useState(true);
  // Hide = stays out of this list on every device (migration 20261019_master_hide.sql)
  const setHidden = async (c: Unassigned, hidden: boolean) => {
    setClients((list) => (list ?? []).map((x) => (x.id === c.id ? { ...x, hidden } : x)));
    const { error } = await supabase.rpc('master_set_hidden', { p_client: c.id, p_hidden: hidden });
    if (error) { setCanHide(false); setClients((list) => (list ?? []).map((x) => (x.id === c.id ? { ...x, hidden: !hidden } : x))); setErr(t('Ausblenden braucht die Migration 20261019_master_hide.sql.')); }
  };

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
  const visible = clients.filter((c) => showHidden || !c.hidden || done[c.id] !== undefined);
  const hiddenCount = clients.filter((c) => c.hidden).length;
  const openCount = clients.length - hiddenCount;
  if (openCount === 0 && !showHidden && Object.keys(done).length === 0) {
    return (
      <button onClick={() => setShowHidden(true)} className="adlr-tap w-full mb-4 text-left text-xs text-white/35 flex items-center gap-1.5 px-1">
        <EyeOff size={12} /> {t('{n} ausgeblendete Anmeldungen ohne Coach', { n: hiddenCount })}
      </button>
    );
  }
  const shown = showAll ? visible : visible.slice(0, 2);

  return (
    <Card className="mb-4 adlr-gold-border">
      <div className="flex items-center gap-3 mb-1">
        <UserCheck size={18} className="text-adlr-gold" />
        <p className="text-sm font-medium text-white/80">{t('Ohne Coach')}</p>
        <span className="ml-auto text-adlr-gold font-bold">{openCount}</span>
      </div>
      <p className="text-xs text-white/45 mb-3">{t('Neu registriert ohne Einladungscode. Weise sie einem Trainer zu.')}</p>
      <div className="space-y-2.5">
        {shown.map((c) => {
          const name = [c.first_name, c.last_name].filter(Boolean).join(' ') || c.email || t('Unbekannt');
          const selected = pick[c.id] ?? profile?.id ?? '';
          return (
            <div key={c.id} className="rounded-xl p-3" style={{ background: 'rgb(var(--text) / 0.04)', border: '1px solid rgb(var(--text) / 0.07)' }}>
              <div className="flex items-center justify-between gap-2">
                <p className={`text-sm font-semibold truncate ${c.hidden ? 'text-white/45' : 'text-white'}`}>{name}</p>
                <span className="flex items-center gap-2 shrink-0">
                  <span className="text-[11px] text-white/35">{fmtDate(c.created_at, { day: '2-digit', month: '2-digit' })}</span>
                  {canHide && done[c.id] === undefined && (
                    <button onClick={() => setHidden(c, !c.hidden)} className="adlr-tap flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-white/45 bg-white/5" aria-label={c.hidden ? t('Wieder anzeigen') : t('Ausblenden')}>
                      {c.hidden ? <><Eye size={12} /> {t('Wieder anzeigen')}</> : <><EyeOff size={12} /> {t('Ausblenden')}</>}
                    </button>
                  )}
                </span>
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
      <div className="flex items-center justify-between mt-2.5">
        {visible.length > 2 ? (
          <button onClick={() => setShowAll(!showAll)} className="adlr-tap text-xs font-medium text-adlr-gold">{showAll ? t('Weniger anzeigen') : t('Alle {n} anzeigen', { n: visible.length })}</button>
        ) : <span />}
        {hiddenCount > 0 && (
          <button onClick={() => setShowHidden(!showHidden)} className="adlr-tap text-xs text-white/40 flex items-center gap-1">
            {showHidden ? <><EyeOff size={12} /> {t('Ausgeblendete verbergen')}</> : <><Eye size={12} /> {t('{n} ausgeblendet', { n: hiddenCount })}</>}
          </button>
        )}
      </div>
      {err && <p className="text-xs text-red-400 mt-2">{err}</p>}
    </Card>
  );
}
