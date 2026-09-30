import { useEffect, useState } from 'react';
import { Ticket } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { t, fmtDate } from '@/lib/i18n';
import type { Session } from '@/lib/types';
import { sessionsUsed, KIND_LABEL, type ClientPackage } from '@/lib/business';

/** Client Profil: "your package" — sessions left and validity (no prices/payments shown). */
export default function MyPackageCard({ clientId }: { clientId: string }) {
  const [cps, setCps] = useState<ClientPackage[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from('client_packages').select('*').eq('client_id', clientId).eq('status', 'active');
      if (error || !data?.length) return;
      setCps(data as ClientPackage[]);
      const { data: ss } = await supabase.from('sessions').select('*').eq('client_id', clientId);
      setSessions((ss ?? []) as Session[]);
    })();
  }, [clientId]);

  if (cps.length === 0) return null;
  return (
    <div className="adlr-card p-5 mb-5">
      <p className="text-sm font-medium text-white/80 flex items-center gap-2 mb-3"><Ticket size={16} className="text-adlr-gold" /> {t('Dein Paket')}</p>
      {cps.map((cp) => {
        const used = sessionsUsed(cp, sessions);
        const left = cp.kind === 'pack' && cp.sessions_total != null ? Math.max(0, cp.sessions_total - used) : null;
        return (
          <div key={cp.id} className="mb-2 last:mb-0">
            <div className="flex items-baseline justify-between">
              <p className="text-sm font-semibold text-white">{cp.name}</p>
              <span className="text-[11px] text-white/40">{t(KIND_LABEL[cp.kind])}</span>
            </div>
            {left != null && cp.sessions_total ? (
              <>
                <p className="text-xs text-white/60 mt-1">{t('Noch {left} von {total} Einheiten', { left, total: cp.sessions_total })}</p>
                <div className="h-1.5 rounded-full bg-white/10 overflow-hidden mt-1.5">
                  <div className="h-full rounded-full bg-adlr-gold" style={{ width: `${(left / cp.sessions_total) * 100}%` }} />
                </div>
              </>
            ) : null}
            {cp.end_date && <p className="text-[11px] text-white/40 mt-1.5">{t('gültig bis {date}', { date: fmtDate(cp.end_date, { day: '2-digit', month: '2-digit', year: 'numeric' }) })}</p>}
          </div>
        );
      })}
    </div>
  );
}
