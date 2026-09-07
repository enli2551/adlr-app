import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import type { Profile, UpsellRequest } from '@/lib/types';
import { SectionHeader, Loading, StatCard, Card } from '@/components/ui';
import { useNavigate } from 'react-router-dom';
import { Bell, Users, Calendar, TrendingUp } from 'lucide-react';

export default function OverviewScreen() {
  const { profile } = useAuth();
  const nav = useNavigate();
  const [clients, setClients] = useState<Profile[]>([]);
  const [upsells, setUpsells] = useState<UpsellRequest[]>([]);
  const [sessionsThisWeek, setSessionsThisWeek] = useState(0);
  const [sessionsThisMonth, setSessionsThisMonth] = useState(0);
  const [avgCheckin, setAvgCheckin] = useState('—');
  const [newClients, setNewClients] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (!profile) return;
      const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1); weekStart.setHours(0, 0, 0, 0);
      const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);

      const [c, u, s, wc, dc] = await Promise.all([
        supabase.from('profiles').select('*').eq('role', 'client').eq('trainer_id', profile.id).order('created_at', { ascending: false }),
        supabase.from('upsell_requests').select('*, profiles(first_name,last_name)').eq('status', 'pending').order('created_at', { ascending: false }),
        supabase.from('sessions').select('id, scheduled_at').eq('trainer_id', profile.id).gte('scheduled_at', weekStart.toISOString()),
        supabase.from('workout_completions').select('id, completed_at'),
        supabase.from('daily_checkins').select('energy, mood').gte('logged_at', weekStart.toISOString().slice(0, 10)),
      ]);

      const clientList = (c.data ?? []) as Profile[];
      setClients(clientList);
      setUpsells((u.data ?? []) as UpsellRequest[]);
      setSessionsThisWeek(s.data?.length ?? 0);
      const monthCount = (s.data ?? []).filter((x: { scheduled_at: string }) => new Date(x.scheduled_at) >= monthStart).length;
      setSessionsThisMonth(monthCount);
      setSessionsThisMonth((wc.data ?? []).filter((x: { completed_at: string }) => new Date(x.completed_at) >= monthStart).length);
      const checkins = dc.data ?? [];
      if (checkins.length > 0) {
        const avg = checkins.reduce((a: number, c: { energy: number; mood: number }) => a + c.energy + c.mood, 0) / (checkins.length * 2);
        setAvgCheckin(avg.toFixed(1));
      }
      setNewClients(clientList.slice(0, 3));
      setLoading(false);
    })();
  }, [profile?.id]);

  if (loading) return <Loading />;

  return (
    <div className="adlr-fade-in">
      <SectionHeader title="Übersicht" subtitle="Willkommen zurück, Peter." />
      <div className="grid grid-cols-2 gap-3 mb-5">
        <StatCard label="Aktive Klienten" value={clients.length} accent />
        <StatCard label="Sessions diese Woche" value={sessionsThisWeek} />
        <StatCard label="Sessions diesen Monat" value={sessionsThisMonth} />
        <StatCard label="Ø Check-in Score" value={`${avgCheckin}/5`} />
      </div>

      {/* Quick access: Klienten + Kalender (moved out of the bottom nav) */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <button
          onClick={() => nav('/trainer/klienten')}
          className="adlr-tap flex items-center gap-2.5 rounded-2xl px-4 py-3.5 border transition-all"
          style={{ background: 'rgb(var(--text) / 0.03)', borderColor: 'rgb(var(--text) / 0.07)' }}
        >
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgb(var(--adlr-gold) / 0.12)' }}>
            <Users size={17} className="text-adlr-gold" />
          </div>
          <span className="text-sm font-medium text-white/85">Klienten</span>
        </button>
        <button
          onClick={() => nav('/trainer/klienten?view=kalender')}
          className="adlr-tap flex items-center gap-2.5 rounded-2xl px-4 py-3.5 border transition-all"
          style={{ background: 'rgb(var(--text) / 0.03)', borderColor: 'rgb(var(--text) / 0.07)' }}
        >
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgb(var(--adlr-gold) / 0.12)' }}>
            <Calendar size={17} className="text-adlr-gold" />
          </div>
          <span className="text-sm font-medium text-white/85">Kalender</span>
        </button>
      </div>

      {/* Upsell requests */}
      <Card className="mb-4 adlr-gold-border" onClick={() => nav('/trainer/business')}>
        <div className="flex items-center gap-3 mb-3">
          <TrendingUp size={18} className="text-adlr-gold" />
          <p className="text-sm font-medium text-white/80">Upsell-Anfragen</p>
          <span className="ml-auto text-adlr-gold font-bold">{upsells.length}</span>
        </div>
        {upsells.length > 0 ? (
          <div className="space-y-2">
            {upsells.slice(0, 3).map((u) => (
              <div key={u.id} className="flex justify-between items-center text-sm">
                <span className="text-white/70">{(u as unknown as { profiles: { first_name: string; last_name: string } }).profiles?.first_name} will {u.upgrade_key}</span>
                <span className="text-xs text-adlr-gold">Offen</span>
              </div>
            ))}
          </div>
        ) : <p className="text-sm text-white/40">Keine offenen Anfragen.</p>}
      </Card>

      {/* New clients */}
      <Card onClick={() => nav('/trainer/klienten')}>
        <div className="flex items-center gap-3 mb-3">
          <Users size={18} className="text-adlr-gold" />
          <p className="text-sm font-medium text-white/80">Neue Klienten</p>
        </div>
        {newClients.length > 0 ? (
          <div className="space-y-2">
            {newClients.map((c) => (
              <div key={c.id} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-adlr-gold/20 border border-adlr-gold/30 flex items-center justify-center text-adlr-gold text-xs font-bold">
                  {(c.first_name?.[0] ?? '?').toUpperCase()}
                </div>
                <div className="flex-1">
                  <p className="text-sm text-white/80">{c.first_name} {c.last_name}</p>
                  <p className="text-xs text-white/40">{c.intake_completed ? 'Onboarding abgeschlossen' : 'Onboarding offen'}</p>
                </div>
                {c.intake_completed && <Bell size={14} className="text-adlr-gold" />}
              </div>
            ))}
          </div>
        ) : <p className="text-sm text-white/40">Noch keine Klienten.</p>}
      </Card>
    </div>
  );
}
