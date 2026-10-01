import type { Profile, Session, BusinessRevenue } from '@/lib/types';
import { localDateKey } from '@/lib/dates';
import { fmtNum, fmtDate, t } from '@/lib/i18n';

export type PackageKind = 'single' | 'pack' | 'subscription';

export interface Package {
  id: string;
  trainer_id: string;
  name: string;
  kind: PackageKind;
  price: number;
  sessions_included: number | null;
  validity_weeks: number | null;
  active: boolean;
  /** Shown to clients on the Coach tab (migration 20261002). */
  description?: string | null;
  show_to_clients?: boolean;
  created_at: string;
}

export interface ClientPackage {
  id: string;
  client_id: string;
  trainer_id: string;
  package_id: string | null;
  name: string;
  kind: PackageKind;
  price: number;
  sessions_total: number | null;
  start_date: string; // YYYY-MM-DD
  end_date: string | null;
  status: 'active' | 'finished' | 'cancelled';
  created_at: string;
}

export interface Payment {
  id: string;
  trainer_id: string;
  client_id: string;
  client_package_id: string | null;
  amount: number;
  paid_at: string; // YYYY-MM-DD
  method: string | null;
  note: string | null;
  created_at: string;
}

export const KIND_LABEL: Record<PackageKind, string> = {
  single: 'Einzeltraining',
  pack: 'Paket',
  subscription: 'Monatsabo',
};

export const fmtEUR = (n: number) => fmtNum(Math.round(n * 100) / 100, { style: 'currency', currency: 'EUR', maximumFractionDigits: n % 1 === 0 ? 0 : 2 });

const DAY = 86400000;
const todayKey = () => localDateKey(new Date());

/** PT sessions of this client that count against the package: not cancelled, already happened, inside its period. */
export function sessionsUsed(cp: ClientPackage, sessions: Session[], now = new Date()): number {
  const nowIso = now.toISOString();
  return sessions.filter((s) => {
    if (s.client_id !== cp.client_id || s.status === 'cancelled' || s.scheduled_at > nowIso) return false;
    const k = localDateKey(s.scheduled_at);
    return k >= cp.start_date && (!cp.end_date || k <= cp.end_date);
  }).length;
}

/** Months started since start_date (incl. the current one), capped at end_date. */
function monthsStarted(cp: ClientPackage, now = new Date()): number {
  const start = new Date(`${cp.start_date}T12:00:00`);
  const endRef = cp.end_date && cp.end_date < todayKey() ? new Date(`${cp.end_date}T12:00:00`) : now;
  if (endRef < start) return 0;
  return (endRef.getFullYear() - start.getFullYear()) * 12 + (endRef.getMonth() - start.getMonth()) + 1;
}

/** What the client owes for this package so far (independent of payments). */
export function amountDue(cp: ClientPackage, sessions: Session[], now = new Date()): number {
  if (cp.status === 'cancelled') return 0;
  switch (cp.kind) {
    case 'pack': return cp.price;
    case 'subscription': return cp.price * monthsStarted(cp, now);
    case 'single': return cp.price * sessionsUsed(cp, sessions, now);
  }
}

export function paidFor(cp: ClientPackage, payments: Payment[]): number {
  return payments.filter((p) => p.client_package_id === cp.id).reduce((s, p) => s + Number(p.amount), 0);
}

export interface PackageState {
  cp: ClientPackage;
  used: number;
  left: number | null;       // sessions left (packs only)
  daysLeft: number | null;   // until end_date
  due: number;
  paid: number;
  open: number;              // due - paid (>0 = client owes money)
}

export function packageState(cp: ClientPackage, sessions: Session[], payments: Payment[], now = new Date()): PackageState {
  const used = sessionsUsed(cp, sessions, now);
  const due = amountDue(cp, sessions, now);
  const paid = paidFor(cp, payments);
  return {
    cp,
    used,
    left: cp.kind === 'pack' && cp.sessions_total != null ? Math.max(0, cp.sessions_total - used) : null,
    daysLeft: cp.end_date ? Math.ceil((new Date(`${cp.end_date}T23:59:59`).getTime() - now.getTime()) / DAY) : null,
    due,
    paid,
    open: Math.round((due - paid) * 100) / 100,
  };
}

export type ActionKind = 'unpaid' | 'pack_low' | 'expiring' | 'no_package';
export interface BusinessAction {
  kind: ActionKind;
  client: Profile;
  text: string;
  amount?: number;
  severity: number;
}

export interface BusinessOverview {
  revenueThisMonth: number;
  revenueLastMonth: number;
  openTotal: number;
  recurringMonthly: number;       // active subscriptions per month
  avgPerClient90d: number;        // payments of the last 90 days / paying clients
  months: { key: string; label: string; amount: number }[]; // last 6 months incl. current
  perClient: { client: Profile; total: number; last90: number; active: PackageState[]; open: number }[];
  actions: BusinessAction[];
  states: PackageState[];
}

