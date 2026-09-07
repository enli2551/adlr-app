import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import type { Profile, UpsellRequest, BusinessRevenue, Session } from '@/lib/types';
import { SectionHeader, Loading, StatCard, Card, Button, Input, Field } from '@/components/ui';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { Check, X, Plus } from 'lucide-react';

const UPGRADE_LABELS: Record<string, { name: string; price: number }> = {
  nutrition: { name: 'Ernährungs-Analyse', price: 49 },
  body: { name: 'Körperanalyse Session', price: 29 },
  extra: { name: 'Extra Session', price: 65 },
  checkin: { name: 'Check-in Call', price: 39 },
  transformation: { name: 'Transformation Paket', price: 0 },
};

export default function BusinessScreen() {
  const { profile } = useAuth();
  const [clients, setClients] = useState<Profile[]>([]);
  const [upsells, setUpsells] = useState<(UpsellRequest & { profiles?: { first_name: string; last_name: string } })[]>([]);
  const [revenue, setRevenue] = useState<BusinessRevenue[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRev, setShowRev] = useState(false);
  const [revForm, setRevForm] = useState({ amount: '', source: '', note: '' });

  const load = async () => {
    if (!profile) return;
    setLoading(true);
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
    const [c, u, r, s] = await Promise.all([
      supabase.from('profiles').select('*').eq('role', 'client').eq('trainer_id', profile.id),
      supabase.from('upsell_requests').select('*, profiles(first_name,last_name)').order('created_at', { ascending: false }),
      supabase.from('business_revenue').select('*').eq('trainer_id', profile.id).order('month_date', { ascending: false }),
      supabase.from('sessions').select('*').eq('trainer_id', profile.id).gte('scheduled_at', monthStart.toISOString()),
    ]);
    setClients((c.data ?? []) as Profile[]);
    setUpsells((u.data ?? []) as unknown as (UpsellRequest & { profiles?: { first_name: string; last_name: string } })[]);
    setRevenue((r.data ?? []) as BusinessRevenue[]);
    setSessions((s.data ?? []) as Session[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, [profile?.id]);

  const updateUpsell = async (id: string, status: 'completed' | 'declined') => {
    await supabase.from('upsell_requests').update({ status }).eq('id', id);
    load();
  };

  const addRevenue = async () => {
    if (!profile || !revForm.amount) return;
    await supabase.from('business_revenue').insert({
      trainer_id: profile.id, amount: Number(revForm.amount), source: revForm.source, note: revForm.note,
    });
    setRevForm({ amount: '', source: '', note: '' });
    setShowRev(false);
    load();
  };

  if (loading) return <Loading />;

  const monthRevenue = revenue.filter((r) => new Date(r.month_date).getMonth() === new Date().getMonth()).reduce((a, r) => a + Number(r.amount), 0);
  const pendingUpsells = upsells.filter((u) => u.status === 'pending');
  const completedUpsells = upsells.filter((u) => u.status === 'completed');

  // Sessions per week (last 4 weeks)
  const weeksData = [...Array(4)].map((_, i) => {
    const start = new Date(); start.setDate(start.getDate() - start.getDay() + 1 - (3 - i) * 7); start.setHours(0, 0, 0, 0);
    const end = new Date(start); end.setDate(end.getDate() + 7);
    const count = sessions.filter((s) => { const d = new Date(s.scheduled_at); return d >= start && d < end; }).length;
    return { woche: `KW ${start.toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit' })}`, sessions: count };
  });

  return (
    <div className="adlr-fade-in">
      <SectionHeader title="Business" subtitle="Deine Zahlen." />

      <div className="grid grid-cols-2 gap-3 mb-5">
        <StatCard label="Aktive Klienten" value={clients.length} accent />
        <StatCard label="Sessions (Monat)" value={sessions.length} />
        <StatCard label="Upsells offen" value={pendingUpsells.length} />
        <StatCard label="Umsatz (Monat)" value={`€${monthRevenue}`} accent />
      </div>

      {/* Sessions chart */}
      <Card className="mb-5">
        <p className="text-sm font-medium text-white/80 mb-4">Sessions pro Woche</p>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={weeksData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
            <Bar dataKey="sessions" fill="rgb(var(--adlr-gold))" radius={[4, 4, 0, 0]} />
            <XAxis dataKey="woche" stroke="rgb(var(--text) / 0.25)" fontSize={9} tickLine={false} axisLine={false} />
            <YAxis stroke="rgb(var(--text) / 0.25)" fontSize={10} tickLine={false} axisLine={false} allowDecimals={false} />
            <Tooltip contentStyle={{ background: 'rgb(var(--adlr-anthracite))', border: '1px solid rgb(var(--text) / 0.12)', borderRadius: 8, fontSize: 12 }} cursor={{ fill: 'rgb(var(--text) / 0.06)' }} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* Upsell requests */}
      <Card className="mb-5">
        <p className="text-sm font-medium text-white/80 mb-3">Upsell-Anfragen</p>
        {upsells.length === 0 ? (
          <p className="text-sm text-white/30">Keine Anfragen.</p>
        ) : (
          <div className="space-y-3">
            {upsells.map((u) => {
              const info = UPGRADE_LABELS[u.upgrade_key];
              return (
                <div key={u.id} className={`flex items-center justify-between p-3 rounded-xl border ${u.status === 'pending' ? 'adlr-gold-border bg-adlr-gold/5' : 'border-white/5 bg-white/5'}`}>
                  <div>
                    <p className="text-sm text-white/90">{u.profiles?.first_name} {u.profiles?.last_name}</p>
                    <p className="text-xs text-adlr-gold/80">{info?.name ?? u.upgrade_key} {info?.price ? `· €${info.price}` : ''}</p>
                  </div>
                  {u.status === 'pending' ? (
                    <div className="flex gap-1">
                      <button onClick={() => updateUpsell(u.id, 'completed')} className="adlr-tap w-8 h-8 rounded-lg bg-adlr-gold/10 border border-adlr-gold/30 text-adlr-gold flex items-center justify-center"><Check size={14} /></button>
                      <button onClick={() => updateUpsell(u.id, 'declined')} className="adlr-tap w-8 h-8 rounded-lg bg-white/5 border border-white/10 text-white/40 flex items-center justify-center"><X size={14} /></button>
                    </div>
                  ) : (
                    <span className={`text-xs ${u.status === 'completed' ? 'text-adlr-gold' : 'text-red-400/60'}`}>{u.status === 'completed' ? 'Erledigt' : 'Abgelehnt'}</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Revenue */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-medium text-white/80">Umsatz-Tracker</p>
          <button onClick={() => setShowRev(!showRev)} className="text-adlr-gold text-sm flex items-center gap-1 adlr-tap"><Plus size={14} /> Eintrag</button>
        </div>
        {showRev && (
          <div className="mb-4 space-y-2 adlr-fade-in">
            <div className="grid grid-cols-2 gap-2">
              <Field label="Betrag (€)"><Input type="number" value={revForm.amount} onChange={(e) => setRevForm({ ...revForm, amount: e.target.value })} /></Field>
              <Field label="Quelle"><Input value={revForm.source} onChange={(e) => setRevForm({ ...revForm, source: e.target.value })} placeholder="z.B. Training" /></Field>
            </div>
            <Input value={revForm.note} onChange={(e) => setRevForm({ ...revForm, note: e.target.value })} placeholder="Notiz (optional)" />
            <Button onClick={addRevenue} className="w-full">Hinzufügen</Button>
          </div>
        )}
        {revenue.length > 0 ? (
          <div className="space-y-2">
            {revenue.slice(0, 8).map((r) => (
              <div key={r.id} className="flex justify-between text-sm py-2 border-b border-white/5 last:border-0">
                <div>
                  <p className="text-white/80">{r.source ?? 'Umsatz'}</p>
                  <p className="text-xs text-white/30">{new Date(r.month_date).toLocaleDateString('de-AT')}</p>
                </div>
                <span className="text-adlr-gold font-bold">€{r.amount}</span>
              </div>
            ))}
          </div>
        ) : <p className="text-sm text-white/30">Noch keine Umsätze eingetragen.</p>}
      </Card>
    </div>
  );
}
