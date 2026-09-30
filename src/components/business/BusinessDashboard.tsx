import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ChevronRight, Wallet, PackageOpen, CalendarClock, UserX, TrendingUp, TrendingDown } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { t, fmtDate } from '@/lib/i18n';
import type { Profile, Session, BusinessRevenue } from '@/lib/types';
import { Loading } from '@/components/ui';
import PackageCatalog from '@/components/business/PackageCatalog';
import {
  computeBusiness, fmtEUR, KIND_LABEL,
  type Package, type ClientPackage, type Payment, type ActionKind,
} from '@/lib/business';

const ACTION_ICON: Record<ActionKind, typeof Wallet> = { unpaid: Wallet, pack_low: PackageOpen, expiring: CalendarClock, no_package: UserX };

/** Trainer Business tab: money in, money open, who needs a renewal, revenue per client, price list. */
export default function BusinessDashboard() {
  const { profile } = useAuth();
  const nav = useNavigate();
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [clients, setClients] = useState<Profile[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [cps, setCps] = useState<ClientPackage[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [legacy, setLegacy] = useState<BusinessRevenue[]>([]);
  const [showAllActions, setShowAllActions] = useState(false);
  const [showAllClients, setShowAllClients] = useState(false);

  const load = async () => {
    if (!profile) return;
    const [c, pk, cp, pay, ss, br] = await Promise.all([
      supabase.from('profiles').select('id, first_name, last_name, avatar_url, created_at, role, trainer_id').eq('role', 'client').eq('trainer_id', profile.id),
      supabase.from('packages').select('*').order('created_at'),
      supabase.from('client_packages').select('*'),
      supabase.from('payments').select('*').order('paid_at', { ascending: false }),
      supabase.from('sessions').select('*').eq('trainer_id', profile.id),
      supabase.from('business_revenue').select('*').eq('trainer_id', profile.id),
    ]);
    setMissing(!!(pk.error || cp.error || pay.error));
    setClients((c.data ?? []) as Profile[]);
    setPackages((pk.data ?? []) as Package[]);
    setCps((cp.data ?? []) as ClientPackage[]);
    setPayments((pay.data ?? []) as Payment[]);
    setSessions((ss.data ?? []) as Session[]);
    setLegacy((br.data ?? []) as BusinessRevenue[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, [profile?.id]);

  const b = useMemo(() => computeBusiness(clients, cps, payments, sessions, legacy), [clients, cps, payments, sessions, legacy]);
  if (loading) return <Loading />;

  const openClient = (id: string) => nav(`/trainer/klienten?client=${id}`);
  const trend = b.revenueLastMonth > 0 ? Math.round(((b.revenueThisMonth - b.revenueLastMonth) / b.revenueLastMonth) * 100) : null;
  const maxMonth = Math.max(1, ...b.months.map((m) => m.amount));
  const monthName = fmtDate(new Date(), { month: 'long' });
  const actions = showAllActions ? b.actions : b.actions.slice(0, 5);
  const perClient = showAllClients ? b.perClient : b.perClient.slice(0, 6);

  const Kpi = ({ label, value, sub, accent }: { label: string; value: string; sub?: React.ReactNode; accent?: boolean }) => (
    <div className="adlr-card p-4">
      <p className={`text-xl font-bold ${accent ? 'adlr-gold-text' : 'text-white'}`}>{value}</p>
      <p className="text-[10px] uppercase tracking-wider text-white/40 mt-0.5">{label}</p>
      {sub && <div className="text-[11px] mt-1">{sub}</div>}
    </div>
  );

  return (
    <div>
      {missing && (
        <div className="adlr-card p-4 mb-4" style={{ borderColor: 'rgba(251,146,60,0.4)' }}>
          <p className="text-sm text-orange-400 font-medium">{t('Datenbank-Update fehlt')}</p>
          <p className="text-xs text-white/50 mt-1">{t('Führe die Migration 20260928_business_packages.sql im Supabase SQL Editor aus, um Pakete und Zahlungen zu nutzen.')}</p>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <Kpi label={t('Umsatz · {month}', { month: monthName })} value={fmtEUR(b.revenueThisMonth)} accent
          sub={trend != null ? (
            <span className={`flex items-center gap-1 ${trend >= 0 ? 'text-green-500' : 'text-orange-400'}`}>
              {trend >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />} {trend >= 0 ? '+' : ''}{trend}% {t('vs. Vormonat')}
            </span>
          ) : null} />
        <Kpi label={t('Offene Beträge')} value={fmtEUR(b.openTotal)} sub={b.openTotal > 0 ? <span className="text-orange-400">{t('noch nicht bezahlt')}</span> : <span className="text-green-500">{t('alles bezahlt')}</span>} />
        <Kpi label={t('Abos pro Monat')} value={fmtEUR(b.recurringMonthly)} sub={<span className="text-white/40">{t('planbarer Umsatz')}</span>} />
        <Kpi label={t('Ø pro Klient · 90 Tage')} value={fmtEUR(b.avgPerClient90d)} sub={<span className="text-white/40">{t('zahlende Klienten')}</span>} />
      </div>

      {/* To do */}
      <div className="adlr-card p-5 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle size={16} className="text-adlr-gold" />
          <p className="text-sm font-medium text-white/80">{t('Handlungsbedarf')}</p>
          <span className="ml-auto text-adlr-gold font-bold text-sm">{b.actions.length}</span>
        </div>
        {b.actions.length === 0 ? <p className="text-sm text-white/40">{t('Alles erledigt — keine offenen Zahlungen oder Verlängerungen.')}</p> : (
          <div className="space-y-1.5">
            {actions.map((a, i) => {
              const Icon = ACTION_ICON[a.kind];
              return (
                <button key={i} onClick={() => openClient(a.client.id)} className="adlr-tap w-full flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left" style={{ background: 'rgb(var(--text) / 0.03)' }}>
                  <Icon size={15} className={a.severity >= 50 ? 'text-adlr-gold shrink-0' : 'text-white/45 shrink-0'} />
                  <span className="text-sm text-white/80 flex-1 min-w-0">{a.text}</span>
                  <ChevronRight size={14} className="text-white/25 shrink-0" />
                </button>
              );
            })}
            {b.actions.length > 5 && (
              <button onClick={() => setShowAllActions(!showAllActions)} className="adlr-tap w-full pt-1 text-xs font-medium text-adlr-gold">
                {showAllActions ? t('Weniger anzeigen') : t('Alle {n} anzeigen', { n: b.actions.length })}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Revenue trend */}
      <div className="adlr-card p-5 mb-4">
        <p className="text-sm font-medium text-white/80 mb-4">{t('Umsatz · letzte 6 Monate')}</p>
        <div className="flex items-end gap-2 h-32">
          {b.months.map((m, i) => (
            <div key={m.key} className="flex-1 flex flex-col items-center justify-end h-full gap-1">
              <span className="text-[10px] text-white/55">{m.amount ? fmtEUR(m.amount) : ''}</span>
              <div className="w-full rounded-md" style={{ height: `${Math.max(3, (m.amount / maxMonth) * 100)}%`, background: i === b.months.length - 1 ? 'rgb(var(--adlr-gold))' : 'rgb(var(--adlr-gold) / 0.35)' }} />
              <span className="text-[10px] text-white/40">{m.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Revenue per client */}
      <div className="adlr-card p-5 mb-4">
        <p className="text-sm font-medium text-white/80 mb-3">{t('Umsatz pro Klient')}</p>
        {b.perClient.length === 0 ? <p className="text-sm text-white/40">{t('Noch keine Klienten.')}</p> : (
          <div className="space-y-1.5">
            {perClient.map((r) => (
              <button key={r.client.id} onClick={() => openClient(r.client.id)} className="adlr-tap w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left" style={{ background: 'rgb(var(--text) / 0.03)' }}>
                <div className="w-8 h-8 rounded-full bg-adlr-gold/15 flex items-center justify-center text-adlr-gold text-xs font-bold overflow-hidden shrink-0">
                  {r.client.avatar_url ? <img src={r.client.avatar_url} alt="" className="w-full h-full object-cover" /> : (r.client.first_name?.[0] ?? '?').toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-white/85 truncate">{r.client.first_name} {r.client.last_name}</p>
                  <p className="text-[11px] text-white/40 truncate">
                    {r.active.length
                      ? r.active.map((s) => `${s.cp.name}${s.left != null ? ` · ${t('{n} übrig', { n: s.left })}` : ''}`).join(', ')
                      : t('kein aktives Paket')}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-white/90">{fmtEUR(r.total)}</p>
                  {r.open > 0 ? <p className="text-[11px] text-orange-400">{t('{amount} offen', { amount: fmtEUR(r.open) })}</p> : <p className="text-[11px] text-white/35">{t('90 T.: {amount}', { amount: fmtEUR(r.last90) })}</p>}
                </div>
              </button>
            ))}
            {b.perClient.length > 6 && (
              <button onClick={() => setShowAllClients(!showAllClients)} className="adlr-tap w-full pt-1 text-xs font-medium text-adlr-gold">
                {showAllClients ? t('Weniger anzeigen') : t('Alle {n} anzeigen', { n: b.perClient.length })}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Price list */}
      <div className="adlr-card p-5 mb-4">
        <PackageCatalog packages={packages} onChange={load} />
        {packages.length > 0 && (
          <p className="text-[11px] text-white/35 mt-3">
            {t('Aktive Pakete: {n}', { n: cps.filter((c) => c.status === 'active').length })}
            {' · '}{(Object.keys(KIND_LABEL) as (keyof typeof KIND_LABEL)[]).map((k) => `${t(KIND_LABEL[k])} ${cps.filter((c) => c.status === 'active' && c.kind === k).length}`).join(' · ')}
          </p>
        )}
      </div>
    </div>
  );
}