const monthKey = (d: string | Date) => localDateKey(d).slice(0, 7);

export function computeBusiness(
  clients: Profile[],
  cps: ClientPackage[],
  payments: Payment[],
  sessions: Session[],
  legacy: BusinessRevenue[] = [],
  now = new Date(),
): BusinessOverview {
  const states = cps.map((cp) => packageState(cp, sessions, payments, now));
  const thisMonth = monthKey(now);
  const lm = new Date(now.getFullYear(), now.getMonth() - 1, 15);
  const lastMonth = monthKey(lm);

  // Revenue per month: recorded payments + the older manual "Umsatz-Tracker" entries
  const byMonth = new Map<string, number>();
  for (const p of payments) byMonth.set(p.paid_at.slice(0, 7), (byMonth.get(p.paid_at.slice(0, 7)) ?? 0) + Number(p.amount));
  for (const r of legacy) byMonth.set(r.month_date.slice(0, 7), (byMonth.get(r.month_date.slice(0, 7)) ?? 0) + Number(r.amount));
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 15);
    const key = monthKey(d);
    return { key, label: fmtDate(d, { month: 'short' }), amount: byMonth.get(key) ?? 0 };
  });

  const since90 = localDateKey(new Date(now.getTime() - 90 * DAY));
  const pay90 = payments.filter((p) => p.paid_at >= since90);
  const payingClients = new Set(pay90.map((p) => p.client_id)).size;

  const activeStates = states.filter((s) => s.cp.status === 'active');
  const perClient = clients.map((c) => {
    const mine = payments.filter((p) => p.client_id === c.id);
    const st = states.filter((s) => s.cp.client_id === c.id);
    return {
      client: c,
      total: mine.reduce((s, p) => s + Number(p.amount), 0),
      last90: mine.filter((p) => p.paid_at >= since90).reduce((s, p) => s + Number(p.amount), 0),
      active: st.filter((s) => s.cp.status === 'active'),
      open: st.reduce((s, x) => s + Math.max(0, x.open), 0),
    };
  }).sort((a, b) => b.total - a.total);

  // What the trainer should do today
  const actions: BusinessAction[] = [];
  const name = (c: Profile) => c.first_name?.trim() || t('Klient');
  const byClient = new Map(clients.map((c) => [c.id, c]));
  for (const s of activeStates) {
    const c = byClient.get(s.cp.client_id);
    if (!c) continue;
    if (s.open > 0) actions.push({ kind: 'unpaid', client: c, amount: s.open, severity: 60, text: t('{name}: {amount} offen ({pkg})', { name: name(c), amount: fmtEUR(s.open), pkg: s.cp.name }) });
    if (s.left != null && s.left <= 2) actions.push({ kind: 'pack_low', client: c, severity: 50, text: s.left === 0 ? t('{name}: Paket aufgebraucht — Verlängerung anbieten', { name: name(c) }) : s.left === 1 ? t('{name}: nur noch 1 Einheit im Paket', { name: name(c) }) : t('{name}: nur noch {n} Einheiten im Paket', { name: name(c), n: s.left }) });
    if (s.daysLeft != null && s.daysLeft <= 14) actions.push({ kind: 'expiring', client: c, severity: 40, text: s.daysLeft < 0 ? t('{name}: Paket abgelaufen', { name: name(c) }) : t('{name}: Paket läuft in {n} Tagen ab', { name: name(c), n: s.daysLeft }) });
  }
  for (const c of clients) {
    if (!activeStates.some((s) => s.cp.client_id === c.id)) actions.push({ kind: 'no_package', client: c, severity: 20, text: t('{name}: kein aktives Paket', { name: name(c) }) });
  }
  actions.sort((a, b) => b.severity - a.severity);

  return {
    revenueThisMonth: byMonth.get(thisMonth) ?? 0,
    revenueLastMonth: byMonth.get(lastMonth) ?? 0,
    openTotal: states.reduce((s, x) => s + (x.cp.status === 'active' ? Math.max(0, x.open) : 0), 0),
    recurringMonthly: activeStates.filter((s) => s.cp.kind === 'subscription').reduce((sum, s) => sum + s.cp.price, 0),
    avgPerClient90d: payingClients ? pay90.reduce((s, p) => s + Number(p.amount), 0) / payingClients : 0,
    months,
    perClient,
    actions,
    states,
  };
}

/** Default end date for a package started today. */
export function defaultEndDate(pkg: Pick<Package, 'validity_weeks'>, start = todayKey()): string | null {
  if (!pkg.validity_weeks) return null;
  const d = new Date(`${start}T12:00:00`);
  d.setDate(d.getDate() + pkg.validity_weeks * 7);
  return localDateKey(d);
}
