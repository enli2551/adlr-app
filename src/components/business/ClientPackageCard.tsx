import { useEffect, useMemo, useState } from 'react';
import { Wallet, Plus, Check, X, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { t, fmtDate } from '@/lib/i18n';
import { localDateKey } from '@/lib/dates';
import type { Session } from '@/lib/types';
import {
  KIND_LABEL, fmtEUR, packageState, defaultEndDate,
  type Package, type ClientPackage, type Payment,
} from '@/lib/business';

/** Trainer ClientDetail: what the client bought, how much is used/open, record payments. */
export default function ClientPackageCard({ clientId }: { clientId: string }) {
  const [packages, setPackages] = useState<Package[]>([]);
  const [cps, setCps] = useState<ClientPackage[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [missing, setMissing] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [assignForm, setAssignForm] = useState({ packageId: '', price: '', start: localDateKey(new Date()), end: '' });
  const [payFor, setPayFor] = useState<string | null>(null); // client_package id
  const [payForm, setPayForm] = useState({ amount: '', date: localDateKey(new Date()), method: 'Bar' });
  const [showHistory, setShowHistory] = useState(false);

  const load = async () => {
    const [pk, cp, pay, ss] = await Promise.all([
      supabase.from('packages').select('*').order('created_at'),
      supabase.from('client_packages').select('*').eq('client_id', clientId).order('start_date', { ascending: false }),
      supabase.from('payments').select('*').eq('client_id', clientId).order('paid_at', { ascending: false }),
      supabase.from('sessions').select('*').eq('client_id', clientId),
    ]);
    if (pk.error || cp.error) { setMissing(true); return; }
    setPackages((pk.data ?? []) as Package[]);
    setCps((cp.data ?? []) as ClientPackage[]);
    setPayments((pay.data ?? []) as Payment[]);
    setSessions((ss.data ?? []) as Session[]);
  };
  useEffect(() => { load(); }, [clientId]);

  const states = useMemo(() => cps.map((cp) => packageState(cp, sessions, payments)), [cps, sessions, payments]);
  const active = states.filter((s) => s.cp.status === 'active');
  const total = payments.reduce((s, p) => s + Number(p.amount), 0);

  const pickPackage = (id: string) => {
    const p = packages.find((x) => x.id === id);
    setAssignForm((f) => ({ ...f, packageId: id, price: p ? String(p.price) : '', end: p ? defaultEndDate(p, f.start) ?? '' : '' }));
  };
  const assign = async () => {
    const p = packages.find((x) => x.id === assignForm.packageId);
    if (!p) return;
    await supabase.from('client_packages').insert({
      client_id: clientId, package_id: p.id, name: p.name, kind: p.kind,
      price: Number(assignForm.price.replace(',', '.')) || p.price,
      sessions_total: p.sessions_included, start_date: assignForm.start, end_date: assignForm.end || null,
    });
    setAssigning(false);
    load();
  };
  const openPay = (cpId: string, suggested: number) => {
    setPayFor(cpId);
    setPayForm({ amount: suggested > 0 ? String(Math.round(suggested * 100) / 100) : '', date: localDateKey(new Date()), method: 'Bar' });
  };
  const pay = async () => {
    const amount = Number(payForm.amount.replace(',', '.'));
    if (!(amount > 0)) return;
    await supabase.from('payments').insert({ client_id: clientId, client_package_id: payFor, amount, paid_at: payForm.date, method: payForm.method });
    setPayFor(null);
    load();
  };
  const finish = async (cp: ClientPackage) => {
    await supabase.from('client_packages').update({ status: 'finished', end_date: cp.end_date ?? localDateKey(new Date()) }).eq('id', cp.id);
    load();
  };
  const deletePayment = async (id: string) => {
    await supabase.from('payments').delete().eq('id', id);
    load();
  };

  const input = 'w-full bg-inset border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none';
  const activePackages = packages.filter((p) => p.active);

  return (
    <div className="adlr-card p-5 mb-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-medium text-white/80 flex items-center gap-2"><Wallet size={16} className="text-adlr-gold" /> {t('Paket & Zahlungen')}</p>
        <span className="text-xs text-white/40">{t('gesamt {amount}', { amount: fmtEUR(total) })}</span>
      </div>

      {missing ? (
        <p className="text-xs text-white/40">{t('Migration „business_packages“ im Supabase SQL Editor ausführen.')}</p>
      ) : (
        <>
          {active.length === 0 && !assigning && <p className="text-sm text-white/40 mb-3">{t('Kein aktives Paket.')}</p>}
          {active.map((s) => (
            <div key={s.cp.id} className="rounded-xl p-3 mb-2" style={{ background: 'rgb(var(--text) / 0.04)' }}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{s.cp.name}</p>
                  <p className="text-[11px] text-white/40">
                    {t(KIND_LABEL[s.cp.kind])} · {fmtEUR(s.cp.price)}{s.cp.kind === 'subscription' ? t('/Mo') : s.cp.kind === 'single' ? t('/Einheit') : ''}
                    {' · '}{t('seit {date}', { date: fmtDate(s.cp.start_date, { day: '2-digit', month: '2-digit' }) })}
                    {s.cp.end_date ? ` · ${t('bis {date}', { date: fmtDate(s.cp.end_date, { day: '2-digit', month: '2-digit', year: '2-digit' }) })}` : ''}
                  </p>
                </div>
                <button onClick={() => finish(s.cp)} className="adlr-tap text-[11px] text-white/35 underline shrink-0">{t('beenden')}</button>
              </div>

              {s.cp.kind === 'pack' && s.cp.sessions_total ? (
                <div className="mt-2.5">
                  <div className="flex justify-between text-xs text-white/60 mb-1">
                    <span>{t('{used} von {total} Einheiten', { used: s.used, total: s.cp.sessions_total })}</span>
                    <span className={s.left! <= 2 ? 'text-orange-400 font-medium' : ''}>{t('{n} übrig', { n: s.left! })}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${Math.min(100, (s.used / s.cp.sessions_total) * 100)}%`, background: s.left! <= 2 ? '#fb923c' : 'rgb(var(--adlr-gold))' }} />
                  </div>
                </div>
              ) : s.cp.kind === 'single' ? (
                <p className="text-xs text-white/55 mt-2">{t('{n} Einheiten absolviert', { n: s.used })}</p>
              ) : null}

              <div className="flex items-center justify-between mt-2.5">
                <span className={`text-xs font-medium ${s.open > 0 ? 'text-orange-400' : 'text-green-500'}`}>
                  {s.open > 0 ? t('{amount} offen', { amount: fmtEUR(s.open) }) : t('bezahlt')}
                  <span className="text-white/35 font-normal"> · {t('{paid} von {due}', { paid: fmtEUR(s.paid), due: fmtEUR(s.due) })}</span>
                </span>
                {payFor !== s.cp.id && (
                  <button onClick={() => openPay(s.cp.id, s.open)} className="adlr-tap text-xs font-semibold text-adlr-gold flex items-center gap-1"><Plus size={12} /> {t('Zahlung')}</button>
                )}
              </div>

              {payFor === s.cp.id && (
                <div className="mt-2.5 space-y-2 adlr-fade-in">
                  <div className="grid grid-cols-2 gap-2">
                    <input className={input} inputMode="decimal" value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} placeholder="€" />
                    <input className={input} type="date" value={payForm.date} onChange={(e) => setPayForm({ ...payForm, date: e.target.value })} />
                  </div>
                  <div className="flex gap-1.5">
                    {['Bar', 'Überweisung', 'Karte'].map((m) => (
                      <button key={m} onClick={() => setPayForm({ ...payForm, method: m })} className="adlr-tap flex-1 py-1.5 rounded-lg text-xs border"
                        style={payForm.method === m ? { background: 'rgb(var(--adlr-gold))', color: '#000', borderColor: 'rgb(var(--adlr-gold))' } : { color: 'rgb(var(--text) / 0.6)', borderColor: 'rgb(var(--text) / 0.12)' }}>
                        {t(m)}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={pay} className="adlr-tap flex-1 py-2 rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5" style={{ background: 'rgb(var(--adlr-gold))', color: '#000' }}><Check size={14} /> {t('Zahlung erfassen')}</button>
                    <button onClick={() => setPayFor(null)} className="adlr-tap px-3 rounded-xl bg-white/5 text-white/50"><X size={14} /></button>
                  </div>
                </div>
              )}
            </div>
          ))}

          {assigning ? (
            <div className="rounded-xl p-3 space-y-2 adlr-fade-in" style={{ background: 'rgb(var(--text) / 0.04)' }}>
              {activePackages.length === 0 ? (
                <p className="text-xs text-white/45">{t('Lege zuerst unter Business → Preisliste ein Angebot an.')}</p>
              ) : (
                <>
                  <select className={input} value={assignForm.packageId} onChange={(e) => pickPackage(e.target.value)}>
                    <option value="">{t('Angebot wählen…')}</option>
                    {activePackages.map((p) => <option key={p.id} value={p.id}>{p.name} · {fmtEUR(p.price)}</option>)}
                  </select>
                  {assignForm.packageId && (
                    <div className="grid grid-cols-3 gap-2">
                      <label className="text-[10px] uppercase text-white/40">{t('Preis €')}<input className={input + ' mt-1'} inputMode="decimal" value={assignForm.price} onChange={(e) => setAssignForm({ ...assignForm, price: e.target.value })} /></label>
                      <label className="text-[10px] uppercase text-white/40">{t('Start')}<input className={input + ' mt-1'} type="date" value={assignForm.start} onChange={(e) => setAssignForm({ ...assignForm, start: e.target.value })} /></label>
                      <label className="text-[10px] uppercase text-white/40">{t('Ende')}<input className={input + ' mt-1'} type="date" value={assignForm.end} onChange={(e) => setAssignForm({ ...assignForm, end: e.target.value })} /></label>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button onClick={assign} disabled={!assignForm.packageId} className="adlr-tap flex-1 py-2 rounded-xl text-sm font-semibold disabled:opacity-40" style={{ background: 'rgb(var(--adlr-gold))', color: '#000' }}>{t('Zuweisen')}</button>
                    <button onClick={() => setAssigning(false)} className="adlr-tap px-4 py-2 rounded-xl text-sm bg-white/5 text-white/60">{t('Abbrechen')}</button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <button onClick={() => { setAssigning(true); setAssignForm({ packageId: '', price: '', start: localDateKey(new Date()), end: '' }); }}
              className="adlr-tap w-full py-2.5 rounded-xl text-sm font-medium border border-dashed text-adlr-gold flex items-center justify-center gap-1.5" style={{ borderColor: 'rgb(var(--adlr-gold) / 0.4)' }}>
              <Plus size={14} /> {active.length ? t('Weiteres Paket zuweisen') : t('Paket zuweisen')}
            </button>
          )}

          {payments.length > 0 && (
            <div className="mt-3">
              <button onClick={() => setShowHistory(!showHistory)} className="adlr-tap text-xs text-white/45">
                {showHistory ? t('Zahlungen ausblenden') : t('{n} Zahlungen anzeigen', { n: payments.length })}
              </button>
              {showHistory && (
                <div className="mt-2 space-y-1 adlr-fade-in">
                  {payments.map((p) => (
                    <div key={p.id} className="flex items-center justify-between text-xs px-1 py-1">
                      <span className="text-white/55">{fmtDate(p.paid_at, { day: '2-digit', month: '2-digit', year: '2-digit' })} · {p.method ? t(p.method) : '—'}{p.client_package_id ? ` · ${cps.find((c) => c.id === p.client_package_id)?.name ?? ''}` : ''}</span>
                      <span className="flex items-center gap-2">
                        <span className="text-white/85 font-medium">{fmtEUR(Number(p.amount))}</span>
                        <button onClick={() => deletePayment(p.id)} aria-label={t('Löschen')} className="adlr-tap text-white/25"><Trash2 size={12} /></button>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
